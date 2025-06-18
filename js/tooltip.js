// js/tooltip.js (重构版 - 更新导入路径和 YouTube URL)

import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
// 导入 youtube.js 中的 YouTube 工具函数
import { extractVideoId, getYouTubeEmbedUrl } from './youtube.js';

marked.setOptions({
  gfm: true,
  breaks: true,
  sanitize: false,
  sanitizer: (html) => html,
});

let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;
let _activeChapterTooltipsData = {};

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
        if (customSpanPlaceholders[match]) return match;
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

    return marked.parse(finalProcessedMd);
}

export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    const contentContainer = document.getElementById('chapters') || document.body;

    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found.');
        return;
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

    contentContainer.addEventListener('click', function (e) {
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

    tooltipDiv._mouseLeaveListener = hideTooltip;
    tooltipDiv.addEventListener('mouseleave', tooltipDiv._mouseLeaveListener);

    tooltipDiv._mouseEnterListener = () => {
        clearTimeout(_currentHideTimeout);
    };
    tooltipDiv.addEventListener('mouseenter', tooltipDiv._mouseEnterListener);

    window._tooltipScrollListener = () => {
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });

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
        const data = _activeChapterTooltipsData[tooltipId];

        if (!data) {
            console.warn(`Tooltip data not found for ID: ${tooltipId}`);
            hideTooltip();
            return;
        }

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
            if (!value) return;

            const formatted = Array.isArray(value) ? value.join(', ') : value;

            if (field === 'word' || field === 'title') {
                htmlContent += `<p class="tooltip-title"><strong>${formatted}</strong></p>`;
            } else if (field === 'partOfSpeech') {
                htmlContent += `<p class="tooltip-pos">(${formatted})</p>`;
            } else if (field === 'pronunciation') {
                htmlContent += `<p class="tooltip-pronunciation">/${formatted}/</p>`;
            } else if (field === 'definition') {
                htmlContent += `<p class="tooltip-definition">${formatted}</p>`;
            } else if (field === 'contextualMeaning') {
                htmlContent += `<p class="tooltip-contextual-meaning">💡 Visual Sense: <em>${formatted}</em></p>`;
            } else if (field === 'exampleSentence') {
                htmlContent += `<p class="tooltip-example"><strong>example:</strong> ${formatted}</p>`;
            } else if (field === 'videoLink') {
                const videoId = extractVideoId(formatted); // 使用 youtube.js 的 extractVideoId
                if (videoId) {
                    // 修正：使用 youtube.js 的 getYouTubeEmbedUrl
                    htmlContent += `<div class="tooltip-video-wrapper"><iframe src="${getYouTubeEmbedUrl(videoId, true)}" frameborder="0" allowfullscreen></iframe></div>`;
                }
            } else if (field === 'image') {
                htmlContent += `<img src="${formatted}" alt="Tooltip Image" class="tooltip-image">`;
            } else if (field === 'imageDescription') {
                htmlContent += `<p class="tooltip-image-description-text"><strong>ImageDescription:</strong> ${formatted}</p>`;
            } else if (field === 'synonyms') {
                htmlContent += `<p class="tooltip-synonyms"><strong>synonyms:</strong> ${formatted}</p>`;
            } else if (field === 'antonyms') {
                htmlContent += `<p class="tooltip-antonyms"><strong>antonyms:</strong> ${formatted}</p>`;
            } else if (field === 'etymology') {
                htmlContent += `<p class="tooltip-etymology">Etymology: ${formatted}</p>`;
            } else if (field === 'category') {
                htmlContent += `<p class="tooltip-category">Category: ${formatted}</p>`;
            } else if (field === 'source') {
                htmlContent += `<p class="tooltip-source">Source: ${formatted}</p>`;
            } else if (field === 'lastUpdated') {
                htmlContent += `<p class="tooltip-last-updated">Updated: ${formatted}</p>`;
            }
        });

        if (!htmlContent) {
            htmlContent = `<p>No detailed information available for "${tooltipId}".</p>`;
        }

        tooltipDiv.innerHTML = htmlContent;
        tooltipDiv.style.display = 'block';
        tooltipDiv.classList.add('visible');

        const spanRect = clickedSpan.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
        let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10;

        if (left < scrollX + 10) left = scrollX + 10;
        if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) {
            left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
        }
        if (top < scrollY + 10) {
            top = spanRect.bottom + scrollY + 10;
        }

        tooltipDiv.style.left = `${left}px`;
        tooltipDiv.style.top = `${top}px`;
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

export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData);
}
