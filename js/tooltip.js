// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
});

// --- 移除：Tooltip 数据不再在 tooltip.js 内部管理 ---
// let _internalTooltipsData = {}; // 移除此行

let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

// --- 移除 loadTooltips 函数，因为数据将从外部传入 ---
// export async function loadTooltips() { ... } // 移除此函数

// renderMarkdownWithTooltips 函数：它现在将接收外部传入的 tooltipsData
export function renderMarkdownWithTooltips(
    md,
    currentChapterTooltips, // <-- 接收外部传入的当前章节 Tooltip 数据
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
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
        // 这里的数据属性现在是 data-tooltip-id，直接关联到 tooltipsData 的键
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder;
    });

    const regularWordPattern = /\b([a-zA-Z0-9'-]+)\b/g;

    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        // 如果是自定义占位符，跳过，等待后面替换
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

        // --- 核心修改：使用传入的 currentChapterTooltips ---
        // 这里的 `lowerMatch` 对应的是普通单词，我们需要确保它的 tooltipId 在 currentChapterTooltips 中存在
        // 如果你的 tooltips_data 的键是实际单词（如 "apple"），则 `currentChapterTooltips.hasOwnProperty(lowerMatch)` 可行
        // 如果键是 "apple-noun" 且内容是 "apple"，这里需要更复杂的查找
        // 考虑到你使用 `[[word|tooltipId]]`，我们假设 `tooltipId` 是唯一的标识符。
        // 对于普通单词，我们仍然假设 `lowerMatch` 本身就是一个有效的 `tooltipId`。
        // 因此，我们仍使用 `hasOwnProperty` 检查是否存在。
        if (currentChapterTooltips.hasOwnProperty(lowerMatch)) { // 对于普通单词，直接以单词本身作为 ID
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

    return marked.parse(finalProcessedMd);
}


// setupTooltips 函数：使用事件委托
// 它现在不需要访问 _internalTooltipsData，而是通过 showTooltip 动态获取数据
export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    const contentContainer = document.getElementById('chapters') || document.body; // 假设 #chapters 是你的章节内容容器

    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 清理旧的事件监听器，避免重复绑定
    if (window._tooltipGlobalClickListener) {
        document.removeEventListener('click', window._tooltipGlobalClickListener);
    }
    if (window._tooltipScrollListener) {
        document.removeEventListener('scroll', window._tooltipScrollListener);
    }
    // 还需要清理 contentContainer 上的点击监听器，如果 setupTooltips 被重复调用
    // 假设 contentContainer 上的点击监听器是唯一的，且 setupTooltips 只调用一次，
    // 如果不是，你需要保存并移除该监听器的引用。
    // For simplicity, we'll assume setupTooltips is called once on DOMContentLoaded.

    contentContainer.addEventListener('click', function(e) {
        const targetSpan = e.target.closest('.word');
        if (targetSpan) {
            showTooltip(e, targetSpan);
        } else if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    });

    window._tooltipGlobalClickListener = (e) => {
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') &&
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);


    tooltipDiv.addEventListener('mouseleave', hideTooltip);

    tooltipDiv.addEventListener('mouseenter', () => {
        clearTimeout(_currentHideTimeout);
    });

    window._tooltipScrollListener = () => {
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });


    // showTooltip 函数：现在它需要动态获取当前章节的 Tooltip 数据
    async function showTooltip(e, clickedSpan) {
        clearTimeout(_currentHideTimeout);
        e.stopPropagation();

        if (_currentActiveTooltipSpan === clickedSpan) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = clickedSpan;
        const tooltipId = clickedSpan.dataset.tooltipId;

        // --- 核心修改：动态获取当前章节的 Tooltip 数据 ---
        // 需要从 DOM 或其他地方获取当前章节的 ID，然后加载对应的 Tooltip JSON
        // 最简单的方法是假设章节内容被渲染到一个带有章节ID的容器中，例如 <div id="chapters" data-current-chapter-id="chap-01">
        // 或者，在 `chapterRenderer.js` 渲染章节时，将 `currentChapterTooltips` 存储在一个全局可访问的变量中，
        // 但更好的做法是 `showTooltip` 能够从渲染的 DOM 元素中获取当前章节的 ID，然后再次加载。
        // 然而，为了避免重复加载，我们应该在 `renderSingleChapterContent` 中加载并存储当前章节的 Tooltip 数据，
        // 然后 `showTooltip` 直接使用这个已加载的数据。

        // 为了避免 Tooltip 每次显示都重新加载数据，
        // 我们需要在 `chapterRenderer.js` (或者 `main.js`) 中加载章节数据时，
        // 将 `currentChapterTooltips` 赋值给一个**全局可访问的变量**。
        // 例如，在 `chapterRenderer.js` 中新增一个 `export let currentTooltipsForDisplay = {};`
        // 并在 `renderSingleChapterContent` 中 `currentTooltipsForDisplay = currentChapterTooltips;`
        // 然后在这里 `const data = currentTooltipsForDisplay[tooltipId];`
        // 这是一个更高效的方式。

        // 另一种（更简单的）方法是：将 `setupTooltips` 移动到 `renderSingleChapterContent` 内部，
        // 并在每次章节渲染时重新设置 Tooltip 事件，并传入 `currentChapterTooltips`。
        // 但这样会频繁添加和移除事件监听器，效率较低。
        // 更优方案是：`tooltip.js` 暴露一个函数来更新其内部的 `_currentTooltipsData`
        // 然后 `main.js` 或 `chapterRenderer.js` 在加载新章节时调用这个函数。

        // --- 新增：Tooltip 数据管理方式 (优化方案) ---
        // 重新思考：renderMarkdownWithTooltips 已经传入了 currentChapterTooltips，
        // 但 setupTooltips 作为一个独立的事件绑定函数，无法直接访问。
        // 最好的方法是 `tooltip.js` 暴露一个 `updateTooltipsData` 函数。
        // 或者，让 `showTooltip` 从一个**全局（或模块级）变量**中获取数据，
        // 而这个全局变量由 `chapterRenderer.js` 在渲染时更新。

        // 这里我们将使用一个模块级变量 `_activeChapterTooltipsData`
        const data = _activeChapterTooltipsData[tooltipId]; // 使用当前激活的章节 Tooltip 数据

        if (data) {
            let htmlContent = '';
            // 根据扩展性需求，动态生成 HTML
            // 遍历所有可能的字段，并渲染
            const fieldsOrder = [
                'word', 'title', 'partOfSpeech', 'pronunciation', 'definition',
                'contextualMeaning', 'exampleSentence', 'imageDescription', 'videoLink',
                'synonyms', 'antonyms', 'etymology', 'category', 'source', 'lastUpdated'
            ];

            fieldsOrder.forEach(field => {
                if (data[field]) {
                    let value = data[field];
                    if (Array.isArray(value)) {
                        value = value.join(', '); // 数组转换为字符串
                    }
                    if (field === 'word' || field === 'title') {
                        htmlContent += `<p class="tooltip-title"><strong>${value}</strong></p>`;
                    } else if (field === 'partOfSpeech') {
                        htmlContent += `<p class="tooltip-pos">(${value})</p>`;
                    } else if (field === 'definition') {
                        htmlContent += `<p class="tooltip-definition">${value}</p>`;
                    } else if (field === 'exampleSentence') {
                        htmlContent += `<p class="tooltip-example">例句: <em>${value}</em></p>`;
                    } else if (field === 'imageDescription' && data.image) { // 假设如果存在图片路径，会有一个 'image' 字段
                        htmlContent += `<img src="${data.image}" alt="${value}" class="tooltip-image"><p class="tooltip-image-desc">${value}</p>`;
                    } else if (field === 'videoLink' && data.videoLink) {
                        const videoId = extractVideoId(data.videoLink); // 假设你有一个 extractVideoId 工具函数
                        if (videoId) {
                             htmlContent += `<div class="tooltip-video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>`;
                        }
                    } else {
                        // 对于其他自定义字段，可以根据需要格式化
                        htmlContent += `<p class="tooltip-field-${field}"><strong>${field.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${value}</p>`;
                    }
                }
            });

            if (!htmlContent) { // 如果没有解析到任何有效内容
                htmlContent = `<p>No detailed information available for "${tooltipId}".</p>`;
            }

            tooltipDiv.innerHTML = htmlContent;
            tooltipDiv.style.display = 'block';
            tooltipDiv.classList.add('visible');

            const spanRect = clickedSpan.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
            let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10;

            if (left < scrollX + 10) left = scrollX + 10;
            if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
            if (top < scrollY + 10) top = spanRect.bottom + scrollY + 10;

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;
        } else {
            console.warn(`Tooltip data not found for ID: ${tooltipId}. Current active data:`, _activeChapterTooltipsData);
            hideTooltip();
        }
    }

    function hideTooltip() {
        clearTimeout(_currentHideTimeout);
        _currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible');
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                _currentActiveTooltipSpan = null;
            }, 300);
        }, 100);
    }
}

// --- 新增：暴露一个函数来更新 Tooltip 模块内部的当前数据 ---
let _activeChapterTooltipsData = {}; // 用于存储当前章节的 tooltip 数据

export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    console.log("Tooltip模块：当前激活的 Tooltip 数据已更新。", _activeChapterTooltipsData);
}
