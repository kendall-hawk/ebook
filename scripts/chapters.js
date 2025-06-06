// chapters.js
import { renderMarkdownWithTooltips } from './markdown.js';

export function renderChapters(chapterData, tooltipData) {
  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');

  chapterData.chapters.forEach(ch => {
    // 目录项
    const tocItem = document.createElement('li');
    const tocLink = document.createElement('a');
    tocLink.href = `#chapter-${ch.id}`;
    tocLink.textContent = ch.title;
    tocItem.appendChild(tocLink);
    toc.appendChild(tocItem);

    // 章节内容
    const chapterDiv = document.createElement('div');
    chapterDiv.id = `chapter-${ch.id}`;

    // 用tooltip包装关键词后渲染Markdown
    chapterDiv.innerHTML = renderMarkdownWithTooltips(ch.content, tooltipData);

    chapters.appendChild(chapterDiv);
  });
}