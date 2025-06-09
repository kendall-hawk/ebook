// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
});

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
 * 这些 span 不会再被第二步的正则匹配到。
 * 2. 然后，对剩余的（没有被第一步处理的）普通单词，进行高频词字体大小计算和自动 tooltip 匹配。
 * 3. 最后，将处理后的字符串传递给 marked.parse 进行整体的 Markdown 渲染。
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
        const freq = wordFrequenciesMap.get(lowerWord) || 0; // 根据原始单词计算频率
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 创建一个唯一的临时占位符，并将完整的 span 存储起来
        const placeholder = `__CUSTOM_SPAN_PLACEHOLDER_${placeholderCounter++}__`;
        // 注意：这里生成的 span 必须包含 class="word" 才能被 setupTooltips 识别
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder; // 在文本中用占位符替换原始的 [[...]] 语法
    });


    // --- 步骤 2: 处理剩余的普通单词（高频词和自动 tooltip）---
    // 此时 mdWithCustomSpans 中已经没有 [[...]] 语法了，只有纯文本和我们的占位符。
    // 我们需要确保不对占位符内部的文本进行匹配。
    // 这通过一个更复杂的正则表达式实现，它会忽略 HTML 标签内部的文本。
    const tooltipWords = Object.keys(tooltipData);
    // 这个正则表达式会匹配单词，但不会匹配那些位于 HTML 标签内部的单词。
    // (?<!<[^>]*>) 负向后瞻：确保不是在 <...> 标签的开头之后
    // (\b[a-zA-Z0-9'-]+\b) 匹配单词本身
    // (?![^<]*>) 负向前瞻：确保不是在 <...> 标签的结尾之前
    // 注意：JavaScript 的正则表达式对负向后瞻 (lookbehind) 的支持有限，尤其在旧版本或某些环境下。
    // 如果这个正则在你的手机上不工作，可能需要回退到更简单的策略，但会失去一些精度。
    // 更通用但可能略微复杂的版本：
    const regularWordPattern = /(\b[a-zA-Z0-9'-]+\b)(?![^<]*>)/g; // 匹配单词，但忽略标签内部的词


    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 只有当这个单词在 tooltipData 中有对应的条目时，才给它添加 data-tooltip-id 和 class="word"
        // 且它不是我们之前替换的占位符（由步骤1处理）。
        if (tooltipWords.includes(lowerMatch)) {
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
    return marked.parse(finalProcessedMd);
}


export function setupTooltips(tooltipData) {
    // 移除所有旧的事件监听器，避免重复绑定
    document.querySelectorAll('.word').forEach(span => {
        span.removeEventListener('mouseover', showTooltip);
        span.removeEventListener('mouseout', hideTooltip); // 旧的 mouseout 移除
    });

    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 绑定新的事件监听器
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('mouseover', showTooltip);
        // 不再绑定 mouseout 到每个 span，而是通过 document click 和 tooltipDiv mouseleave 统一管理
    });

    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    document.addEventListener('click', (e) => {
        // 如果 tooltip 可见，并且点击的不是一个 .word 元素（或其子元素）
        if (tooltipDiv.classList.contains('visible') && !e.target.closest('.word')) {
            hideTooltip();
        }
    });

    // 确保鼠标移出 tooltip 后也隐藏
    tooltipDiv.addEventListener('mouseleave', hideTooltip);


    function showTooltip(e) {
        e.stopPropagation(); // 阻止事件冒泡到 document 的点击事件

        const wordId = e.target.dataset.tooltipId;
        const data = tooltipData[wordId];

        if (data) {
            let htmlContent = '';

            // 标题 (通常是单词本身)
            if (data.title) {
                htmlContent += `<strong>${data.title}</strong><br>`;
            } else {
                htmlContent += `<strong>${wordId.split('-')[0]}</strong><br>`; // 如果没有title，显示ID的单词部分
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
                htmlContent += `${data["Image Description"]}<br>`;
            }

            // 例句
            if (data.example) {
                htmlContent += `${data.example}<br>`;
            }

            // 分类
            if (data.category) {
                htmlContent += `${data.category}`;
            }

            tooltipDiv.innerHTML = htmlContent;
            tooltipDiv.style.display = 'block';
            tooltipDiv.classList.add('visible'); // 添加 visible 类，触发 CSS 动画

            // 定位 tooltip
            const spanRect = e.target.getBoundingClientRect();
            let left = spanRect.left + window.scrollX;
            let top = spanRect.top + window.scrollY - tooltipDiv.offsetHeight - 5; // 放在单词上方

            // 确保 tooltip 不会超出屏幕左边缘
            if (left < 0) {
                left = 0;
            }
            // 确保 tooltip 不会超出屏幕右边缘
            if (left + tooltipDiv.offsetWidth > window.innerWidth) {
                left = window.innerWidth - tooltipDiv.offsetWidth;
            }
             // 确保 tooltip 不会超出屏幕上边缘 (如果放在单词上方)
            if (top < window.scrollY) {
                top = spanRect.bottom + window.scrollY + 5; // 如果上方空间不足，则放在下方
            }

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;
        }
    }

    function hideTooltip() {
        tooltipDiv.style.display = 'none';
        tooltipDiv.classList.remove('visible');
    }
}
