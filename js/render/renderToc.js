//渲染章节目录
import { createElement, clearElement } from './domUtils.js';

export function renderToc(container, chapters, onClick, filter = 'all') {
  if (!container) return;

  clearElement(container);

  const filtered = chapters.filter(ch =>
    filter === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filter))
  );

  if (filtered.length === 0) {
    container.innerHTML = `<p style="text-align:center;padding:50px;color:#666;">No articles found for "${filter}".</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const ch of filtered) {
    const link = createElement('a', {
      className: 'chapter-list-item',
      attributes: {
        href: `#${ch.id}`,
        'data-file-path': ch.file
      },
      events: {
        click: e => {
          e.preventDefault();
          onClick(ch.id, ch.file);
        }
      }
    });

    const img = createElement('img', {
      attributes: {
        src: ch.thumbnail || 'assets/default_thumbnail.jpg',
        alt: ch.title || 'Chapter thumbnail'
      }
    });

    const title = createElement('h3', { text: ch.title });
    link.append(img, title);
    fragment.appendChild(link);
  }

  container.appendChild(fragment);
}
