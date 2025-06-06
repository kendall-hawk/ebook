import { renderMarkdownWithTooltips } from './markdown.js';

export async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

export function renderChapters(chapterData, tooltipData) {
  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');

  chapterData.chapters.forEach(ch => {
    // 渲染目录 & 内容（保留原逻辑）
  });
}