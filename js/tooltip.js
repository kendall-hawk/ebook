// js/tooltip.js (基本无变化)
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true,
  // 新增/确认：允许 marked 解析我们注入的 HTML
  sanitize: false, 
  sanitizer: (html) => html,
});

let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

export function renderMarkdownWithTooltips(
    md,
    currentChapterTooltips,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    // 整个函数逻辑保持不变，因为它是在 pre-tagging 之后运行的，
    // 并且它的正则不会影响到我们已经创建的 .subtitle-segment 标签。
    // ... (此处省略您已有且正确的函数实现)
    const customSpanPlaceholders = {};
    let placeholderCounter = 0;
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
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder;
    });
    const regularWordPattern = /\b([a-zA-Z0-9'-]+)\b/g;
    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        if (customSpanPlaceholders[match]) { return match; }
        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0;
        let fontSizeStyle = '';
        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }
        if (currentChapterTooltips.hasOwnProperty(lowerMatch)) {
            return `<span data-tooltip-id="${lowerMatch}" class="word" style="${fontSizeStyle}">${match}</span>`;
        } else if (fontSizeStyle) {
            return `<span style="${fontSizeStyle}">${match}</span>`;
        }
        return match;
    });
    Object.keys(customSpanPlaceholders).forEach(placeholder => {
        const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        finalProcessedMd = finalProcessedMd.replace(regex, customSpanPlaceholders[placeholder]);
    });

    // 关键：marked.parse 会保留我们预先注入的 .subtitle-segment 标签
    return marked.parse(finalProcessedMd);
}

// setupTooltips 函数完全没有变化，因为它只关心 .word 类的点击
// 和 Tooltip 自身的交互逻辑。
export function setupTooltips() {
  // ... (此处省略您已有且正确的函数实现)
  // ... 它与字幕功能解耦，是完美的。
}

// updateActiveChapterTooltips 函数完全没有变化
export function updateActiveChapterTooltips(tooltipsData) {
  // ... (此处省略您已有且正确的函数实现)
}
