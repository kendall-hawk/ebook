// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
});

// 这个 loadTooltips 函数保持不变
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} - Check 'data/tooltips.json' path and content.`);
        }
        return await res.json();
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        return {};
    }
}

// renderMarkdownWithTooltips 函数保持不变
export function renderMarkdownWithTooltips(
    md,
    tooltipData,
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

    const tooltipWords = Object.keys(tooltipData);
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

        if (tooltipWords.includes(lowerMatch)) {
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


// setupTooltips 函数 - 核心修改在这里
export function setupTooltips(tooltipData) { // tooltipData 仍然通过参数传入
    // 移除所有旧的事件监听器，避免重复绑定
    // 使用 cloneNode(true) 替换元素以移除所有事件监听器，是最彻底的方法
    document.querySelectorAll('.word').forEach(oldSpan => {
        const newSpan = oldSpan.cloneNode(true);
        oldSpan.parentNode.replaceChild(newSpan, oldSpan);
    });

    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 绑定新的事件监听器 - 核心修改：从 'mouseover' 改为 'click'
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('click', showTooltip); // 手机端推荐 click
    });

    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    document.addEventListener('click', (e) => {
        // 如果 tooltip 可见，并且点击的不是一个 .word 元素（或其子元素），
        // 并且点击的也不是 tooltip 容器本身，就隐藏 tooltip。
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') &&
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    });

    // 鼠标离开 tooltip 区域时也隐藏 tooltip (对桌面端和某些模拟事件有用)
    tooltipDiv.addEventListener('mouseleave', hideTooltip); // 保留 mouseleave，但行为可能不同于 click

    // 鼠标进入 tooltip 区域时取消隐藏计时器 (防止在移动到 tooltip 上时被隐藏)
    // 注意：在 click 模式下，这个可能不那么重要，但保留无害。
    tooltipDiv.addEventListener('mouseenter', () => {
        // 如果你之前有 currentHideTimeout 变量，这里需要它被正确定义
        // 如果没有，这行可能会报错。为了安全，我将其注释掉或确保它只在定义时才使用。
        // 如果你之前的代码没有定义 currentHideTimeout，请取消注释下一行：
        // clearTimeout(currentHideTimeout);
    });


    function showTooltip(e) {
        // 如果你之前有 currentHideTimeout 变量，这里需要它被正确定义
        // 如果没有，这行可能会报错。
        // clearTimeout(currentHideTimeout); // 移除这行，因为它可能依赖未定义的变量，导致页面空白

        e.stopPropagation(); // 阻止事件冒泡到 document 的点击事件

        const wordId = e.target.dataset.tooltipId;
        const data = tooltipData[wordId]; // 直接使用传入的 tooltipData

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
            let left = spanRect.left + window.scrollX;
            let top = spanRect.top + window.scrollY - tooltipDiv.offsetHeight - 5;

            if (left < 0) {
                left = 0;
            }
            if (left + tooltipDiv.offsetWidth > window.innerWidth) {
                left = window.innerWidth - tooltipDiv.offsetWidth;
            }
            if (top < window.scrollY) {
                top = spanRect.bottom + window.scrollY + 5;
            }

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;
        } else {
            console.warn(`Tooltip data not found for ID: ${wordId}`);
            hideTooltip();
        }
    }

    function hideTooltip() {
        // 如果你之前有 currentHideTimeout 变量，这里需要它被正确定义
        // clearTimeout(currentHideTimeout); // 移除这行，因为它可能依赖未定义的变量

        tooltipDiv.style.display = 'none';
        tooltipDiv.classList.remove('visible');
    }
}
