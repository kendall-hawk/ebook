// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
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
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // Remove old event listeners to prevent duplicates
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
        console.log('--- showTooltip Debug Info ---');
        console.log('Tooltip ID:', tooltipId);
        console.log('Fetched Tooltip Data:', data);

        if (data) {
            let htmlContent = '';
            // Adjust fieldsOrder to separate 'image' and 'imageDescription'
            const fieldsOrder = [
                'word', 'title', 'partOfSpeech', 'pronunciation', 'definition',
                'contextualMeaning', 'exampleSentence', 'videoLink',
                'image', // Image path itself
                'imageDescription', // Text description of the image
                'synonyms', 'antonyms', 'etymology',
                'category', 'source', 'lastUpdated'
            ];

            fieldsOrder.forEach(field => {
                const value = data[field];
                console.log(`Processing field: "${field}", Value:`, value); // Debug: log each field and its value

                // Only attempt to render if value is not empty or undefined
                if (value === undefined || value === null || value === '') {
                    console.log(`Field "${field}" is empty or not present, skipping.`);
                    return;
                }

                let formattedValue = Array.isArray(value) ? value.join(', ') : value;

                // --- Explicitly handle each field ---
                if (field === 'word' || field === 'title') {
                    htmlContent += `<p class="tooltip-title"><strong>${formattedValue}</strong></p>`;
                } else if (field === 'partOfSpeech') {
                    htmlContent += `<p class="tooltip-pos">(${formattedValue})</p>`;
                } else if (field === 'pronunciation') {
                    htmlContent += `<p class="tooltip-pronunciation">/${formattedValue}/</p>`;
                } else if (field === 'definition') {
                    htmlContent += `<p class="tooltip-definition">${formattedValue}</p>`;
                } else if (field === 'contextualMeaning') {
                    htmlContent += `<p class="tooltip-contextual-meaning">💡 Visual Sense: <em>${formattedValue}</em></p>`; // Changed prefix
                } else if (field === 'exampleSentence') {
                    htmlContent += `<p class="tooltip-example">Example: <em>${formattedValue}</em></p>`; // Changed prefix
                } else if (field === 'videoLink') {
                    const videoId = extractVideoId(formattedValue);
                    if (videoId) {
                         htmlContent += `<div class="tooltip-video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}?enablejsapi=1" frameborder="0" allowfullscreen></iframe></div>`;
                         console.log(`Rendered video for ${tooltipId} from: ${formattedValue}`);
                    } else {
                        console.warn(`Could not extract video ID from: ${formattedValue}`);
                    }
                } else if (field === 'image') { // NEW: Handle image path independently
                    htmlContent += `<img src="${formattedValue}" alt="Tooltip Image" class="tooltip-image">`;
                    console.log(`Rendered image for ${tooltipId} from: ${formattedValue}`);
                } else if (field === 'imageDescription') { // NEW: Handle image description independently
                    htmlContent += `<p class="tooltip-image-description-text">ImageDescription: <em>${formattedValue}</em></p>`; // Changed prefix
                } else if (field === 'synonyms') {
                    htmlContent += `<p class="tooltip-synonyms">Synonyms: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'antonyms') {
                    htmlContent += `<p class="tooltip-antonyms">Antonyms: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'etymology') {
                    htmlContent += `<p class="tooltip-etymology">Etymology: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'category') {
                    htmlContent += `<p class="tooltip-category">Category: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'source') {
                    htmlContent += `<p class="tooltip-source">Source: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'lastUpdated') {
                    htmlContent += `<p class="tooltip-last-updated">Updated: ${formattedValue}</p>`; // Changed prefix
                } else {
                    // This block should rarely be triggered if all expected fields are handled
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

            // Positioning logic remains unchanged
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
        console.log('--- showTooltip Debug End ---');
    }

    function hideTooltip() {
        clearTimeout(_currentHideTimeout);
        _currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible');
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                _currentActiveTooltipSpan = null;
            }, 300); // Matches CSS transition time
        }, 100); // Delay hide to allow user to move mouse to tooltip
    }

    // Helper function: Extracts video ID from YouTube URL
    function extractVideoId(url) {
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|\?(?:v=)|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regExp);
        return (match && match[1]) ? match[1] : null;
    }
}

let _activeChapterTooltipsData = {}; // Stores tooltip data for the current chapter

export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData);
}
