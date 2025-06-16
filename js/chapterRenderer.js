// js/chapterRenderer.js
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
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
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
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return console.error('未找到 #toc 容器。');
  toc.innerHTML = '';

  const filtered = chapterIndex.filter(ch =>
    filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory))
  );

  if (filtered.length === 0) {
    toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
    return;
  }

  filtered.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.classList.add('chapter-list-item');
    link.dataset.filePath = ch.file;

    const img = document.createElement('img');
    img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
    img.alt = ch.title;
    link.appendChild(img);

    const title = document.createElement('h3');
    title.textContent = ch.title;
    link.appendChild(title);

    link.addEventListener('click', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });

    toc.appendChild(link);
  });
}

export async function renderSingleChapterContent(
  chapterContent,
  currentTooltips,
  wordFreqMap,
  maxFreq,
  navigateToChapter,
  srtEntries = []
) {
  const container = document.getElementById('chapters');
  if (!container) return console.error('未找到 #chapters 容器。');
  container.innerHTML = '';
  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  container.appendChild(title);

  let srtIndex = 0;

  for (const item of chapterContent.paragraphs) {
    if (typeof item === 'string') {
      const para = document.createElement('p');
      para.classList.add('chapter-paragraph');

      const segments = splitParagraphBySrtSentences(item, srtEntries, srtIndex);

      for (const seg of segments) {
        if (seg.type === 'srtSentence') {
          const sent = document.createElement('span');
          sent.classList.add('sentence');
          sent.dataset.subIndex = seg.srtIndex;
          sent.dataset.startTime = srtEntries[seg.srtIndex].start;
          sent.dataset.endTime = srtEntries[seg.srtIndex].end;

          tokenizeText(seg.text).forEach(tok => {
            const wordEl = document.createElement('span');
            wordEl.classList.add('word');
            wordEl.textContent = tok.word;

            const lower = tok.word.toLowerCase();
            if (currentTooltips.hasOwnProperty(lower)) wordEl.dataset.tooltipId = lower;

            const freq = wordFreqMap.get(lower) || 0;
            if (freq > 0 && maxFreq > 0) {
              const size = 16 + (freq / maxFreq) * 12;
              wordEl.style.fontSize = `${size.toFixed(1)}px`;
            }
            sent.appendChild(wordEl);
          });

          para.appendChild(sent);
          srtIndex++;
        } else {
          const html = renderMarkdownWithTooltips(seg.text, currentTooltips, wordFreqMap, maxFreq);
          const temp = document.createElement('div');
          temp.innerHTML = html;
          while (temp.firstChild) para.appendChild(temp.firstChild);
        }
      }

      container.appendChild(para);
    } else if (item.video) {
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

      const videoId = extractVideoId(item.video);
      iframe.src = videoId
        ? ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`)
        : ensureEnableJsApi(item.video);

      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
    }
  }

  const nav = document.createElement('div');
  nav.classList.add('chapter-nav-links');

  const idx = allChapterIndex.findIndex(c => c.id === chapterContent.id);

  if (idx > 0) {
    const prev = allChapterIndex[idx - 1];
    const link = document.createElement('a');
    link.textContent = '上一篇';
    link.href = `#${prev.id}`;
    link.classList.add('chapter-nav-link');
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateToChapter(prev.id, prev.file);
    });
    nav.appendChild(link);
  }

  if (idx > 0 && idx < allChapterIndex.length - 1) nav.appendChild(document.createTextNode(' | '));

  const toTop = document.createElement('a');
  toTop.textContent = '返回本篇文章开头';
  toTop.href = `#${chapterContent.id}`;
  toTop.classList.add('chapter-nav-link');
  toTop.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(chapterContent.id)?.scrollIntoView({ behavior: 'smooth' });
  });
  nav.appendChild(toTop);

  if (idx < allChapterIndex.length - 1) {
    nav.appendChild(document.createTextNode(' | '));
    const next = allChapterIndex[idx + 1];
    const link = document.createElement('a');
    link.textContent = '下一篇';
    link.href = `#${next.id}`;
    link.classList.add('chapter-nav-link');
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateToChapter(next.id, next.file);
    });
    nav.appendChild(link);
  }

  nav.appendChild(document.createTextNode(' | '));
  const back = document.createElement('a');
  back.textContent = '返回文章列表';
  back.href = '#';
  back.classList.add('chapter-nav-link');
  back.addEventListener('click', e => {
    e.preventDefault();
    navigateToChapter('');
  });
  nav.appendChild(back);

  container.appendChild(nav);
}

// 状态管理器
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
 * 更健壮的 SRT 匹配逻辑（支持模糊匹配 / token fallback）
 */
function splitParagraphBySrtSentences(paragraphText, srtEntries, startIndex = 0) {
  const segments = [];
  let remainingText = paragraphText;
  let currentIndex = startIndex;

  const normalize = str => str.replace(/[\W_]+/g, '').toLowerCase();

  while (currentIndex < srtEntries.length && remainingText.length > 0) {
    const srtText = srtEntries[currentIndex].text.trim();
    const normSrt = normalize(srtText);
    const normRemaining = normalize(remainingText);

    const rawIndex = remainingText.indexOf(srtText);
    if (rawIndex !== -1) {
      if (rawIndex > 0) {
        segments.push({ type: 'otherText', text: remainingText.slice(0, rawIndex) });
      }
      segments.push({ type: 'srtSentence', text: srtText, srtIndex: currentIndex });
      remainingText = remainingText.slice(rawIndex + srtText.length);
      currentIndex++;
      continue;
    }

    // fallback 模糊匹配
    const approxIndex = normRemaining.indexOf(normSrt);
    if (approxIndex !== -1) {
      segments.push({ type: 'srtSentence', text: srtText, srtIndex: currentIndex });
      remainingText = remainingText.replace(new RegExp(srtText, 'i'), '');
      currentIndex++;
    } else {
      // 匹配失败，跳出
      break;
    }
  }

  if (remainingText.trim().length > 0) {
    segments.push({ type: 'otherText', text: remainingText });
  }

  return segments;
}