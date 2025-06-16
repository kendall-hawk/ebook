import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';
import { tokenizeText } from './audio/tokenizer.js';
import { parseSRT } from './audio/srtParser.js';

let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP error! ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters;
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引失败:', error);
    return [];
  }
}

export async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`HTTP error! ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`加载章节失败 (${filePath}):`, error);
    return null;
  }
}

export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return console.error('未找到 #toc');

  toc.innerHTML = '';
  const filtered = chapterIndex.filter(ch => filterCategory === 'all' || (ch.categories || []).includes(filterCategory));

  if (filtered.length === 0) {
    toc.innerHTML = `<p style="text-align:center;padding:50px;color:#666;">No articles found for category: "${filterCategory}".</p>`;
    return;
  }

  for (const ch of filtered) {
    const item = document.createElement('a');
    item.href = `#${ch.id}`;
    item.className = 'chapter-list-item';

    const img = document.createElement('img');
    img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
    img.alt = ch.title;
    item.appendChild(img);

    const title = document.createElement('h3');
    title.textContent = ch.title;
    item.appendChild(title);

    item.dataset.filePath = ch.file;
    item.addEventListener('click', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });
    toc.appendChild(item);
  }
}

export async function renderSingleChapterContent(
  chapterContent,
  currentChapterTooltips,
  wordFrequenciesMap,
  maxFreq,
  navigateToChapterCallback,
  srtEntries = []
) {
  const container = document.getElementById('chapters');
  if (!container) return console.error('未找到 #chapters');

  container.innerHTML = '';
  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  container.appendChild(title);

  let srtIndex = 0;

  for (const item of chapterContent.paragraphs) {
    if (typeof item === 'string') {
      const p = document.createElement('p');
      p.classList.add('chapter-paragraph');

      const segments = splitParagraphBySrtSentences(item, srtEntries, srtIndex);

      for (const seg of segments) {
        if (seg.type === 'srtSentence') {
          const sentenceEl = document.createElement('span');
          sentenceEl.classList.add('sentence');
          sentenceEl.dataset.subIndex = srtIndex;
          sentenceEl.dataset.startTime = srtEntries[srtIndex]?.start || 0;
          sentenceEl.dataset.endTime = srtEntries[srtIndex]?.end || 0;

          const tokens = tokenizeText(seg.text);
          let lastIndex = 0;

          for (const token of tokens) {
            if (token.indexInText > lastIndex) {
              sentenceEl.appendChild(document.createTextNode(seg.text.slice(lastIndex, token.indexInText)));
            }

            const el = document.createElement('span');
            el.classList.add('word');
            el.textContent = token.word;

            const lower = token.word.toLowerCase();
            if (currentChapterTooltips?.hasOwnProperty(lower)) {
              el.dataset.tooltipId = lower;
            }

            const freq = wordFrequenciesMap.get(lower) || 0;
            const size = 16 + (freq / maxFreq) * 12;
            if (freq > 0 && maxFreq > 0) {
              el.style.fontSize = `${size.toFixed(1)}px`;
            }

            sentenceEl.appendChild(el);
            lastIndex = token.indexInText + token.length;
          }

          if (lastIndex < seg.text.length) {
            sentenceEl.appendChild(document.createTextNode(seg.text.slice(lastIndex)));
          }

          p.appendChild(sentenceEl);
          srtIndex++;
        } else {
          const html = renderMarkdownWithTooltips(seg.text, currentChapterTooltips, wordFrequenciesMap, maxFreq);
          const temp = document.createElement('div');
          temp.innerHTML = html;
          while (temp.firstChild) {
            p.appendChild(temp.firstChild);
          }
        }
      }

      container.appendChild(p);
    } else if (item.video) {
      const videoUrl = item.video;
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative',
        paddingBottom: '56.25%',
        height: '0',
        overflow: 'hidden',
        maxWidth: '100%',
        marginBottom: '20px'
      });

      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
      });
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

      const videoId = extractVideoId(videoUrl);
      iframe.src = ensureEnableJsApi(videoId ? `https://www.youtube.com/embed/${videoId}` : videoUrl);

      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
    }
  }

  renderChapterNavLinks(container, chapterContent, navigateToChapterCallback);
}

function renderChapterNavLinks(container, content, navigateToChapter) {
  const nav = document.createElement('div');
  nav.className = 'chapter-nav-links';

  const index = allChapterIndex.findIndex(ch => ch.id === content.id);

  if (index > 0) {
    const prev = allChapterIndex[index - 1];
    appendLink(nav, '上一篇', `#${prev.id}`, () => navigateToChapter(prev.id, prev.file));
  }

  if (index > 0 && index < allChapterIndex.length - 1) nav.appendChild(document.createTextNode(' | '));

  appendLink(nav, '返回本篇文章开头', `#${content.id}`, () => {
    document.getElementById(content.id)?.scrollIntoView({ behavior: 'smooth' });
  });

  if (index < allChapterIndex.length - 1) {
    nav.appendChild(document.createTextNode(' | '));
    const next = allChapterIndex[index + 1];
    appendLink(nav, '下一篇', `#${next.id}`, () => navigateToChapter(next.id, next.file));
  }

  if (nav.children.length > 0) nav.appendChild(document.createTextNode(' | '));

  appendLink(nav, '返回文章列表', '#', () => navigateToChapter(''));

  container.appendChild(nav);
}

function appendLink(parent, text, href, handler) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  link.className = 'chapter-nav-link';
  link.addEventListener('click', e => {
    e.preventDefault();
    handler();
  });
  parent.appendChild(link);
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

/**
 * 将段落按 SRT 句子分割。若找不到匹配，fallback 为剩余 SRT 全部作为句子插入。
 */
function splitParagraphBySrtSentences(paragraphText, srtEntries, currentSrtIndex) {
  const segments = [];
  let remaining = paragraphText;
  let found = true;

  while (remaining.length > 0 && currentSrtIndex < srtEntries.length && found) {
    const srt = srtEntries[currentSrtIndex];
    const clean = srt.text.trim();
    const index = remaining.indexOf(clean);

    if (index !== -1) {
      if (index > 0) {
        segments.push({ type: 'otherText', text: remaining.slice(0, index) });
      }
      segments.push({ type: 'srtSentence', text: clean });
      remaining = remaining.slice(index + clean.length);
      currentSrtIndex++;
    } else {
      found = false;
    }
  }

  if (remaining.length > 0) {
    while (currentSrtIndex < srtEntries.length) {
      segments.push({ type: 'srtSentence', text: srtEntries[currentSrtIndex++].text });
    }
  }

  return segments;
}