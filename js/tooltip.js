// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({ gfm: true, breaks: true });

let _internalTooltipsData = {};
let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

// 加载 tooltip 数据
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

// 渲染 markdown（带 tooltip 和词频字体大小）
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

    // 处理 tooltip 特殊语法 [[word|id]]
    md = md.replace(/\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g, (_, word, id) => {
        const lower = word.toLowerCase();
        const freq = wordFrequenciesMap.get(lower) || 0;
        const size = freq > 0 ? baseFontSize + (freq / maxFreq) * maxFontSizeIncrease : baseFontSize;
        const key = `__PLACEHOLDER_${counter++}__`;
        customPlaceholders[key] = `<span class="word" data-tooltip-id="${id}" style="font-size:${size.toFixed(1)}px">${word}</span>`;
        return key;
    });

    // 将 Markdown 转 HTML（不再覆盖 placeholder）
    let html = marked.parse(md);

    // 恢复带 tooltip 的 span 占位符
    for (const [key, value] of Object.entries(customPlaceholders)) {
        html = html.replaceAll(key, value);
    }

    // 用 DOM 处理其余普通单词，应用词频大小
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const walkTextNodes = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const fragment = document.createDocumentFragment();
            const parts = node.textContent.split(/\b/);
            parts.forEach(text => {
                const wordMatch = /^[a-zA-Z0-9'-]+$/.test(text);
                if (wordMatch) {
                    const lower = text.toLowerCase();
                    const freq = wordFrequenciesMap.get(lower) || 0;
                    const size = freq > 0 ? baseFontSize + (freq / maxFreq) * maxFontSizeIncrease : baseFontSize;

                    if (_internalTooltipsData.hasOwnProperty(lower)) {
                        const span = document.createElement('span');
                        span.className = 'word';
                        span.dataset.tooltipId = lower;
                        span.style.fontSize = `${size.toFixed(1)}px`;
                        span.textContent = text;
                        fragment.appendChild(span);
                    } else if (freq > 0) {
                        const span = document.createElement('span');
                        span.style.fontSize = `${size.toFixed(1)}px`;
                        span.textContent = text;
                        fragment.appendChild(span);
                    } else {
                        fragment.appendChild(document.createTextNode(text));
                    }
                } else {
                    fragment.appendChild(document.createTextNode(text));
                }
            });
            node.replaceWith(fragment);
        } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
            [...node.childNodes].forEach(walkTextNodes);
        }
    };

    walkTextNodes(wrapper);
    return wrapper.innerHTML;
}

// 初始化 tooltip 事件
export function setupTooltips() {
    const tooltip = document.getElementById('react-tooltips');
    const container = document.getElementById('content-area') || document.body;
    if (!tooltip) {
        console.warn('#react-tooltips not found.');
        return;
    }

    if (window._tooltipGlobalClickListener) document.removeEventListener('click', window._tooltipGlobalClickListener);
    if (window._tooltipScrollListener) document.removeEventListener('scroll', window._tooltipScrollListener);

    container.addEventListener('click', (e) => {
        const span = e.target.closest('.word');
        if (span) showTooltip(span);
        else if (!e.target.closest('#react-tooltips')) hideTooltip();
    });

    window._tooltipGlobalClickListener = (e) => {
        if (!e.target.closest('.word') && !e.target.closest('#react-tooltips')) hideTooltip();
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);

    tooltip.addEventListener('mouseleave', hideTooltip);
    tooltip.addEventListener('mouseenter', () => clearTimeout(_currentHideTimeout));

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