// js/tooltip.js
// 假设你使用 Marked.js 进行 Markdown 渲染
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// 初始化 marked，可以添加配置，例如 GFM (GitHub Flavored Markdown)
marked.setOptions({
  gfm: true, // 启用 GitHub Flavored Markdown
  breaks: true // 启用换行符
});

/**
 * 异步加载 tooltips.json 数据。
 * @returns {Promise<Object>} - tooltips 数据对象。
 */
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        return {};
    }
}

/**
 * 将 Markdown 文本中的关键词包装成带有 tooltip 的 span，并渲染 Markdown。
 * @param {string} md - 原始 Markdown 文本。
 * @param {Object} tooltipData - tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map (word -> count)。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {number} baseFontSize - 基础字体大小 (px)。
 * @param {number} maxFontSizeIncrease - 最大字体增加量 (px)。
 * @returns {string} - 渲染后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md,
    tooltipData,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12 // 最高频率的词增加 12px，即 16+12=28px
) {
    const tooltipWords = Object.keys(tooltipData);
    // 使用更精确的单词匹配模式，只匹配字母数字词语
    const wordPattern = /\b[a-zA-Z0-9'-]+\b/g;

    const markedWithSpan = md.replace(wordPattern, (match) => {
        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0; // 获取词语频率
        let fontSizeStyle = '';

        // 如果该词是高频词（并且 getWordFrequencies 已过滤停用词）
        if (freq > 0 && maxFreq > 0) { // 避免除以零
            // 计算字体大小：频率越高，字体越大
            // 简单线性映射：(当前频率 / 最高频率) * 最大增加量 + 基础字体
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 判断是否是 tooltip 词，如果是，则同时应用 tooltip 样式和字体大小
        if (tooltipWords.includes(lowerMatch)) {
            // 注意：data-tooltip-id 应该是小写，因为它对应 tooltipData 的键
            return `<span data-tooltip-id="${lowerMatch}" class="word" style="${fontSizeStyle}">${match}</span>`;
        } else if (fontSizeStyle) {
            // 如果不是 tooltip 词，但因为高频而需要调整字体大小
            return `<span style="${fontSizeStyle}">${match}</span>`;
        }
        // 否则，不作任何改变
        return match;
    });

    return marked.parse(markedWithSpan);
}

/**
 * 设置工具提示功能（例如使用 react-tooltip 或简单的 JS tooltip）。
 * 这个函数需要在 DOM 渲染完成后调用，并且在每次新内容渲染后重新调用。
 * @param {Object} tooltipData - tooltips 数据。
 */
export function setupTooltips(tooltipData) {
    // 移除所有旧的事件监听器，避免重复绑定（如果之前有绑定的话）
    document.querySelectorAll('.word').forEach(span => {
        span.removeEventListener('mouseover', showTooltip);
        span.removeEventListener('mouseout', hideTooltip);
    });

    // ！！！ 关键修改 ！！！ 匹配 index.html 中的 ID "react-tooltips"
    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        // 这是一个很重要的警告，表示 JS 无法找到对应的 HTML 元素
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }
    // 这里的 style.cssText 会覆盖你在 style.css 中为 #react-tooltips 定义的样式，
    // 因此这里保持和之前一致，以确保定位和显示功能。
    tooltipDiv.style.cssText = 'position: absolute; display: none; background: #333; color: #fff; padding: 5px 10px; border-radius: 4px; z-index: 10000;';

    // 绑定新的事件监听器
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('mouseover', showTooltip);
        span.addEventListener('mouseout', hideTooltip);
    });

    function showTooltip(e) {
        const wordId = e.target.dataset.tooltipId;
        const data = tooltipData[wordId];

        if (data) {
            // ！！！ 关键修改 ！！！ 确保这里使用的字段与 tooltips.json 中的实际字段匹配
            // 我假设你已经修改了 tooltips.json，使其包含 title 和 description (原 definition)
            const title = data.title || wordId; // 如果没有 title，使用 wordId
            const description = data.description || data.definition || 'No definition available.'; // 兼容 definition
            const category = data.category ? ` (${data.category})` : ''; // 如果没有 category，则不显示括号

            tooltipDiv.innerHTML = `<strong>${title}</strong><br>${description}${category}`;
            tooltipDiv.style.display = 'block';

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
    }
}
