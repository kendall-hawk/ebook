import { setupTooltips } from './tooltip.js';

export function parseMarkdownToHtml(markdownText, tooltipData) {
  // 这里使用你喜欢的 markdown 库，如 marked.js
  let html = marked.parse(markdownText);

  // 给含 tooltip 的词添加 class 和 data-tooltip-id（举例）
  // 假设 tooltipData 的键是单词，替换文本
  Object.keys(tooltipData).forEach(word => {
    const reg = new RegExp(`\\b${word}\\b`, 'gi');
    html = html.replace(reg, match =>
      `<span class="word" data-tooltip-id="${match.toLowerCase()}">${match}</span>`
    );
  });

  return html;
}

export function renderMarkdown(container, markdownText, tooltipData) {
  container.innerHTML = parseMarkdownToHtml(markdownText, tooltipData);
  setupTooltips(tooltipData);
}