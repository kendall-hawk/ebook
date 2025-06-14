import { createElement, clearElement } from './domUtils.js';
import { renderMarkdownWithTooltips } from './tooltip.js';
import { extractVideoId, ensureEnableJsApi } from './utils.js';
import { getChapterIndex } from '../store/chapterStore.js';

export function renderChapter(container, chapter, tooltipData, freqMap, maxFreq, navigate) {
  if (!container) return;
  clearElement(container);

  const title = createElement('h2', {
    text: chapter.title,
    attributes: { id: chapter.id }
  });
  container.appendChild(title);

  (chapter.paragraphs || []).forEach(item => {
    if (typeof item === 'string') {
      const html = renderMarkdownWithTooltips(item, tooltipData, freqMap, maxFreq);
      const wrapper = createElement('div', { html });
      container.appendChild(wrapper);
    } else if (item.video) {
      const wrapper = createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative',
        paddingBottom: '56.25%',
        height: '0',
        overflow: 'hidden',
        marginBottom: '20px'
      });

      const iframe = createElement('iframe', {
        attributes: {
          src: ensureEnableJsApi(`https://www.youtube.com/embed/${extractVideoId(item.video)}`),
          frameBorder: '0',
          allowFullscreen: 'true',
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          title: chapter.title || 'Embedded video'
        }
      });
      Object.assign(iframe.style, {
        position: 'absolute',
        top: 0, left: 0, width: '100%', height: '100%'
      });

      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
    }
  });

  // --- 添加导航 ---
  const nav = renderNavLinks(chapter, navigate);
  container.appendChild(nav);
}

function renderNavLinks(chapter, navigate) {
  const nav = createElement('div', { className: 'chapter-nav-links' });
  const index = getChapterIndex();
  const current = index.findIndex(c => c.id === chapter.id);

  const addNavLink = (text, id, file) => {
    const link = createElement('a', {
      text,
      attributes: { href: `#${id}` },
      className: 'chapter-nav-link',
      events: {
        click: e => {
          e.preventDefault();
          navigate(id, file);
        }
      }
    });
    return link;
  };

  if (current > 0) {
    nav.appendChild(addNavLink('上一篇', index[current - 1].id, index[current - 1].file));
    nav.append(' | ');
  }

  const topLink = addNavLink('返回本篇文章开头', chapter.id, '');
  topLink.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(chapter.id)?.scrollIntoView({ behavior: 'smooth' });
  });
  nav.appendChild(topLink);

  if (current < index.length - 1) {
    nav.append(' | ');
    nav.appendChild(addNavLink('下一篇', index[current + 1].id, index[current + 1].file));
  }

  nav.append(' | ');
  nav.appendChild(addNavLink('返回文章列表', '', '')); // navigate('', '') 表示回首页
  return nav;
}
