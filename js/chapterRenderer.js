// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

// 全局状态
let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

// ========= 数据加载 =========

export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters || [];
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引失败:', error);
    return [];
  }
}

export async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

// ========= 工具函数 =========

function createElement(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function createImage(src, alt = '', className = '') {
  const img = document.createElement('img');
  img.src = src;
  img.alt = alt;
  if (className) img.className = className;
  return img;
}

function createLink(text, href, className, onClick) {
  const link = document.createElement('a');
  link.textContent = text;
  link.href = href;
  if (className) link.className = className;
  if (onClick) link.addEventListener('click', onClick);
  return link;
}

// ========= 渲染目录 =========

export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return console.error('未找到 #toc 容器');

  toc.innerHTML = '';
  const fragment = document.createDocumentFragment();

  const filtered = chapterIndex.filter(ch => {
    return filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory));
  });

  if (filtered.length === 0) {
    toc.innerHTML = `<p class="no-results">No articles found for category: "${filterCategory}".</p>`;
    return;
  }

  filtered.forEach(ch => {
    const item = createLink('', `#${ch.id}`, 'chapter-list-item', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });

    const img = createImage(
      ch.thumbnail || 'assets/default_thumbnail.jpg',
      ch.title || 'Chapter thumbnail'
    );
    item.appendChild(img);

    const title = createElement('h3', '', ch.title);
    item.appendChild(title);

    item.dataset.filePath = ch.file;
    fragment.appendChild(item);
  });

  toc.appendChild(fragment);
}

// ========= 渲染章节 =========

export function renderSingleChapterContent(chapterContent, tooltipData, wordFrequenciesMap, maxFreq, navigateToChapterCallback) {
  const container = document.getElementById('chapters');
  if (!container) return console.error('未找到 #chapters 容器');

  container.innerHTML = '';
  currentChapterData = chapterContent;

  const fragment = document.createDocumentFragment();
  const title = createElement('h2', '', chapterContent.title);
  title.id = chapterContent.id;
  fragment.appendChild(title);

  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      const html = renderMarkdownWithTooltips(item, tooltipData, wordFrequenciesMap, maxFreq);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;
      Array.from(wrapper.children).forEach(child => fragment.appendChild(child));
    } else if (item.video) {
      const wrapper = document.createElement('div');
      wrapper.className = 'video-wrapper';

      const iframe = document.createElement('iframe');
      iframe.src = getVideoEmbedUrl(item.video);
      iframe.setAttribute('frameborder', '0');
      iframe.setAttribute('allowfullscreen', '');
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.className = 'video-iframe';

      wrapper.appendChild(iframe);
      fragment.appendChild(wrapper);
    }
  });

  fragment.appendChild(buildNavigation(chapterContent.id, navigateToChapterCallback));
  container.appendChild(fragment);
}

function getVideoEmbedUrl(url) {
  const id = extractVideoId(url);
  return id ? ensureEnableJsApi(`https://www.youtube.com/embed/${id}`) : ensureEnableJsApi(url);
}

function buildNavigation(currentId, navigateToChapterCallback) {
  const nav = createElement('div', 'chapter-nav-links');
  const index = allChapterIndex.findIndex(ch => ch.id === currentId);
  const prev = allChapterIndex[index - 1];
  const next = allChapterIndex[index + 1];

  if (prev) nav.appendChild(createLink('上一篇', `#${prev.id}`, 'chapter-nav-link', e => {
    e.preventDefault(); navigateToChapterCallback(prev.id, prev.file);
  }));

  if (prev && next) nav.appendChild(document.createTextNode(' | '));

  nav.appendChild(createLink('返回本篇文章开头', `#${currentId}`, 'chapter-nav-link', e => {
    e.preventDefault();
    document.getElementById(currentId)?.scrollIntoView({ behavior: 'smooth' });
  }));

  if (next && prev) nav.appendChild(document.createTextNode(' | '));

  if (next) nav.appendChild(createLink('下一篇', `#${next.id}`, 'chapter-nav-link', e => {
    e.preventDefault(); navigateToChapterCallback(next.id, next.file);
  }));

  if (nav.children.length > 0) nav.appendChild(document.createTextNode(' | '));

  nav.appendChild(createLink('返回文章列表', '#', 'chapter-nav-link', e => {
    e.preventDefault(); navigateToChapterCallback('');
  }));

  return nav;
}

// ========= 词频全局状态 =========

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