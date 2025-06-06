import { marked } from 'marked';
import { setupTooltips } from './tooltip.js';

export function renderMarkdown(container, markdownText, tooltipData) {
  const tooltipWords = Object.keys(tooltipData).map(w => w.toLowerCase());

  const renderer = new marked.Renderer();

  // 重写文本节点的渲染方式
  const wrapTooltipWords = (text) => {
    return text.replace(/\b\w+\b/g, (word) => {
      const lower = word.toLowerCase();
      if (tooltipWords.includes(lower)) {
        return `<span class="word" data-tooltip-id="${lower}">${word}</span>`;
      }
      return word;
    });
  };

  // 重写段落、列表、表格等常规文字的渲染
  const originalTextRenderer = renderer.text;
  renderer.text = (text) => wrapTooltipWords(text);

  // 渲染 markdown
  const html = marked(markdownText, { renderer });
  container.innerHTML = html;

  // 设置 tooltip 事件
  setupTooltips(tooltipData);
}