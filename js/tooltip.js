// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
});

// --- 新增：Tooltip 数据在 tooltip.js 内部管理 ---
let _internalTooltipsData = {};

// --- 新增：Tooltip 状态管理变量，用于精确控制显示/隐藏 ---
let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

// loadTooltips 函数：它现在将数据存储在 _internalTooltipsData 中
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} - Check 'data/tooltips.json' path and content.`);
        }
        _internalTooltipsData = await res.json(); // 将加载的数据存储在内部变量中
        return _internalTooltipsData; // 仍然返回数据，以防 main.js 期望接收
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        _internalTooltipsData = {}; // 确保错误时内部数据为空
        return {};
    }
}

// renderMarkdownWithTooltips 函数：保持不变，但现在它会使用内部的 _internalTooltipsData
export function renderMarkdownWithTooltips(
    md,
    _unusedTooltipDataFromMain,
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

        if (_internalTooltipsData.hasOwnProperty(lowerMatch)) {
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


// setupTooltips 函数：它现在不再接收 tooltipData 参数
export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 移除所有旧的事件监听器，避免重复绑定
    document.querySelectorAll('.word').forEach(oldSpan => {
        const newSpan = oldSpan.cloneNode(true);
        oldSpan.parentNode.replaceChild(newSpan, oldSpan);
    });

    // 绑定新的事件监听器 - 核心修改：改为 'click' 事件
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('click', showTooltip); // 手机端点击触发
    });

    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    document.addEventListener('click', (e) => {
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') &&
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    });

    // 鼠标离开 tooltip 区域时也隐藏 tooltip (对桌面端和某些模拟事件有用)
    tooltipDiv.addEventListener('mouseleave', hideTooltip);

    // 鼠标进入 tooltip 区域时取消隐藏计时器 (防止在鼠标移动到 Tooltip 上时被隐藏)
    tooltipDiv.addEventListener('mouseenter', () => {
        clearTimeout(_currentHideTimeout);
    });

    // --- 新增：监听页面滚动事件，隐藏 Tooltip ---
    // 使用 document.addEventListener 监听 scroll 事件，并在滚动时隐藏 Tooltip
    // 注意：这里使用了 'scroll' 事件，适用于页面滚动。如果你的内容是内部可滚动区域，可能需要监听该区域的滚动。
    document.addEventListener('scroll', () => {
        // 只有当 Tooltip 可见时才执行隐藏操作，避免不必要的调用
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    }, { passive: true }); // 使用 { passive: true } 提高滚动性能


    function showTooltip(e) {
        clearTimeout(_currentHideTimeout);
        e.stopPropagation();

        if (_currentActiveTooltipSpan === e.target) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = e.target;
        const wordId = e.target.dataset.tooltipId;
        const data = _internalTooltipsData[wordId];

        if (data) {
            let htmlContent = '';

            if (data.title) {
                htmlContent += `<strong>${data.title}</strong><br>`;
            } else {
                htmlContent += `<strong>${wordId.split('-')[0]}</strong><br>`;
            }

            if (data.partOfSpeech) {
                htmlContent += `<em>(${data.partOfSpeech})</em><br>`;
            }

            if (data.description) {
                htmlContent += `${data.description}<br>`;
            } else if (data.definition) {
                htmlContent += `${data.definition}<br>`;
            }

            if (data["Image Description"]) {
                htmlContent += `${data["Image Description"]}<br>`;
            }

            if (data.example) {
                htmlContent += `${data.example}<br>`;
            }

            if (data.category) {
                htmlContent += `${data.category}`;
            }

            tooltipDiv.innerHTML = htmlContent;
            tooltipDiv.style.display = 'block';
            tooltipDiv.classList.add('visible');

            const spanRect = e.target.getBoundingClientRect();
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
            console.warn(`Tooltip data not found for ID: ${wordId}`);
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
