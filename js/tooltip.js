// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// Marked.js 配置
marked.setOptions({
  gfm: true, // 启用 GitHub Flavored Markdown
  breaks: true // 将换行符解析为 <br>
});

// 私有变量用于管理 Tooltip 的显示/隐藏状态
let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

/**
 * 将 Markdown 文本渲染为 HTML，同时处理自定义 Tooltip 标记和词频字号调整。
 *
 * @param {string} md - 待渲染的 Markdown 字符串。
 * @param {Object} currentChapterTooltips - 当前章节的 Tooltip 数据对象。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {boolean} isTranscriptSection - 标记当前是否在转录稿部分。
 * @param {number} startWordIndex - 转录稿单词的起始索引。
 * @returns {{html: string, wordCount: number}} - 包含渲染后的 HTML 和更新后的单词计数。
 */
export function renderMarkdownWithTooltips(
    md,
    currentChapterTooltips,
    wordFrequenciesMap,
    maxFreq,
    isTranscriptSection = false,
    startWordIndex = 0,
    baseFontSize = 16, // 默认基础字号
    maxFontSizeIncrease = 12 // 最大字号增量
) {
    const customSpanPlaceholders = {};
    let placeholderCounter = 0;
    let currentWordIndex = startWordIndex;

    // 匹配自定义 Tooltip 格式 [[word|tooltipId]]
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
        // Tooltip 单词使用 class="tooltip-word"，不用于音频跳转
        customSpanPlaceholders[placeholder] = `<span data-tooltip-id="${tooltipId}" class="tooltip-word" style="${fontSizeStyle}">${word}</span>`;
        return placeholder;
    });

    // 定义普通单词的正则表达式
    const regularWordPattern = /\b([a-zA-Z0-9'-]+)\b/g;

    // 对非标题的普通段落进行单词处理
    // 注意：这里的处理假设 `md` 传入的已经是去除标题后的纯段落内容
    // 如果 `md` 包含了标题，需要在 chapterRenderer.js 中预处理
    let finalProcessedMd = mdWithCustomSpans.replace(regularWordPattern, (match) => {
        // 如果这个匹配已经是一个自定义 Tooltip 占位符，则直接返回，不重复处理
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

        // 如果该普通单词在 Tooltip 数据中存在，也将其视为 Tooltip 单词
        if (currentChapterTooltips.hasOwnProperty(lowerMatch)) {
            return `<span data-tooltip-id="${lowerMatch}" class="tooltip-word" style="${fontSizeStyle}">${match}</span>`;
        } else if (isTranscriptSection) {
            // 如果是转录稿部分且不是 Tooltip 单词，则添加 'transcript-word' 类
            // data-word-index 用于可能的单词级音频同步（当前方案主要依赖段落级）
            const spanHtml = `<span class="transcript-word" data-word="${lowerMatch}" data-word-index="${currentWordIndex}" style="${fontSizeStyle}">${match}</span>`;
            currentWordIndex++; // 递增单词索引
            return spanHtml;
        } else if (fontSizeStyle) {
            // 既不是 Tooltip 单词也不是转录稿单词，但有字号样式
            return `<span style="${fontSizeStyle}">${match}</span>`;
        }
        return match; // 否则返回原始匹配
    });

    // 替换回自定义 Tooltip 的占位符
    Object.keys(customSpanPlaceholders).forEach(placeholder => {
        const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
        finalProcessedMd = finalProcessedMd.replace(regex, customSpanPlaceholders[placeholder]);
    });

    // 返回一个对象，包含处理后的 Markdown (marked.parse 在 chapterRenderer 中执行) 和更新后的单词计数
    return {
        html: finalProcessedMd,
        wordCount: currentWordIndex
    };
}

/**
 * 设置 Tooltip 的事件监听和显示/隐藏逻辑。
 */
export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    // 监听的容器改为 #chapters，因为 Tooltip 和文章内容都在这里
    const contentContainer = document.getElementById('chapters') || document.body;

    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 移除旧的事件监听器，防止重复绑定
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

    // 监听 contentContainer 上的点击事件，只处理 .tooltip-word 的点击
    contentContainer.addEventListener('click', function(e) {
        const targetSpan = e.target.closest('.tooltip-word'); // 只查找 .tooltip-word
        if (targetSpan) {
            showTooltip(e, targetSpan);
        } else if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('#react-tooltips')) { // 如果点击在 Tooltip 外部，隐藏它
            hideTooltip();
        }
    });

    // 全局点击监听器，用于在点击 Tooltip 以外的任何地方时隐藏 Tooltip
    window._tooltipGlobalClickListener = (e) => {
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.tooltip-word') && // 排除点击 Tooltip 单词本身
            !e.target.closest('#react-tooltips')) { // 排除点击 Tooltip 内容本身
            hideTooltip();
        }
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);

    // Tooltip 鼠标离开事件，用于延迟隐藏
    tooltipDiv._mouseLeaveListener = hideTooltip;
    tooltipDiv.addEventListener('mouseleave', tooltipDiv._mouseLeaveListener);

    // Tooltip 鼠标进入事件，用于取消延迟隐藏
    tooltipDiv._mouseEnterListener = () => {
        clearTimeout(_currentHideTimeout);
    };
    tooltipDiv.addEventListener('mouseenter', tooltipDiv._mouseEnterListener);

    // 页面滚动事件，滚动时隐藏 Tooltip
    window._tooltipScrollListener = () => {
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });

    /**
     * 显示 Tooltip。
     * @param {MouseEvent} e - 事件对象。
     * @param {HTMLElement} clickedSpan - 被点击的 Tooltip <span> 元素。
     */
    async function showTooltip(e, clickedSpan) {
        clearTimeout(_currentHideTimeout); // 清除任何正在进行的隐藏定时器
        e.stopPropagation(); // 阻止事件冒泡，防止触发全局点击隐藏

        // 如果点击的是当前已激活的 Tooltip 单词，则隐藏它
        if (_currentActiveTooltipSpan === clickedSpan) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = clickedSpan; // 更新当前激活的 Tooltip 单词
        const tooltipId = clickedSpan.dataset.tooltipId; // 获取 Tooltip ID

        // 从存储的 Tooltip 数据中获取详情
        const data = _activeChapterTooltipsData[tooltipId];
        // console.log('--- showTooltip Debug Info ---');
        // console.log('Tooltip ID:', tooltipId);
        // console.log('Fetched Tooltip Data:', data);

        if (data) {
            let htmlContent = '';
            // 定义 Tooltip 字段的渲染顺序和标签
            const fieldsOrder = [
                'word', 'title', 'partOfSpeech', 'pronunciation', 'definition',
                'contextualMeaning', 'exampleSentence', 'videoLink',
                'image', 'imageDescription',
                'synonyms', 'antonyms', 'etymology',
                'category', 'source', 'lastUpdated'
            ];

            fieldsOrder.forEach(field => {
                const value = data[field];
                // console.log(`Processing field: "${field}", Value:`, value);

                if (value === undefined || value === null || value === '') {
                    // console.log(`Field "${field}" is empty or not present, skipping.`);
                    return;
                }

                let formattedValue = Array.isArray(value) ? value.join(', ') : value;

                // 根据字段类型生成不同的 HTML
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
                    const videoId = extractVideoId(formattedValue); // 假设 extractVideoId 在 utils.js 中
                    if (videoId) {
                         // 注意：这里需要确保 `youtube.com/embed/` 而不是 `youtube.com/1{videoId}`
                         // 并且确保 `enablejsapi=1` 参数用于 YouTube API 控制
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

            // Tooltip 定位逻辑 (保持不变)
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
        // console.log('--- showTooltip Debug End ---');
    }

    /**
     * 隐藏 Tooltip。
     */
    function hideTooltip() {
        clearTimeout(_currentHideTimeout);
        _currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible');
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                _currentActiveTooltipSpan = null;
            }, 300); // 匹配 CSS 过渡时间
        }, 100); // 延迟隐藏，允许鼠标移到 Tooltip 上
    }

    // 辅助函数：从 YouTube URL 中提取视频 ID
    // 假设此函数位于 utils.js 并已导入，或者直接定义在这里
    function extractVideoId(url) {
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|\?(?:v=)|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regExp);
        return (match && match[1]) ? match[1] : null;
    }
}

// 存储当前章节的 Tooltip 数据，供 showTooltip 使用
let _activeChapterTooltipsData = {};

/**
 * 更新 Tooltip 模块当前激活的 Tooltip 数据。
 * 通常在加载新章节时调用。
 * @param {Object} tooltipsData - 新的 Tooltip 数据。
 */
export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData);
}

