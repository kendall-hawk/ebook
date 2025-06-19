/**
 * js/tooltip.js
 * 负责渲染带有工具提示和词频样式的文本，并管理工具提示的显示/隐藏逻辑。
 */

import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import { extractVideoId, getYouTubeEmbedUrl } from './youtube.js';

// 确保 Marked.js 配置只执行一次，且在解析前生效
if (!marked._isConfigured) {
  marked.setOptions({
    gfm: true, // 启用 GitHub Flavored Markdown
    breaks: true, // 启用自动换行，将单个换行符解释为 <br>
    sanitize: false, // 核心设置：不转义用户提供的HTML。
                      // 这允许 renderMarkdownWithTooltips 插入的 <span> 标签和 preTagSubtitles 插入的 <span> 标签得以保留。
  });
  marked._isConfigured = true; // 标记已配置
  console.log("Marked.js initialized with sanitize: false.");
}

let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null; // 当前被点击高亮的 .word 元素
let _activeChapterTooltipsData = {}; // 存储当前章节的工具提示数据

// 全局的 tooltip 容器引用
let tooltipDiv = null;

/**
 * 渲染 Markdown 文本，并注入工具提示和词频样式。
 * 此函数现在预期可能会接收已包含其他 HTML 标签 (如字幕的 <span>) 的字符串。
 * @param {string} md - 原始 Markdown 文本，或者已包含 HTML (如字幕span) 的混合字符串。
 * @param {Object} currentChapterTooltips - 当前章节的工具提示数据。
 * @param {Map<string, number>} wordFrequenciesMap - 全局词频 Map。
 * @param {number} maxFreq - 全局最大词频。
 * @param {number} [baseFontSize=16] - 基础字体大小 (px)。
 * @param {number} [maxFontSizeIncrease=12] - 最大字体增大值 (px)。
 * @returns {string} 渲染后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md, // 保持变量名词不变
    currentChapterTooltips,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    if (!md || typeof md !== 'string') return '';

    let processedContent = md; // 使用临时变量进行处理，不修改原始 md 参数

    // 步骤 1: 处理自定义工具提示语法 [[word|tooltipId]]
    // 匹配自定义的 [[...]] 格式，支持 Unicode 字母、数字、连字符、撇号
    const customTooltipPattern = /\[\[([\p{L}\p{N}'-]+)\|([a-zA-Z0-9_-]+)\]\]/gu;
    processedContent = processedContent.replace(customTooltipPattern, (match, word, tooltipId) => {
        const lowerWord = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';
        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }
        // 返回插入的 HTML <span> 标签。由于 Marked.js 的 sanitize: false 设置，这些标签会被保留。
        return `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
    });

    // 步骤 2: 处理普通单词的词频和工具提示
    // 匹配常规单词：连续的字母、数字、连字符或撇号 (支持 Unicode)
    const regularWordPattern = /([\p{L}\p{N}]+(?:['\-\u2010-\u2015][\p{L}\p{N}]+)*)/gu;
    processedContent = processedContent.replace(regularWordPattern, (match, word) => {
        // 重要：如果当前匹配到的 `match` 字符串是一个完整的 HTML 标签 (例如 `<span class="subtitle-segment">...</span>`)
        // 则表示它已经被其他处理逻辑（如 preTagSubtitles）插入，应该直接返回原样，避免对其进行二次处理或破坏。
        // Marked.js 的 `sanitize: false` 也会确保这些标签在最终解析时得以保留。
        if (match.startsWith('<') && match.endsWith('>')) {
            return match;
        }

        const lowerWord = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';
        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        if (currentChapterTooltips.hasOwnProperty(lowerWord)) {
            // 如果有对应的工具提示，则添加 data-tooltip-id 和词频样式
            return `<span data-tooltip-id="${lowerWord}" class="word" style="${fontSizeStyle}">${word}</span>`;
        } else if (fontSizeStyle) {
            // 如果没有工具提示，但有词频样式，也应用 span
            return `<span style="${fontSizeStyle}">${word}</span>`;
        }
        return match; // 不处理，原样返回
    });

    // 步骤 3: 使用 Marked.js 解析最终的文本。
    // Marked.js 会解析剩余的 Markdown 语法，并将整个内容包裹在适当的 HTML 块级元素中（例如 <p>）。
    // 由于 Marked.js 的 `sanitize: false` 设置，步骤 1 和步骤 2 中插入的 <span> 标签会被正确保留。
    const renderedHtml = marked.parse(processedContent);
    // console.log("Marked.js 渲染后的 HTML (tooltip.js):", renderedHtml); // 用于调试，确认输出
    return renderedHtml;
}

/**
 * 初始化并设置工具提示的事件监听器。
 */
export function setupTooltips() {
    tooltipDiv = document.getElementById('react-tooltips');
    const chaptersContainer = document.getElementById('chapters');

    if (!tooltipDiv) {
        console.error('Tooltip container #react-tooltips not found. Tooltips will not function.');
        return;
    }
    if (!chaptersContainer) {
        console.error('Chapters container #chapters not found. Tooltips will not function on chapter content.');
        return;
    }

    // 清理旧的事件监听器，避免重复绑定。
    // 使用命名函数引用 (_listeners) 方便移除。
    if (tooltipDiv._listeners) {
        tooltipDiv.removeEventListener('mouseleave', tooltipDiv._listeners.mouseleave);
        tooltipDiv.removeEventListener('mouseenter', tooltipDiv._listeners.mouseenter);
        chaptersContainer.removeEventListener('click', tooltipDiv._listeners.chapterClick); // 确保移除章节容器的 click 监听器
        document.removeEventListener('click', tooltipDiv._listeners.docClick);
        document.removeEventListener('scroll', tooltipDiv._listeners.docScroll);
        // 清理当前活动的高亮
        if (_currentActiveTooltipSpan) {
            _currentActiveTooltipSpan.classList.remove('active-tooltip-word'); // 移除可能的点击高亮
            _currentActiveTooltipSpan = null;
        }
        hideTooltip(); // 隐藏任何可能显示的旧 tooltip
    }

    const listeners = {
        mouseleave: () => { _currentHideTimeout = setTimeout(hideTooltip, 100); },
        mouseenter: () => { clearTimeout(_currentHideTimeout); },
        chapterClick: (e) => {
            // 使用 closest 查找最近的具有 data-tooltip-id 属性的 .word 元素
            const targetSpan = e.target.closest('.word[data-tooltip-id]');
            if (targetSpan) {
                showTooltip(e, targetSpan);
            } else if (tooltipDiv.classList.contains('visible') && !e.target.closest('#react-tooltips')) {
                // 如果工具提示已显示，且点击发生在章节内容空白处（非工具提示内部），则隐藏
                hideTooltip();
            }
        },
        docClick: (e) => {
            // 如果点击发生在工具提示外部且不是 .word 元素
            if (tooltipDiv.classList.contains('visible') &&
                !e.target.closest('.word[data-tooltip-id]') && // 确保不是带 tooltip 的词
                !e.target.closest('#react-tooltips')) { // 确保不是工具提示本身
                hideTooltip();
            }
        },
        docScroll: () => {
            // 滚动时隐藏工具提示，避免位置错乱
            if (tooltipDiv.classList.contains('visible')) {
                hideTooltip();
            }
        }
    };

    tooltipDiv.addEventListener('mouseleave', listeners.mouseleave);
    tooltipDiv.addEventListener('mouseenter', listeners.mouseenter);
    chaptersContainer.addEventListener('click', listeners.chapterClick); // 对章节容器使用事件委托
    document.addEventListener('click', listeners.docClick); // 全局点击监听，用于点击外部隐藏
    document.addEventListener('scroll', listeners.docScroll, { passive: true }); // 滚动监听，使用 passive 提高性能

    tooltipDiv._listeners = listeners; // 保存监听器引用以便清理

    // 初始化时隐藏 tooltip，确保状态一致
    tooltipDiv.style.display = 'none';
    tooltipDiv.classList.remove('visible');
    console.log('Tooltip 模块已初始化。');
}

/**
 * 显示工具提示。
 * @param {Event} e - 点击事件对象。
 * @param {HTMLElement} clickedSpan - 被点击的 .word span 元素。
 */
async function showTooltip(e, clickedSpan) {
    clearTimeout(_currentHideTimeout); // 清除任何正在进行的隐藏定时器
    e.stopPropagation(); // 阻止事件冒泡，避免触发 document 上的点击隐藏

    // 移除旧的高亮
    if (_currentActiveTooltipSpan && _currentActiveTooltipSpan !== clickedSpan) {
        _currentActiveTooltipSpan.classList.remove('active-tooltip-word');
    }

    // 如果重复点击同一个 span 并且工具提示已显示，则隐藏工具提示
    if (_currentActiveTooltipSpan === clickedSpan && tooltipDiv.classList.contains('visible')) {
        hideTooltip();
        _currentActiveTooltipSpan = null; // 清除当前活动 span
        return;
    }

    _currentActiveTooltipSpan = clickedSpan;
    _currentActiveTooltipSpan.classList.add('active-tooltip-word'); // 添加点击高亮样式

    const tooltipId = clickedSpan.dataset.tooltipId;
    const data = _activeChapterTooltipsData[tooltipId];

    if (!data) {
        console.warn(`Tooltip data not found for ID: ${tooltipId}`);
        hideTooltip();
        return;
    }

    // 定义工具提示内容的显示顺序和格式
    // 明确的顺序有助于保持信息的一致性和可读性
    const fieldsOrder = [
        'word', 'title', 'partOfSpeech', 'pronunciation', 'definition',
        'contextualMeaning', 'exampleSentence', 'videoLink',
        'image', 'imageDescription',
        'synonyms', 'antonyms', 'etymology',
        'category', 'source', 'lastUpdated'
    ];

    let htmlContent = '';
    fieldsOrder.forEach(field => {
        const value = data[field];
        // 过滤掉 undefined, null, 或空字符串的值
        if (value === undefined || value === null || value === '') return;

        const formatted = Array.isArray(value) ? value.join(', ') : String(value);

        switch (field) {
            case 'word':
            case 'title':
                htmlContent += `<p class="tooltip-title"><strong>${formatted}</strong></p>`;
                break;
            case 'partOfSpeech':
                htmlContent += `<p class="tooltip-pos">(${formatted})</p>`;
                break;
            case 'pronunciation':
                htmlContent += `<p class="tooltip-pronunciation">/${formatted}/</p>`;
                break;
            case 'definition':
                htmlContent += `<p class="tooltip-definition">${formatted}</p>`;
                break;
            case 'contextualMeaning':
                htmlContent += `<p class="tooltip-contextual-meaning">💡 Visual Sense: <em>${formatted}</em></p>`;
                break;
            case 'exampleSentence':
                htmlContent += `<p class="tooltip-example"><strong>Example:</strong> ${formatted}</p>`;
                break;
            case 'videoLink':
                const videoId = extractVideoId(formatted);
                if (videoId) {
                    // 内联样式，用于响应式视频嵌入
                    htmlContent += `<div class="tooltip-video-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin-bottom:10px;">
                                      <iframe src="${getYouTubeEmbedUrl(videoId, false)}" frameborder="0" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>
                                    </div>`;
                }
                break;
            case 'image':
                htmlContent += `<img src="${formatted}" alt="Tooltip Image" class="tooltip-image" style="max-width:100%;height:auto;margin-top:10px;">`;
                break;
            case 'imageDescription':
                htmlContent += `<p class="tooltip-image-description-text"><strong>Image Description:</strong> ${formatted}</p>`;
                break;
            case 'synonyms':
                htmlContent += `<p class="tooltip-synonyms"><strong>Synonyms:</strong> ${formatted}</p>`;
                break;
            case 'antonyms':
                htmlContent += `<p class="tooltip-antonyms"><strong>Antonyms:</strong> ${formatted}</p>`;
                break;
            case 'etymology':
                htmlContent += `<p class="tooltip-etymology">Etymology: ${formatted}</p>`;
                break;
            case 'category':
                htmlContent += `<p class="tooltip-category">Category: ${formatted}</p>`;
                break;
            case 'source':
                htmlContent += `<p class="tooltip-source">Source: ${formatted}</p>`;
                break;
            case 'lastUpdated':
                htmlContent += `<p class="tooltip-last-updated">Updated: ${formatted}</p>`;
                break;
        }
    });

    if (!htmlContent) {
        htmlContent = `<p>No detailed information available for "${tooltipId}".</p>`;
    }

    tooltipDiv.innerHTML = htmlContent;
    tooltipDiv.style.display = 'block'; // 先显示以便获取尺寸
    tooltipDiv.classList.add('visible'); // 添加 CSS 动画类

    // 定位逻辑：确保工具提示在视口内并尽可能显示在上方
    const spanRect = clickedSpan.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 计算默认位置（在 span 上方居中）
    let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
    let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10; // 10px 间距

    // 调整位置以适应视口
    // 确保不超出左边界 (至少留 10px 边距)
    if (left < scrollX + 10) {
        left = scrollX + 10;
    }
    // 确保不超出右边界 (至少留 10px 边距)
    if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) {
        left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
    }
    // 如果上方空间不足，则显示在下方 (至少留 10px 边距)
    if (top < scrollY + 10) {
        top = spanRect.bottom + scrollY + 10;
    }

    tooltipDiv.style.left = `${left}px`;
    tooltipDiv.style.top = `${top}px`;
}

/**
 * 隐藏工具提示。
 */
function hideTooltip() {
    clearTimeout(_currentHideTimeout); // 清除可能存在的显示定时器
    // 使用 setTimeout 延迟隐藏，允许鼠标从 span 移动到 tooltip，避免闪烁
    _currentHideTimeout = setTimeout(() => {
        if (tooltipDiv) {
            tooltipDiv.classList.remove('visible'); // 移除动画类
            // 在动画完成后彻底隐藏，避免在动画过程中被点击
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                if (_currentActiveTooltipSpan) {
                    _currentActiveTooltipSpan.classList.remove('active-tooltip-word'); // 移除点击高亮
                }
                _currentActiveTooltipSpan = null; // 清空当前活动 span 引用
            }, 300); // 这里的延迟应该与 CSS 中的 `transition` 动画时长保持一致 (例如 0.3s = 300ms)
        }
    }, 100); // 鼠标移开 span 后，延迟 100ms 再开始隐藏动画
}

/**
 * 更新当前章节的工具提示数据。
 * @param {Object} tooltipsData - 新的工具提示数据对象。
 */
export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    // console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData); // 调试信息
}
