// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// Marked 配置，用于将 Markdown 文本转换为 HTML
marked.setOptions({
  gfm: true,     // 启用 GitHub Flavored Markdown
  breaks: true   // 将换行符渲染为 <br>
});

// --- 全局变量和状态管理 ---
// 用于控制工具提示隐藏的计时器，防止鼠标快速移动时闪烁
let currentHideTimeout = null;
// 存储当前正在显示 Tooltip 的那个单词的 span 元素，用于判断是否重复点击
let currentActiveTooltipSpan = null;
// 全局存储加载的工具提示数据，由 main.js 传入
let globalTooltipsData = {};

---

## Tooltip 数据加载

/**
 * 加载 tooltips.json 数据。
 * @returns {Promise<Object>} 包含工具提示数据的 Promise 对象。
 */
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} - Check 'data/tooltips.json' path and content.`);
        }
        globalTooltipsData = await res.json(); // 将加载的数据存入全局变量
        return globalTooltipsData;
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        return {};
    }
}

---

## Markdown 文本渲染与 Tooltip 标记

/**
 * 将 Markdown 文本转换为 HTML，并在此过程中为需要显示 Tooltip 的单词添加特殊标记。
 * 同时根据词频调整字体大小。
 * @param {string} md - 原始的 Markdown 文本。
 * @param {Object} tooltipData - 工具提示数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 最高词语频率。
 * @param {number} [baseFontSize=16] - 基础字体大小（px）。
 * @param {number} [maxFontSizeIncrease=12] - 最大字体增大值（px）。
 * @returns {string} - 渲染并标记后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md,
    tooltipData,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    // 用于临时存储自定义 span 的唯一占位符，避免在后续正则匹配中被再次处理
    const customSpanPlaceholders = {};
    let placeholderCounter = 0;

    // --- 步骤 1: 处理自定义 [[word|tooltipId]] 语法 ---
    // 匹配如 [[invention|invention-noun]] 这样的自定义语法
    const customTooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
    let mdWithCustomSpans = md.replace(customTooltipPattern, (match, word, tooltipId) => {
        const lowerWord = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 创建一个唯一的临时占位符，并将完整的 span HTML 存储起来
        const placeholder = `__CUSTOM_SPAN_PLACEHOLDER_${placeholderCounter++}__`;
        // 为自定义工具提示词添加 class="word" 和 data-tooltip-id，这两个是 Tooltip 触发的关键
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder; // 在原始 Markdown 中用占位符替换自定义语法
    });

    // --- 步骤 2: 处理剩余的普通单词（自动匹配 Tooltip 和词频高亮）---
    // 简化后的正则表达式，匹配所有单词边界的字母、数字、撇号和连字符。
    // 注意：这个简化版可能在某些复杂 HTML 结构中匹配到不需要的文本（例如 HTML 属性值）。
    // 更严谨的做法是先将 Markdown 转换为 DOM，再遍历 DOM 文本节点进行处理，但会复杂很多。
    const regularWordPattern = /\b([a-zA-Z0-9'-]+)\b/g;

    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        // 如果当前匹配项是我们在步骤 1 中创建的占位符，则不进行处理，直接返回
        if (customSpanPlaceholders[match]) {
            return match;
        }

        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 检查这个单词是否存在于加载的 Tooltip 数据中
        if (tooltipData.hasOwnProperty(lowerMatch)) {
            // 如果是 Tooltip 词，就用 class="word" 和 data-tooltip-id 包裹
            return `<span data-tooltip-id="${lowerMatch}" class="word" style="${fontSizeStyle}">${match}</span>`;
        } else if (fontSizeStyle) {
            // 如果不是 Tooltip 词，但因为高频需要调整字体大小，也用 span 包裹
            return `<span style="${fontSizeStyle}">${match}</span>`;
        }
        return match; // 否则，不作任何改变
    });

    // --- 步骤 3: 将自定义 span 的占位符替换回实际的 span HTML ---
    Object.keys(customSpanPlaceholders).forEach(placeholder => {
        // 创建正则表达式来匹配占位符，并转义特殊字符
        const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        finalProcessedMd = finalProcessedMd.replace(regex, customSpanPlaceholders[placeholder]);
    });

    // --- 步骤 4: 使用 Marked.js 渲染最终处理过的 Markdown 文本 ---
    return marked.parse(finalProcessedMd);
}

---

## Tooltip 事件设置与显示逻辑

/**
 * 设置工具提示的事件监听器。
 * 每次章节内容渲染后都需要调用此函数，以确保为新元素绑定事件。
 * @param {Object} tooltipData - 传入的工具提示数据（来自 main.js）。
 */
export function setupTooltips(tooltipData) {
    // 将传入的 tooltipData 存入全局变量，供 showTooltip 使用
    globalTooltipsData = tooltipData;

    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 移除所有旧的事件监听器，避免重复绑定。
    // 使用 cloneNode(true) 替换元素，这是最彻底的移除旧事件监听器的方法。
    document.querySelectorAll('.word').forEach(oldSpan => {
        const newSpan = oldSpan.cloneNode(true);
        oldSpan.parentNode.replaceChild(newSpan, oldSpan);
    });

    // 为所有带有 'word' 类的元素绑定点击事件
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('click', showTooltip); // 核心修改：改为 click 事件
    });

    // 绑定全局点击事件：当用户点击页面其他任何地方时，隐藏 Tooltip
    document.addEventListener('click', (e) => {
        // 如果 Tooltip 当前可见，并且点击的目标不是 Tooltip 触发词，也不是 Tooltip 容器本身，就隐藏 Tooltip
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') && // 点击的不是一个 .word 元素或其子元素
            !e.target.closest('#react-tooltips')) { // 点击的不是 Tooltip 容器或其子元素
            hideTooltip();
        }
    });

    // 鼠标离开 Tooltip 容器时，延迟隐藏 Tooltip (桌面端和某些模拟事件有用)
    tooltipDiv.addEventListener('mouseleave', () => {
        currentHideTimeout = setTimeout(() => {
            hideTooltip();
        }, 100); // 100ms 延迟，给用户将鼠标移到 Tooltip 上的时间
    });

    // 鼠标进入 Tooltip 容器时，取消任何正在进行的隐藏计时器
    tooltipDiv.addEventListener('mouseenter', () => {
        clearTimeout(currentHideTimeout);
    });

    /**
     * 显示工具提示的函数。
     * @param {Event} e - 点击事件对象。
     */
    function showTooltip(e) {
        clearTimeout(currentHideTimeout); // 任何时候显示时，都清除之前的隐藏计时器
        e.stopPropagation(); // 阻止事件冒泡到 document 的点击事件，防止立即被全局点击事件隐藏

        // 如果点击的是当前已经显示的 Tooltip 所对应的单词，则隐藏它
        if (currentActiveTooltipSpan === e.target) {
            hideTooltip();
            currentActiveTooltipSpan = null; // 清除当前激活的 span
            return; // 阻止再次显示
        }

        // 保存当前激活的 span 元素，用于判断是否重复点击
        currentActiveTooltipSpan = e.target;

        const wordId = e.target.dataset.tooltipId; // 获取触发 Tooltip 的单词 ID
        const data = globalTooltipsData[wordId]; // 从全局 Tooltip 数据中获取对应信息

        if (data) {
            let htmlContent = ''; // 用于构建 Tooltip 的 HTML 内容

            // --- 构建 Tooltip 内部的 HTML 内容 ---
            // 标题 (通常是单词本身)
            if (data.title) {
                htmlContent += `<strong>${data.title}</strong><br>`;
            } else {
                // 如果没有 title 字段，尝试从 wordId 中解析单词部分 (例如 "invention-noun" -> "invention")
                htmlContent += `<strong>${wordId.split('-')[0]}</strong><br>`;
            }

            // 词性 (partOfSpeech)
            if (data.partOfSpeech) {
                htmlContent += `<em>(${data.partOfSpeech})</em><br>`;
            }

            // 意思 (description 或 definition)
            if (data.description) {
                htmlContent += `${data.description}<br>`;
            } else if (data.definition) { // 兼容 "definition" 字段
                htmlContent += `${data.definition}<br>`;
            }

            // 画面感 (Image Description)
            if (data["Image Description"]) {
                htmlContent += `<em>Image:</em> ${data["Image Description"]}<br>`;
            }

            // 例句 (example)
            if (data.example) {
                htmlContent += `<em>Example:</em> ${data.example}<br>`;
            }

            // 分类 (category)
            if (data.category) {
                htmlContent += `<em>Category:</em> ${data.category}`;
            }

            tooltipDiv.innerHTML = htmlContent; // 将生成的内容放入 Tooltip 容器

            // --- 显示 Tooltip 并计算定位 ---
            // 先设置 display: block 以使元素可见，这样才能获取其正确的宽度和高度
            tooltipDiv.style.display = 'block';
            // 确保移除旧的定位信息，防止因快速切换导致的定位闪烁
            tooltipDiv.style.left = '0px';
            tooltipDiv.style.top = '0px';
            tooltipDiv.classList.add('visible'); // 添加 'visible' 类，触发 CSS 动画

            // 获取触发元素（单词）的尺寸和位置
            const spanRect = e.target.getBoundingClientRect();
            // 获取视口（浏览器可见区域）的尺寸
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            // 获取页面滚动的距离
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            // 初始计算 Tooltip 的位置：居中于触发词的上方，并留出 10px 间距
            let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
            let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10;

            // --- 调整 Tooltip 定位，确保不超出屏幕边缘 ---
            // 检查左边界：如果 Tooltip 太靠近左边缘，就将其向右移动
            if (left < scrollX + 10) {
                left = scrollX + 10;
            }
            // 检查右边界：如果 Tooltip 超出右边缘，就将其向左移动
            if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) {
                left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
            }
            // 检查上边界：如果 Tooltip 在上方显示时会超出屏幕顶部，就将其移动到触发词的下方
            if (top < scrollY + 10) {
                top = spanRect.bottom + scrollY + 10; // 放在单词下方，留 10px 间距
            }

            // 应用计算后的最终位置
            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;
        } else {
            console.warn(`Tooltip data not found for ID: ${wordId}`);
            hideTooltip(); // 如果没有找到对应的数据，就隐藏 Tooltip
        }
    }

    /**
     * 隐藏工具提示的函数。
     */
    function hideTooltip() {
        // 清除任何正在进行的隐藏计时器，防止 Tooltip 意外消失
        clearTimeout(currentHideTimeout);

        // 使用计时器延迟执行隐藏动画，这样用户鼠标快速离开 Tooltip 时不会立即消失
        currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible'); // 移除 'visible' 类，触发 CSS 隐藏动画
            // 等待 CSS 过渡动画完成后，再将 display 设置为 'none'，完全隐藏元素
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                currentActiveTooltipSpan = null; // Tooltip 隐藏后，清除当前激活的 span 状态
            }, 300); // 这里的延迟时间应与 CSS 中 transition-duration 匹配
        }, 100); // 100ms 延迟，给用户移动鼠标到 Tooltip 上的缓冲时间
    }
}
