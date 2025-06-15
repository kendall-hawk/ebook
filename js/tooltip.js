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


// setupTooltips 函数：使用事件委托
export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    // 你需要有一个包裹所有文本内容的父容器，例如 #content 或 body
    // 这里我假设你的文本内容最终会渲染到 `document.body` 或某个主内容区域，
    // 或者你可以创建一个特定的容器 ID 来包裹所有带有 `.word` 的文本。
    // 如果没有一个明确的父容器，直接绑定到 document 也是可以的，但更推荐限定范围。
    const contentContainer = document.getElementById('content-area') || document.body; // 假设你的内容在 id 为 'content-area' 的元素中，如果没有则使用 body

    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // 移除之前的全局点击事件监听器，避免重复绑定
    // 这是一个清理步骤，确保每次调用 setupTooltips 时不会重复添加相同的事件
    if (window._tooltipGlobalClickListener) {
        document.removeEventListener('click', window._tooltipGlobalClickListener);
    }
    if (window._tooltipScrollListener) {
        document.removeEventListener('scroll', window._tooltipScrollListener);
    }

    // 使用事件委托绑定点击事件到父容器
    // 这样，即使 .word 元素是动态生成的，也能捕获到点击事件
    contentContainer.addEventListener('click', function(e) {
        const targetSpan = e.target.closest('.word');
        if (targetSpan) {
            showTooltip(e, targetSpan); // 传入 targetSpan 确保操作的是点击的元素
        } else if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('#react-tooltips')) { // 确保点击的不是 tooltip 本身
            hideTooltip();
        }
    });


    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    // 将函数引用保存起来，以便后续移除
    window._tooltipGlobalClickListener = (e) => {
        // 如果点击的目标是 tooltip 本身，或者点击的目标是 .word 元素（已经由上面的委托处理），则不隐藏
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') &&
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);


    // 鼠标离开 tooltip 区域时也隐藏 tooltip (对桌面端和某些模拟事件有用)
    tooltipDiv.addEventListener('mouseleave', hideTooltip);

    // 鼠标进入 tooltip 区域时取消隐藏计时器 (防止在鼠标移动到 Tooltip 上时被隐藏)
    tooltipDiv.addEventListener('mouseenter', () => {
        clearTimeout(_currentHideTimeout);
    });

    // --- 新增：监听页面滚动事件，隐藏 Tooltip ---
    // 使用 document.addEventListener 监听 scroll 事件，并在滚动时隐藏 Tooltip
    window._tooltipScrollListener = () => {
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });


    function showTooltip(e, clickedSpan) { // 接收点击的 span 元素
        clearTimeout(_currentHideTimeout);
        e.stopPropagation();

        // 如果点击的是当前已经激活的 span，则隐藏并重置
        if (_currentActiveTooltipSpan === clickedSpan) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = clickedSpan; // 更新当前激活的 span
        const wordId = clickedSpan.dataset.tooltipId; // 从点击的 span 获取 ID
        const data = _internalTooltipsData[wordId];

        if (data) {
            let htmlContent = '';

            // 保持你的内容生成逻辑不变
            if (data.title) {
                htmlContent += `<strong>${data.title}</strong><br>`;
            } else {
                // wordId.split('-')[0] 对于自定义 tooltip [[word|tooltipId]] 可能是 tooltipId，需要确认你的数据结构
                // 如果是 regular word，wordId 就是 word 本身
                htmlContent += `<strong>${wordId}</strong><br>`;
            }

            if (data.partOfSpeech) {
                htmlContent += `(${data.partOfSpeech})<br>`;
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

            const spanRect = clickedSpan.getBoundingClientRect(); // 使用点击的 span 的位置
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
            let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10;

            if (left < scrollX + 10) left = scrollX + 10;
            if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
            if (top < scrollY + 10) top = spanRect.bottom + scrollY + 10; // 如果上方空间不足，则在下方显示

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
                _currentActiveTooltipSpan = null; // 重置当前激活的 span
            }, 300); // 应该和 CSS transition duration 一致
        }, 100); // 稍微延迟，以便鼠标从 span 移动到 tooltip
    }
}