// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
});

let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

/**
 * 将 Markdown 文本渲染为 HTML，并根据词频和 Tooltip 数据包裹单词。
 * 此函数不处理 SRT 句子的特定包裹，该逻辑已移至 chapterRenderer.js。
 * @param {string} md - 待处理的 Markdown 字符串。
 * @param {Object} currentChapterTooltips - 当前章节专属的 Tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {number} [baseFontSize=16] - 基础字体大小。
 * @param {number} [maxFontSizeIncrease=12] - 最大字体增大值。
 * @returns {string} - 渲染后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md,
    currentChapterTooltips,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    const customSpanPlaceholders = {};
    let placeholderCounter = 0;

    // 1. 处理自定义 Tooltip 语法 [[word|id]]
    // 这种模式下的单词，强制带 class="word" 和 data-tooltip-id
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
        // 为自定义 Tooltip 的单词添加 class="word"
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder;
    });

    // 2. 处理普通单词（添加 Tooltip 或词频样式）
    // 确保只处理未被自定义 Tooltip 语法替换的普通单词
    const regularWordPattern = /\b([a-zA-Z0-9'-]+)\b/g;

    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 如果单词有章节专属 Tooltip
        if (currentChapterTooltips.hasOwnProperty(lowerMatch)) {
            // 添加 class="word" 和 data-tooltip-id
            return `<span data-tooltip-id="${lowerMatch}" class="word" style="${fontSizeStyle}">${match}</span>`;
        } else if (fontSizeStyle) {
            // 如果只有词频样式，没有 Tooltip，也添加 class="word"
            // 这是为了确保 setupTooltips 能够通过 .word 类识别所有需要高亮的单词
            return `<span class="word" style="${fontSizeStyle}">${match}</span>`;
        }
        return match; // 不符合条件，不包裹 span
    });

    // 3. 替换回自定义 Span 的占位符
    Object.keys(customSpanPlaceholders).forEach(placeholder => {
        // 使用精确的正则表达式匹配整个占位符，防止部分匹配
        const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        finalProcessedMd = finalProcessedMd.replace(regex, customSpanPlaceholders[placeholder]);
    });

    // 4. 将最终处理过的 Markdown 字符串解析为 HTML
    return marked.parse(finalProcessedMd);
}

/**
 * 设置 Tooltip 的事件监听器。
 * 监听器现在依赖于 .word 类和 data-tooltip-id 属性。
 */
export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    // **修正：使用 id="chapters" 作为更精确的容器，避免监听整个 document.body**
    const contentContainer = document.getElementById('chapters');

    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }
    if (!contentContainer) {
        console.warn('Content container #chapters not found. Tooltips click events might not work as expected.');
        // 可以选择在这里返回，或者退回到 document.body
        // 为了兼容性，如果 #chapters 不存在，则退回 document.body
        console.warn('Falling back to document.body for tooltip click events.');
        // contentContainer = document.body; // 取消这行，因为上面已经定义
    }


    // --- 确保事件监听器只绑定一次 ---
    // 移除旧的事件监听器以防止重复绑定
    // 使用命名函数引用来确保可以正确移除
    if (contentContainer._tooltipClickListener) {
        contentContainer.removeEventListener('click', contentContainer._tooltipClickListener);
    }
    if (window._tooltipGlobalClickListener) {
        document.removeEventListener('click', window._tooltipGlobalClickListener);
    }
    if (window._tooltipScrollListener) {
        document.removeEventListener('scroll', window._tooltipScrollListener);
    }
    if (tooltipDiv._mouseLeaveListener) {
        tooltipDiv.removeEventListener('mouseleave', tooltipDiv._mouseLeaveListener);
    }
    if (tooltipDiv._mouseEnterListener) {
        tooltipDiv.removeEventListener('mouseenter', tooltipDiv._mouseEnterListener);
    }

    // 绑定新的事件监听器
    // 使用事件委托，监听 #chapters 容器内的点击事件
    // 这样对于动态添加的 .word 元素也能生效
    contentContainer._tooltipClickListener = function(e) {
        const targetSpan = e.target.closest('.word[data-tooltip-id]'); // 只监听带有 data-tooltip-id 的 .word
        if (targetSpan) {
            showTooltip(e, targetSpan);
        } else if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('#react-tooltips')) { // 如果点击了非 tooltip 区域且 tooltip 是可见的
            hideTooltip();
        }
    };
    contentContainer.addEventListener('click', contentContainer._tooltipClickListener);

    // 全局点击监听器，用于点击 tooltip 外部时隐藏
    window._tooltipGlobalClickListener = (e) => {
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word[data-tooltip-id]') && // 不点击带 tooltip 的单词
            !e.target.closest('#react-tooltips')) { // 不点击 tooltip 本身
            hideTooltip();
        }
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);

    // Tooltip 区域的鼠标事件，用于控制自动隐藏
    tooltipDiv._mouseLeaveListener = hideTooltip;
    tooltipDiv.addEventListener('mouseleave', tooltipDiv._mouseLeaveListener);

    tooltipDiv._mouseEnterListener = () => {
        clearTimeout(_currentHideTimeout); // 鼠标进入 Tooltip 区域，取消隐藏定时器
    };
    tooltipDiv.addEventListener('mouseenter', tooltipDiv._mouseEnterListener);

    // 滚动时隐藏 Tooltip
    window._tooltipScrollListener = () => {
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });

    /**
     * 显示 Tooltip。
     * @param {Event} e - 点击事件对象。
     * @param {HTMLElement} clickedSpan - 被点击的单词 span 元素。
     */
    async function showTooltip(e, clickedSpan) {
        clearTimeout(_currentHideTimeout); // 清除任何正在进行的隐藏定时器
        e.stopPropagation(); // 阻止事件冒泡到 document 的全局点击监听器

        // 如果点击的是当前已经激活的 Tooltip Span，则隐藏它
        if (_currentActiveTooltipSpan === clickedSpan) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = clickedSpan; // 更新当前激活的 Span
        const tooltipId = clickedSpan.dataset.tooltipId; // 获取 Tooltip ID

        // **修正：使用 _activeChapterTooltipsData 而不是 _activeChapterTooltipsData[tooltipId] 作为整体数据源**
        // 获取特定 Tooltip ID 的数据
        const data = _activeChapterTooltipsData[tooltipId];
        // console.log('--- showTooltip Debug Info ---');
        // console.log('Tooltip ID:', tooltipId);
        // console.log('Fetched Tooltip Data:', data);

        if (data) {
            let htmlContent = '';
            // 定义 Tooltip 字段的渲染顺序和标签/样式
            const fieldsOrder = [
                'word', 'title', 'partOfSpeech', 'pronunciation', 'definition',
                'contextualMeaning', 'exampleSentence', 'videoLink',
                'image',
                'imageDescription',
                'synonyms', 'antonyms', 'etymology',
                'category', 'source', 'lastUpdated'
            ];

            fieldsOrder.forEach(field => {
                const value = data[field];
                // console.log(`Processing field: "${field}", Value:`, value); // Debug: log each field and its value

                if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
                    // console.log(`Field "${field}" is empty or not present, skipping.`);
                    return;
                }

                let formattedValue = Array.isArray(value) ? value.join(', ') : value;

                // --- 明确处理每个字段的渲染 ---
                if (field === 'word' || field === 'title') {
                    htmlContent += `<p class="tooltip-title"><strong>${formattedValue}</strong></p>`;
                } else if (field === 'partOfSpeech') {
                    htmlContent += `<p class="tooltip-pos">(${formattedValue})</p>`;
                } else if (field === 'pronunciation') {
                    htmlContent += `<p class="tooltip-pronunciation">/${formattedValue}/</p>`;
                } else if (field === 'definition') {
                    htmlContent += `<p class="tooltip-definition">${formattedValue}</p>`;
                } else if (field === 'contextualMeaning') {
                    htmlContent += `<p class="tooltip-contextual-meaning">💡 Visual Sense: <em>${formattedValue}</em></p>`;
                } else if (field === 'exampleSentence') {
                    htmlContent += `<p class="tooltip-example"><strong>example:</strong> ${formattedValue}</p>`;
                } else if (field === 'videoLink') {
                    const videoId = extractVideoId(formattedValue);
                    if (videoId) {
                         // **修正：YouTube 嵌入 URL 格式**
                         htmlContent += `<div class="tooltip-video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}?enablejsapi=1" frameborder="0" allowfullscreen></iframe></div>`;
                         // console.log(`Rendered video for ${tooltipId} from: ${formattedValue}`);
                    } else {
                        console.warn(`Could not extract video ID from: ${formattedValue}`);
                    }
                } else if (field === 'image') {
                    htmlContent += `<img src="${formattedValue}" alt="Tooltip Image" class="tooltip-image">`;
                    // console.log(`Rendered image for ${tooltipId} from: ${formattedValue}`);
                } else if (field === 'imageDescription') {
                    htmlContent += `<p class="tooltip-image-description-text"><strong>ImageDescription:</strong> ${formattedValue}</p>`;
                } else if (field === 'synonyms') {
                    htmlContent += `<p class="tooltip-synonyms"><strong>synonyms:</strong> ${formattedValue}</p>`;
                } else if (field === 'antonyms') {
                    htmlContent += `<p class="tooltip-antonyms"><strong>antonyms:</strong> ${formattedValue}</p>`;
                } else if (field === 'etymology') {
                    htmlContent += `<p class="tooltip-etymology">Etymology: ${formattedValue}</p>`;
                } else if (field === 'category') {
                    htmlContent += `<p class="tooltip-category">Category: ${formattedValue}</p>`;
                } else if (field === 'source') {
                    htmlContent += `<p class="tooltip-source">Source: ${formattedValue}</p>`;
                } else if (field === 'lastUpdated') {
                    htmlContent += `<p class="tooltip-last-updated">Updated: ${formattedValue}</p>`;
                } else {
                    console.warn(`Unhandled field encountered: "${field}" with value: "${value}". Please add a specific handler for it.`);
                    htmlContent += `<p class="tooltip-unhandled-field"><strong>${field.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${formattedValue}</p>`;
                }
            });

            if (!htmlContent) {
                htmlContent = `<p>No detailed information available for "${tooltipId}".</p>`;
            }

            tooltipDiv.innerHTML = htmlContent;
            tooltipDiv.style.display = 'block';
            tooltipDiv.classList.add('visible');

            // --- Tooltip 定位逻辑 ---
            const spanRect = clickedSpan.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            // 计算初始位置：Tooltip 居中于单词上方
            let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
            let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10; // 10px 间距

            // 边界检查：防止 Tooltip 超出视口
            // 左右边界
            if (left < scrollX + 10) left = scrollX + 10; // 左边距至少 10px
            if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) {
                left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10; // 右边距至少 10px
            }
            // 上下边界 (如果上方空间不足，则显示在单词下方)
            if (top < scrollY + 10) {
                top = spanRect.bottom + scrollY + 10; // 显示在单词下方
            }

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;

        } else {
            console.warn(`Tooltip data not found for ID: ${tooltipId}. Current active data:`, _activeChapterTooltipsData);
            hideTooltip();
        }
        // console.log('--- showTooltip Debug End ---');
    }

    /**
     * 隐藏 Tooltip。
     */
    function hideTooltip() {
        clearTimeout(_currentHideTimeout);
        _currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible'); // 触发 CSS 过渡
            // 在过渡结束后彻底隐藏元素
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                _currentActiveTooltipSpan = null; // 清除当前激活的 Span
            }, 300); // 匹配 CSS 过渡时间，确保动画完成
        }, 100); // 延迟隐藏，允许用户将鼠标移动到 Tooltip 上
    }

    /**
     * 辅助函数：从 YouTube URL 中提取视频 ID。
     * @param {string} url - YouTube 视频 URL。
     * @returns {string|null} - 提取到的视频 ID 或 null。
     */
    function extractVideoId(url) {
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|\?(?:v=)|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regExp);
        return (match && match[1]) ? match[1] : null;
    }
}

let _activeChapterTooltipsData = {}; // 存储当前章节的 Tooltip 数据

/**
 * 更新当前激活的章节 Tooltip 数据。
 * 这个函数应该在章节加载时被调用。
 * @param {Object} tooltipsData - 新的 Tooltip 数据对象。
 */
export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    // console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData);
}
