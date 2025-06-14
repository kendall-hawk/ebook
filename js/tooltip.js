import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

marked.setOptions({ gfm: true, breaks: true });

let _internalTooltipsData = {};
let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;

/** 
 * 异步加载 tooltip 数据 
 * @returns {Promise<Object>} tooltip 数据对象 
 */
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

/** 
 * 渲染 Markdown 字符串，支持 [[word|id]] 语法，根据词频设置字体大小 
 */
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

  // 先用占位符替换 [[word|id]] 语法，生成 span，防止被 marked 解析破坏
  md = md.replace(/\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g, (_, word, id) => {
    const lower = word.toLowerCase();
    const freq = wordFrequenciesMap.get(lower) || 0;
    const size = freq > 0 ? baseFontSize + (freq / maxFreq) * maxFontSizeIncrease : baseFontSize;
    const key = `__PLACEHOLDER_${counter++}__`;
    customPlaceholders[key] = `<span class="word" data-tooltip-id="${id}" style="font-size:${size.toFixed(1)}px">${word}</span>`;
    return key;
  });

  // 转成 html
  let html = marked.parse(md);

  // 恢复占位符
  Object.entries(customPlaceholders).forEach(([key, value]) => {
    html = html.replaceAll(key, value);
  });

  // 用 DOM 方式处理其余普通单词，应用词频大小，且带 tooltip 的生成 span.word
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;

  function walkTextNodes(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const fragment = document.createDocumentFragment();
      const parts = node.textContent.split(/\b/);

      parts.forEach(text => {
        if (/^[a-zA-Z0-9'-]+$/.test(text)) {
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
    } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes.length > 0) {
      [...node.childNodes].forEach(walkTextNodes);
    }
  }

  walkTextNodes(wrapper);
  return wrapper.innerHTML;
}

/** 
 * 传入字符串数组自动合并成 markdown 渲染带 tooltip 的 HTML
 */
export function renderParagraphArrayToHtml(
  paragraphs,
  wordFrequenciesMap,
  maxFreq,
  baseFontSize = 16,
  maxFontSizeIncrease = 12
) {
  const fullMarkdown = paragraphs.join('\n\n');
  return renderMarkdownWithTooltips(
    fullMarkdown,
    null,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize,
    maxFontSizeIncrease
  );
}

/**
 * 初始化 tooltip 事件（必须调用一次）
 */
export function setupTooltips() {
  const tooltip = document.getElementById('react-tooltips');
  const container = document.getElementById('content-area') || document.body;
  if (!tooltip) {
    console.warn('#react-tooltips not found.');
    return;
  }

  // 清理可能重复绑定的事件
  if (window._tooltipGlobalClickListener) document.removeEventListener('click', window._tooltipGlobalClickListener);
  if (window._tooltipScrollListener) document.removeEventListener('scroll', window._tooltipScrollListener);

  container.addEventListener('click', onContainerClick);
  document.addEventListener('click', window._tooltipGlobalClickListener = onDocumentClick);
  tooltip.addEventListener('mouseleave', hideTooltip);
  tooltip.addEventListener('mouseenter', () => clearTimeout(_currentHideTimeout));
  document.addEventListener('scroll', window._tooltipScrollListener = onScroll, { passive: true });

  function onContainerClick(e) {
    const span = e.target.closest('.word');
    if (span) {
      showTooltip(span);
    } else if (!e.target.closest('#react-tooltips')) {
      hideTooltip();
    }
  }

  function onDocumentClick(e) {
    if (!e.target.closest('.word') && !e.target.closest('#react-tooltips')) {
      hideTooltip();
    }
  }

  function onScroll() {
    if (tooltip.classList.contains('visible')) {
      hideTooltip();
    }
  }

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
    if (!data) {
      console.warn(`No tooltip for ID: ${id}`);
      hideTooltip();
      return;
    }

    // 组合 tooltip 内容
    const lines = [
      `<strong>${data.title || id}</strong>`,
      data.partOfSpeech ? `<em>(${data.partOfSpeech})</em>` : '',
      data.description || data.definition || '',
      data["Image Description"] || '',
      data.example || '',
      data.category || '',
    ].filter(Boolean);

    tooltip.innerHTML = lines.join('<br>');
    tooltip.style.display = 'block';
    tooltip.classList.add('visible');

    positionTooltip(span, tooltip);
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

  function positionTooltip(span, tooltip) {
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
}