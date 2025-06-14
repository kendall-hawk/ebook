import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({ gfm: true, breaks: true });

// 内部状态变量
let _internalTooltipsData = {};
let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

// 加载 Tooltip 数据
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        _internalTooltipsData = await res.json();
        return _internalTooltipsData;
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        _internalTooltipsData = {};
        return {};
    }
}

// 渲染 markdown 并处理词频与 tooltip
export function renderMarkdownWithTooltips(
    md,
    _unused,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12
) {
    const customPlaceholders = {};
    let counter = 0;

    // 处理 [[word|tooltipId]]
    md = md.replace(/\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g, (_, word, id) => {
        const freq = wordFrequenciesMap.get(word.toLowerCase()) || 0;
        const size = freq > 0 ? baseFontSize + (freq / maxFreq) * maxFontSizeIncrease : baseFontSize;
        const placeholder = `__CUSTOM_SPAN_${counter++}__`;
        customPlaceholders[placeholder] = `<span class="word" data-tooltip-id="${id}" style="font-size:${size.toFixed(1)}px">${word}</span>`;
        return placeholder;
    });

    // 普通词处理
    md = md.replace(/\b([a-zA-Z0-9'-]+)\b/g, (word) => {
        if (customPlaceholders[word]) return word;
        const lower = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lower) || 0;
        const size = freq > 0 ? baseFontSize + (freq / maxFreq) * maxFontSizeIncrease : baseFontSize;
        if (_internalTooltipsData.hasOwnProperty(lower)) {
            return `<span class="word" data-tooltip-id="${lower}" style="font-size:${size.toFixed(1)}px">${word}</span>`;
        } else if (freq > 0) {
            return `<span style="font-size:${size.toFixed(1)}px">${word}</span>`;
        }
        return word;
    });

    // 插入占位 span
    for (const [ph, html] of Object.entries(customPlaceholders)) {
        md = md.replaceAll(ph, html);
    }

    return marked.parse(md);
}

// 初始化 tooltip 行为（事件委托、位置计算等）
export function setupTooltips() {
    const tooltip = document.getElementById('react-tooltips');
    const container = document.getElementById('content-area') || document.body;

    if (!tooltip) {
        console.warn('#react-tooltips not found.');
        return;
    }

    // 清除旧事件
    if (window._tooltipGlobalClickListener) document.removeEventListener('click', window._tooltipGlobalClickListener);
    if (window._tooltipScrollListener) document.removeEventListener('scroll', window._tooltipScrollListener);

    // 委托点击处理 word 元素
    container.addEventListener('click', (e) => {
        const span = e.target.closest('.word');
        if (span) showTooltip(span);
        else if (!e.target.closest('#react-tooltips')) hideTooltip();
    });

    // 全局点击关闭
    window._tooltipGlobalClickListener = (e) => {
        if (!e.target.closest('.word') && !e.target.closest('#react-tooltips')) hideTooltip();
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);

    // 鼠标移出 tooltip
    tooltip.addEventListener('mouseleave', hideTooltip);
    tooltip.addEventListener('mouseenter', () => clearTimeout(_currentHideTimeout));

    // 滚动关闭 tooltip
    window._tooltipScrollListener = () => {
        if (tooltip.classList.contains('visible')) hideTooltip();
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });

    function showTooltip(span) {
        clearTimeout(_currentHideTimeout);
        if (_currentActiveTooltipSpan === span) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = span;
        const id = span.dataset.tooltipId;
        const data = _internalTooltipsData[id];
        if (!data) return console.warn(`No tooltip for ID: ${id}`), hideTooltip();

        let html = `<strong>${data.title || id}</strong><br>`;
        if (data.partOfSpeech) html += `<em>(${data.partOfSpeech})</em><br>`;
        if (data.description) html += `${data.description}<br>`;
        else if (data.definition) html += `${data.definition}<br>`;
        if (data["Image Description"]) html += `${data["Image Description"]}<br>`;
        if (data.example) html += `${data.example}<br>`;
        if (data.category) html += `${data.category}`;

        tooltip.innerHTML = html;
        tooltip.style.display = 'block';
        tooltip.classList.add('visible');

        // 位置计算
        const rect = span.getBoundingClientRect();
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let left = rect.left + scrollX + rect.width / 2 - tooltip.offsetWidth / 2;
        let top = rect.top + scrollY - tooltip.offsetHeight - 10;
        if (left < 10) left = 10;
        if (left + tooltip.offsetWidth > vw - 10) left = vw - tooltip.offsetWidth - 10;
        if (top < 10) top = rect.bottom + scrollY + 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
        clearTimeout(_currentHideTimeout);
        _currentHideTimeout = setTimeout(() => {
            tooltip.classList.remove('visible');
            setTimeout(() => {
                tooltip.style.display = 'none';
                _currentActiveTooltipSpan = null;
            }, 300);
        }, 100);
    }
}