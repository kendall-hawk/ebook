// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';
import { parseSRT } from './audio/srtParser.js';
import { tokenizeText } from './audio/tokenizer.js';

let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters;
    return allChapterIndex;
  } catch (err) {
    console.error('加载章节索引失败:', err);
    return [];
  }
}

export async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`加载章节内容失败 (${filePath})`, err);
    return null;
  }
}

export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return console.error('未找到 #toc');
  toc.innerHTML = '';

  const filtered = chapterIndex.filter(ch =>
    filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory))
  );

  if (filtered.length === 0) {
    toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
    return;
  }

  filtered.forEach(ch => {
    const item = document.createElement('a');
    item.href = `#${ch.id}`;
    item.className = 'chapter-list-item';
    item.dataset.filePath = ch.file;

    const img = document.createElement('img');
    img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
    img.alt = ch.title;
    item.appendChild(img);

    const title = document.createElement('h3');
    title.textContent = ch.title;
    item.appendChild(title);

    item.addEventListener('click', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });

    toc.appendChild(item);
  });
}

export async function renderSingleChapterContent(chapterContent, tooltips, freqMap, maxFreq, onNavigate) {
  const container = document.getElementById('chapters');
  if (!container) return console.error('未找到 #chapters');
  container.innerHTML = '';

  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  container.appendChild(title);

  const srtPath = `data/${chapterContent.id}.srt`;
  let srtData = [];
  try {
    const res = await fetch(srtPath);
    if (res.ok) {
      const srtText = await res.text();
      srtData = parseSRT(srtText);
    }
  } catch (err) {
    console.warn('未加载 .srt 文件：', srtPath);
  }

  let subtitleIndex = 0;

  chapterContent.paragraphs.forEach(paragraph => {
    if (typeof paragraph === 'string') {
      const html = renderMarkdownWithTooltips(paragraph, tooltips, freqMap, maxFreq);
      const temp = document.createElement('div');
      temp.innerHTML = html;

      Array.from(temp.childNodes).forEach(el => {
        if (subtitleIndex < srtData.length) {
          const sub = srtData[subtitleIndex];
          if (sub && el.innerText.includes(sub.text)) {
            el.classList.add('sentence');
            el.dataset.subIndex = subtitleIndex;
            subtitleIndex++;
          }
        }
        container.appendChild(el);
      });
    } else if (paragraph.video) {
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative',
        paddingBottom: '56.25%',
        height: '0',
        overflow: 'hidden',
        marginBottom: '20px'
      });

      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      });
      iframe.allowFullscreen = true;
      iframe.frameBorder = 0;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

      const vid = extractVideoId(paragraph.video);
      iframe.src = ensureEnableJsApi(vid ? `https://www.youtube.com/embed/${vid}` : paragraph.video);
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
    }
  });

  renderChapterNavigation(container, chapterContent, onNavigate);
}

function renderChapterNavigation(container, chapterContent, onNavigate) {
  const nav = document.createElement('div');
  nav.className = 'chapter-nav-links';

  const currentIdx = allChapterIndex.findIndex(ch => ch.id === chapterContent.id);
  const prev = allChapterIndex[currentIdx - 1];
  const next = allChapterIndex[currentIdx + 1];

  if (prev) {
    const a = createNavLink(prev.id, '上一篇', () => onNavigate(prev.id, prev.file));
    nav.appendChild(a);
    nav.appendChild(document.createTextNode(' | '));
  }

  const top = createNavLink(chapterContent.id, '返回本篇文章开头', () => {
    document.getElementById(chapterContent.id).scrollIntoView({ behavior: 'smooth' });
  });
  nav.appendChild(top);

  if (next) {
    nav.appendChild(document.createTextNode(' | '));
    const a = createNavLink(next.id, '下一篇', () => onNavigate(next.id, next.file));
    nav.appendChild(a);
  }

  nav.appendChild(document.createTextNode(' | '));
  const back = createNavLink('', '返回文章列表', () => onNavigate(''));
  nav.appendChild(back);

  container.appendChild(nav);
}

function createNavLink(href, text, onClick) {
  const a = document.createElement('a');
  a.href = `#${href}`;
  a.textContent = text;
  a.className = 'chapter-nav-link';
  a.addEventListener('click', e => {
    e.preventDefault();
    onClick();
  });
  return a;
}

export function getGlobalWordFrequenciesMap() {
  return globalWordFrequenciesMap;
}
export function getGlobalMaxFreq() {
  return globalMaxFreq;
}
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}