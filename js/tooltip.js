// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// Marked 配置
marked.setOptions({
  gfm: true, // 启用 GitHub Flavored Markdown
  breaks: true // 将换行符渲染为 <br>
});

// 全局变量，在 setupTooltips 外部定义，方便 hideTooltip 访问
let currentHideTimeout = null; // 用于控制工具提示隐藏的计时器

export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} - Check 'data/tooltips.json' path and content.`);
        }
        return await res.json();
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        return {};
    }
}

/**
 * 将 Markdown 文本中的关键词包装成带有 tooltip 的 span，并渲染 Markdown。
 * 核心逻辑：
 * 1. 首先处理自定义的 [[word|tooltipId]] 语法，生成带有特定 data-tooltip-id 的 span。
 * 2. 然后，对剩余的（没有被第一步处理的）普通单词，进行高频词字体大小计算和自动 tooltip 匹配。
 * 3. 最后，将处理后的字符串传递给 marked.parse 进行整体的 Markdown 渲染。
 * @param {string} md - 原始的 Markdown 文本。
 * @param {Object} tooltipData - 工具提示数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 最高词语频率。
 * @param {number} [baseFontSize=16] - 基础字体大小。
 * @param {number} [maxFontSizeIncrease=12] - 最大字体增大值。
 * @returns {string} - 渲染后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md,
    tooltipData,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    // 用于临时存储自定义 span 的唯一占位符
    const customSpanPlaceholders = {};
    let placeholderCounter = 0;

    // --- 步骤 1: 处理自定义 [[word|tooltipId]] 语法 ---
    // 这个正则表达式捕获：[[  (word) | (tooltipId) ]]
    const customTooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
    let mdWithCustomSpans = md.replace(customTooltipPattern, (match, word, tooltipId) => {
        const lowerWord = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        const placeholder = `__CUSTOM_SPAN_PLACEHOLDER_${placeholderCounter++}__`;
        // 为自定义工具提示词添加 class="word" 和 data-tooltip-id
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder;
    });

    // --- 步骤 2: 处理剩余的普通单词（高频词和自动 tooltip）---
    const tooltipWords = Object.keys(tooltipData);

    // 匹配单词，但不会匹配 HTML 标签内部的文本 (更通用的方法，不依赖复杂的 lookbehind/lookahead)
    // 思路：先将 HTML 标签内容替换为占位符，然后处理文本，再替换回来。
    // 但是，直接在 Markdown 字符串上操作会非常复杂且容易出错。
    // 更稳健的做法是：先用 marked.parse 转换为 HTML，然后用 DOMParser 解析 HTML，再遍历文本节点。
    // 但为了沿用你目前的字符串替换逻辑，我们尝试一个更简单的正则，并依赖后续的 DOM 处理。

    // 假设 Markdown 中没有复杂的嵌套 HTML，我们匹配单词并排除已处理的占位符和已是 HTML 标签的单词
    // 这里的正则表达式是简化的，如果你的 Markdown 中有大量内联 HTML，可能需要更复杂的方法
    // 匹配一个词的边界，并且这个词后面不能立即跟着 < 或后面不是 > 的非 < 字符（尝试避免匹配标签内部）
    // 最终，`marked.parse` 后再处理 DOM 节点会更稳健，但目前保持你字符串处理的思路。
    const regularWordPattern = /\b([a-zA-Z0-9'-]+)\b/g;

    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        // 如果这个匹配是我们的自定义占位符，则跳过
        if (customSpanPlaceholders[match]) {
            return match; // 保持占位符不变
        }

        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 只有当这个单词在 tooltipData 中有对应的条目时，才给它添加 data-tooltip-id 和 class="word"
        if (tooltipWords.includes(lowerMatch)) {
            // 如果这个词已经在自定义占位符中处理过，我们就不再包裹它
            return `<span data-tooltip-id="${lowerMatch}" class="word" style="${fontSizeStyle}">${match}</span>`;
        } else if (fontSizeStyle) {
            // 如果不是 tooltip 词，但因为高频而需要调整字体大小
            return `<span style="${fontSizeStyle}">${match}</span>`;
        }
        return match; // 否则，不作任何改变
    });

    // --- 步骤 3: 将自定义 span 的占位符替换回实际的 span ---
    Object.keys(customSpanPlaceholders).forEach(placeholder => {
        // 创建一个正则表达式来匹配占位符，并转义特殊字符
        const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        finalProcessedMd = finalProcessedMd.replace(regex, customSpanPlaceholders[placeholder]);
    });

    // --- 步骤 4: 渲染 Markdown ---
    // marked.parse 会将 Markdown 转换为 HTML，它会正确处理 `<span>` 标签。
    return marked.parse(finalProcessedMd);
}


export function setupTooltips(tooltipData) {
    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 移除所有旧的事件监听器，避免重复绑定
    // 使用 cloneNode(true) 替换元素以移除所有事件监听器，是最彻底的方法
    // 适用于动态加载内容，避免内存泄漏
    document.querySelectorAll('.word').forEach(oldSpan => {
        const newSpan = oldSpan.cloneNode(true); // 克隆一个完全相同的元素
        oldSpan.parentNode.replaceChild(newSpan, oldSpan); // 替换旧的元素
    });

    // 绑定新的事件监听器
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('mouseover', showTooltip);
        // mouseout 事件不再直接绑定到每个 span，而是通过 tooltipDiv 的 mouseleave 和 document 的 click 统一管理
    });

    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    document.addEventListener('click', (e) => {
        // 如果 tooltip 可见，并且点击的不是一个 .word 元素或 tooltip 容器本身
        if (tooltipDiv.classList.contains('visible') && !e.target.closest('.word') && !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    });

    // 确保鼠标移出 tooltip 后也隐藏
    tooltipDiv.addEventListener('mouseleave', hideTooltip);

    // 鼠标进入 tooltip 时取消隐藏计时器，防止在移动到 tooltip 上时被隐藏
    tooltipDiv.addEventListener('mouseenter', () => {
        clearTimeout(currentHideTimeout);
    });


    function showTooltip(e) {
        clearTimeout(currentHideTimeout); // 任何时候显示时都清除之前的隐藏计时器
        e.stopPropagation(); // 阻止事件冒泡到 document 的点击事件

        const wordId = e.target.dataset.tooltipId;
        const data = tooltipData[wordId]; // 从传入的 tooltipData 中获取数据

        if (data) {
            let htmlContent = '';

            // 标题 (通常是单词本身)
            if (data.title) {
                htmlContent += `<strong>${data.title}</strong><br>`;
            } else {
                // 假设 tooltipId 是 "word-partofspeech" 格式
                htmlContent += `<strong>${wordId.split('-')[0]}</strong><br>`;
            }

            // 词性
            if (data.partOfSpeech) {
                htmlContent += `<em>(${data.partOfSpeech})</em><br>`;
            }

            // 意思 (description)
            if (data.description) {
                htmlContent += `${data.description}<br>`;
            } else if (data.definition) { // 兼容 definition 字段
                htmlContent += `${data.definition}<br>`;
            }

            // 画面感 (Image Description)
            if (data["Image Description"]) {
                htmlContent += `<em>Image:</em> ${data["Image Description"]}<br>`;
            }

            // 例句
            if (data.example) {
                htmlContent += `<em>Example:</em> ${data.example}<br>`;
            }

            // 分类
            if (data.category) {
                htmlContent += `<em>Category:</em> ${data.category}`;
            }

            tooltipDiv.innerHTML = htmlContent;

            // 显示 tooltip (先设置 display: block 以获取尺寸)
            tooltipDiv.style.display = 'block';
            tooltipDiv.classList.add('visible'); // 添加 visible 类，触发 CSS 动画

            // 定位 tooltip
            const spanRect = e.target.getBoundingClientRect(); // 触发元素的尺寸和位置
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2); // 居中于触发词
            let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10; // 放在单词上方，留10px间距

            // 检查左边界
            if (left < scrollX + 10) { // 离左边缘太近
                left = scrollX + 10;
            }
            // 检查右边界
            if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) { // 离右边缘太近
                left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
            }

            // 检查上边界 (如果放在上方)
            if (top < scrollY + 10) { // 如果上方空间不足
                top = spanRect.bottom + scrollY + 10; // 则放在下方
            }

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;
        } else {
            console.warn(`Tooltip data not found for ID: ${wordId}`);
            hideTooltip(); // 如果没有数据，隐藏 tooltip
        }
    }

    function hideTooltip() {
        // 使用计时器延迟隐藏，允许用户将鼠标移到 tooltip 上
        currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible');
            // 等待 CSS 过渡完成再隐藏 display
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
            }, 300); // 应该与 CSS 中的 transition-duration 匹配
        }, 100); // 100ms 延迟
    }
}
