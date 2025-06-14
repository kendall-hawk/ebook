// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({ gfm: true, breaks: true });

let tooltipsData = {};
let hideTimeout = null;
let activeSpan = null;

// 加载 tooltip 数据
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        tooltipsData = await res.json();
        return tooltipsData;
    } catch (err) {
        console.error('加载 tooltip 数据失败:', err);
        tooltipsData = {};
        return {};
    }
}

// 渲染 markdown，并插入 tooltip 与词频样式
export function renderMarkdownWithTooltips(md, _unused, freqMap, maxFreq, baseSize = 16, maxInc = 12) {
    const placeholderMap = {};
    let counter = 0;

    // 匹配 [[word|id]] 并生成 placeholder
    md = md.replace(/\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g, (_, word, id) => {
        const lw = word.toLowerCase();
        const freq = freqMap.get(lw) || 0;
        const size = freq > 0 ? baseSize + (freq / maxFreq) * maxInc : baseSize;
        const key = `__PLACEHOLDER_${counter++}__`;
        placeholderMap[key] = `<span class="word" data-tooltip-id="${id}" style="font-size:${size.toFixed(1)}px">${word}</span>`;
        return key;
    });

    // 转换为 HTML
    let html = marked.parse(md);

    // 替换占位符为真实 span
    for (const [ph, span] of Object.entries(placeholderMap)) {
        html = html.replaceAll(ph, span);
    }

    // 应用词频样式与 tooltip（普通文本）
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    const applyFreqStyling = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const frag = document.createDocumentFragment();
            const parts = node.textContent.split(/\b/);

            for (const part of parts) {
                const isWord = /^[a-zA-Z0-9'-]+$/.test(part);
                if (isWord) {
                    const lw = part.toLowerCase();
                    const freq = freqMap.get(lw) || 0;
                    const size = freq > 0 ? baseSize + (freq / maxFreq) * maxInc : baseSize;

                    const span = document.createElement('span');
                    span.textContent = part;
                    span.style.fontSize = `${size.toFixed(1)}px`;

                    if (tooltipsData.hasOwnProperty(lw)) {
                        span.className = 'word';
                        span.dataset.tooltipId = lw;
                    }

                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(part));
                }
            }

            node.replaceWith(frag);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            [...node.childNodes].forEach(applyFreqStyling);
        }
    };

    applyFreqStyling(wrapper);
    return wrapper.innerHTML;
}

// 初始化 tooltip 功能
export function setupTooltips() {
    const tooltip = document.getElementById('react-tooltips');
    const container = document.getElementById('content-area') || document.body;

    if (!tooltip) {
        console.warn('未找到 #react-tooltips 元素');
        return;
    }

    // 清理旧监听器
    document.removeEventListener('click', window._tooltipGlobalClickListener);
    document.removeEventListener('scroll', window._tooltipScrollListener);

    // 点击展示 tooltip
    container.addEventListener('click', (e) => {
        const target = e.target.closest('.word');
        if (target) {
            showTooltip(target);
        } else if (!e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    });

    // 全局点击隐藏
    window._tooltipGlobalClickListener = (e) => {
        if (!e.target.closest('.word') && !e.target.closest('#react-tooltips')) hideTooltip();
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);

    // 鼠标离开隐藏 tooltip
    tooltip.addEventListener('mouseleave', hideTooltip);
    tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimeout));

    // 滚动隐藏 tooltip
    window._tooltipScrollListener = () => {
        if (tooltip.classList.contains('visible')) hideTooltip();
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });

    function showTooltip(span) {
        clearTimeout(hideTimeout);
        if (activeSpan === span) {
            hideTooltip();
            activeSpan = null;
            return;
        }

        activeSpan = span;
        const id = span.dataset.tooltipId;
        const data = tooltipsData[id];
        if (!data) {
            console.warn(`缺少 tooltip 数据: ${id}`);
            return hideTooltip();
        }

        const lines = [
            `<strong>${data.title || id}</strong>`,
            data.partOfSpeech ? `<em>(${data.partOfSpeech})</em>` : '',
            data.description || data.definition || '',
            data["Image Description"] || '',
            data.example || '',
            data.category || ''
        ].filter(Boolean);

        tooltip.innerHTML = lines.join('<br>');
        tooltip.style.display = 'block';
        tooltip.classList.add('visible');

        // 计算位置
        const rect = span.getBoundingClientRect();
        const { scrollX, scrollY, innerWidth: vw } = window;

        let left = rect.left + scrollX + rect.width / 2 - tooltip.offsetWidth / 2;
        let top = rect.top + scrollY - tooltip.offsetHeight - 10;

        left = Math.max(10, Math.min(left, vw - tooltip.offsetWidth - 10));
        if (top < 10) top = rect.bottom + scrollY + 10;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function hideTooltip() {
        clearTimeout(hideTimeout);
        hideTimeout = setTimeout(() => {
            tooltip.classList.remove('visible');
            setTimeout(() => {
                tooltip.style.display = 'none';
                activeSpan = null;
            }, 300);
        }, 100);
    }
}