/**
 * js/tooltip.js
 * 负责渲染带有工具提示和词频样式的文本，并管理工具提示的显示/隐藏逻辑。
 */

import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import { extractVideoId, getYouTubeEmbedUrl } from './youtube.js';

// 确保 Marked.js 配置只执行一次，且在解析前生效
if (!marked._isConfigured) {
  marked.setOptions({
    gfm: true,
    breaks: true,
    sanitize: false, // 核心：不转义用户提供的HTML，允许span标签通过
  });
  marked._isConfigured = true; // 标记已配置
  console.log("Marked.js initialized with sanitize: false.");
}


let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;
let _activeChapterTooltipsData = {}; // 存储当前章节的工具提示数据

// 全局的 tooltip 容器引用
let tooltipDiv = null;

/**
 * 渲染 Markdown 文本，并注入工具提示和词频样式。
 * @param {string} md - 原始 Markdown 文本。
 * @param {Object} currentChapterTooltips - 当前章节的工具提示数据。
 * @param {Map<string, number>} wordFrequenciesMap - 全局词频 Map。
 * @param {number} maxFreq - 全局最大词频。
 * @param {number} [baseFontSize=16] - 基础字体大小 (px)。
 * @param {number} [maxFontSizeIncrease=12] - 最大字体增大值 (px)。
 * @returns {string} 渲染后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md,
    currentChapterTooltips,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    if (!md || typeof md !== 'string') return '';

    // 步骤 1: 处理自定义工具提示语法 [[word|tooltipId]]
    // 这是一个更健壮的正则，确保只匹配自定义的 [[...]] 格式
    const customTooltipPattern = /\[\[([\p{L}\p{N}'-]+)\|([a-zA-Z0-9_-]+)\]\]/gu; // 支持Unicode字母和数字
    let tempMd = md.replace(customTooltipPattern, (match, word, tooltipId) => {
        const lowerWord = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';
        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }
        // 直接返回 HTML 字符串。由于 sanitize: false，Marked.js 会保留这些标签
        return `<span data-tooltip-id="${tooltipId}" class="word" style="${fontSizeStyle}">${word}</span>`;
    });

    // 步骤 2: 处理普通单词的词频和工具提示
    // 匹配常规单词：连续的字母、数字、连字符或撇号 (Unicode支持)
    const regularWordPattern = /([\p{L}\p{N}]+(?:['\-\u2010-\u2015][\p{L}\p{N}]+)*)/gu;
    let finalProcessedMd = tempMd.replace(regularWordPattern, (match, word) => {
        // 检查这个 match 是否已经被自定义工具提示处理过 (即它已经是 <span ...> 标签的一部分)
        // 这里的判断是基于 match 是否是完整的 HTML 标签，Marked.js 不会再处理它
        // 由于我们自定义的span标签不会被 `regularWordPattern` 再次匹配，此步骤是安全的。
        // 所以这里只需要处理不是HTML标签的普通文本单词
        if (match.startsWith('<') && match.endsWith('>')) {
            return match; // 如果已经是 HTML 标签，则跳过
        }

        const lowerWord = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';
        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        if (currentChapterTooltips.hasOwnProperty(lowerWord)) {
            // 如果有对应的工具提示，则添加 data-tooltip-id
            return `<span data-tooltip-id="${lowerWord}" class="word" style="${fontSizeStyle}">${word}</span>`;
        } else if (fontSizeStyle) {
            // 如果没有工具提示，但有词频样式，也应用 span
            return `<span style="${fontSizeStyle}">${word}</span>`;
        }
        return match; // 不处理，原样返回
    });

    // 步骤 3: 使用 Marked.js 解析最终的 Markdown 文本
    const renderedHtml = marked.parse(finalProcessedMd);
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

    // 清理旧的事件监听器，避免重复绑定
    // 使用命名函数引用方便移除
    if (tooltipDiv._listeners) {
        tooltipDiv.removeEventListener('mouseleave', tooltipDiv._listeners.mouseleave);
        tooltipDiv.removeEventListener('mouseenter', tooltipDiv._listeners.mouseenter);
        chaptersContainer.removeEventListener('click', tooltipDiv._listeners.chapterClick);
        document.removeEventListener('click', tooltipDiv._listeners.docClick);
        document.removeEventListener('scroll', tooltipDiv._listeners.docScroll);
        // 清理当前活动的高亮
        if (_currentActiveTooltipSpan) {
            _currentActiveTooltipSpan.classList.remove('active-tooltip-word'); // 移除可能的点击高亮
            _currentActiveTooltipSpan = null;
        }
        hideTooltip(); // 隐藏任何可能显示的旧tooltip
    }

    const listeners = {
        mouseleave: () => { _currentHideTimeout = setTimeout(hideTooltip, 100); },
        mouseenter: () => { clearTimeout(_currentHideTimeout); },
        chapterClick: (e) => {
            const targetSpan = e.target.closest('.word[data-tooltip-id]'); // 只监听带有 data-tooltip-id 的 .word
            if (targetSpan) {
                showTooltip(e, targetSpan);
            } else if (tooltipDiv.classList.contains('visible') && !e.target.closest('#react-tooltips')) {
                // 点击章节内容空白处，且不是工具提示本身，则隐藏
                hideTooltip();
            }
        },
        docClick: (e) => {
            // 如果点击发生在工具提示外部且不是 .word 元素
            if (tooltipDiv.classList.contains('visible') &&
                !e.target.closest('.word[data-tooltip-id]') && // 确保不是带 tooltip 的词
                !e.target.closest('#react-tooltips')) {
                hideTooltip();
            }
        },
        docScroll: () => {
            if (tooltipDiv.classList.contains('visible')) {
                hideTooltip();
            }
        }
    };

    tooltipDiv.addEventListener('mouseleave', listeners.mouseleave);
    tooltipDiv.addEventListener('mouseenter', listeners.mouseenter);
    chaptersContainer.addEventListener('click', listeners.chapterClick); // 使用事件委托
    document.addEventListener('click', listeners.docClick); // 全局点击监听
    document.addEventListener('scroll', listeners.docScroll, { passive: true }); // 滚动监听

    tooltipDiv._listeners = listeners; // 保存监听器引用以便清理

    // 初始化时隐藏 tooltip
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
    clearTimeout(_currentHideTimeout);
    e.stopPropagation(); // 阻止事件冒泡

    // 移除旧的高亮
    if (_currentActiveTooltipSpan && _currentActiveTooltipSpan !== clickedSpan) {
        _currentActiveTooltipSpan.classList.remove('active-tooltip-word');
    }

    // 如果重复点击同一个 span，则隐藏工具提示
    if (_currentActiveTooltipSpan === clickedSpan && tooltipDiv.classList.contains('visible')) {
        hideTooltip();
        _currentActiveTooltipSpan = null;
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

    // 定义字段显示顺序和格式
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
                htmlContent += `<p class="tooltip-example"><strong>example:</strong> ${formatted}</p>`;
                break;
            case 'videoLink':
                const videoId = extractVideoId(formatted);
                if (videoId) {
                    htmlContent += `<div class="tooltip-video-wrapper" style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin-bottom:10px;">
                                      <iframe src="${getYouTubeEmbedUrl(videoId, false)}" frameborder="0" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;"></iframe>
                                    </div>`;
                }
                break;
            case 'image':
                htmlContent += `<img src="${formatted}" alt="Tooltip Image" class="tooltip-image" style="max-width:100%;height:auto;margin-top:10px;">`;
                break;
            case 'imageDescription':
                htmlContent += `<p class="tooltip-image-description-text"><strong>ImageDescription:</strong> ${formatted}</p>`;
                break;
            case 'synonyms':
                htmlContent += `<p class="tooltip-synonyms"><strong>synonyms:</strong> ${formatted}</p>`;
                break;
            case 'antonyms':
                htmlContent += `<p class="tooltip-antonyms"><strong>antonyms:</strong> ${formatted}</p>`;
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
    tooltipDiv.classList.add('visible'); // 添加动画类

    // 定位逻辑
    const spanRect = clickedSpan.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
    let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10; // 默认显示在上方

    // 确保不超出左边界
    if (left < scrollX + 10) {
        left = scrollX + 10;
    }
    // 确保不超出右边界
    if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) {
        left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
    }
    // 如果上方空间不足，则显示在下方
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
    clearTimeout(_currentHideTimeout);
    _currentHideTimeout = setTimeout(() => {
        if (tooltipDiv) {
            tooltipDiv.classList.remove('visible');
            // 动画完成后再彻底隐藏
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                if (_currentActiveTooltipSpan) {
                    _currentActiveTooltipSpan.classList.remove('active-tooltip-word'); // 移除点击高亮
                }
                _currentActiveTooltipSpan = null;
            }, 300); // 应该与CSS动画时长匹配
        }
    }, 100); // 短暂延迟，允许鼠标从span移动到tooltip
}

/**
 * 更新当前章节的工具提示数据。
 * @param {Object} tooltipsData - 新的工具提示数据。
 */
export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    // console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData);
}
