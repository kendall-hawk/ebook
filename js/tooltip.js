// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({
  gfm: true,
  breaks: true
});

// --- 新增：Tooltip 数据在 tooltip.js 内部管理 ---
// 这个变量将存储从 data/tooltips.json 加载的数据。
// _ 是一个约定，表示这个变量是模块内部私有的，不会与外部文件冲突。
let _internalTooltipsData = {};

// --- 新增：Tooltip 状态管理变量，用于精确控制显示/隐藏 ---
let _currentHideTimeout = null; // 用于控制 Tooltip 隐藏的计时器
let _currentActiveTooltipSpan = null; // 存储当前激活的 Tooltip 对应的 span 元素

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
    // 这里传入的 tooltipData 参数，现在在函数内部不再直接使用它来查找数据，
    // 而是使用 _internalTooltipsData。但这不影响外部文件的调用。
    _unusedTooltipDataFromMain, // 占位符，表示这个参数现在未使用
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

        // 关键：这里使用内部的 _internalTooltipsData 来检查单词是否存在
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
export function setupTooltips() { // 移除 tooltipData 参数，因为它现在使用内部变量
    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 移除所有旧的事件监听器，避免重复绑定
    // 使用 cloneNode(true) 替换元素以移除所有事件监听器，是最彻底的方法
    document.querySelectorAll('.word').forEach(oldSpan => {
        const newSpan = oldSpan.cloneNode(true);
        oldSpan.parentNode.replaceChild(newSpan, oldSpan);
    });

    // 绑定新的事件监听器 - 核心修改：改为 'click' 事件
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('click', showTooltip); // 🚀 手机端点击触发
    });

    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    document.addEventListener('click', (e) => {
        // 如果 tooltip 可见，并且点击的不是 Tooltip 触发词，也不是 Tooltip 容器本身，就隐藏 Tooltip
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') && // 点击的不是一个 .word 元素或其子元素
            !e.target.closest('#react-tooltips')) { // 点击的不是 Tooltip 容器或其子元素
            hideTooltip();
        }
    });

    // 鼠标离开 tooltip 区域时也隐藏 tooltip (对桌面端和某些模拟事件有用)
    tooltipDiv.addEventListener('mouseleave', hideTooltip);

    // 鼠标进入 tooltip 区域时取消隐藏计时器 (防止在鼠标移动到 Tooltip 上时被隐藏)
    tooltipDiv.addEventListener('mouseenter', () => {
        clearTimeout(_currentHideTimeout); // 使用内部计时器变量
    });


    function showTooltip(e) {
        clearTimeout(_currentHideTimeout); // 任何时候显示时，都清除之前的隐藏计时器
        e.stopPropagation(); // 阻止事件冒泡到 document 的点击事件

        // 如果点击的是当前已经显示的 Tooltip 对应的单词，则隐藏它
        if (_currentActiveTooltipSpan === e.target) { // 使用内部变量
            hideTooltip();
            _currentActiveTooltipSpan = null; // 清除当前激活的 span
            return; // 阻止再次显示
        }

        // 保存当前激活的 span，用于判断是否重复点击
        _currentActiveTooltipSpan = e.target; // 使用内部变量

        const wordId = e.target.dataset.tooltipId;
        const data = _internalTooltipsData[wordId]; // 关键：使用内部的 _internalTooltipsData 获取数据

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
        clearTimeout(_currentHideTimeout); // 使用内部计时器变量
        _currentHideTimeout = setTimeout(() => { // 使用内部计时器变量
            tooltipDiv.classList.remove('visible');
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                _currentActiveTooltipSpan = null; // 隐藏时清除激活的 span
            }, 300);
        }, 100);
    }
}
