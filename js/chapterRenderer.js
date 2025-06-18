// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];

function normalizeTextForComparison(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function preTagSubtitles(paragraphMarkdown, subtitles, subtitleStartIndex) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = renderMarkdownWithTooltips(paragraphMarkdown, {}, new Map(), 1);

  const textNodes = [];
  const walker = document.createTreeWalker(tempDiv, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  const fullText = textNodes.map(n => n.nodeValue).join('');
  const normParagraphText = normalizeTextForComparison(fullText);

  let currentSearchIndex = 0;
  let lastUsedSubtitleIndex = subtitleStartIndex;

  for (let i = subtitleStartIndex; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const normSubText = normalizeTextForComparison(subtitle.text);
    if (!normSubText) continue;

    const matchPos = normParagraphText.indexOf(normSubText, currentSearchIndex);
    if (matchPos === -1) break;

    // 定位匹配起点与终点在 textNodes 中的位置
    let charCount = 0;
    let startNodeIdx = -1, endNodeIdx = -1;
    let startOffset = -1, endOffset = -1;

    const matchEnd = matchPos + normSubText.length;

    // 定位起始
    for (let j = 0; j < textNodes.length; j++) {
      const rawText = textNodes[j].nodeValue;
      const normText = normalizeTextForComparison(rawText);
      if (startNodeIdx === -1 && charCount + normText.length > matchPos) {
        startNodeIdx = j;
        let cleanChar = 0;
        for (let k = 0; k < rawText.length; k++) {
          if (/\w/.test(rawText[k])) {
            if (cleanChar === matchPos - charCount) {
              startOffset = k;
              break;
            }
            cleanChar++;
          }
        }
      }
      if (endNodeIdx === -1 && charCount + normText.length >= matchEnd) {
        endNodeIdx = j;
        let cleanChar = 0;
        for (let k = 0; k < rawText.length; k++) {
          if (/\w/.test(rawText[k])) {
            if (cleanChar === matchEnd - charCount - 1) {
              endOffset = k + 1;
              break;
            }
            cleanChar++;
          }
        }
        break;
      }
      charCount += normText.length;
    }

    if (startNodeIdx !== -1 && endNodeIdx !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNodes[startNodeIdx], startOffset);
        range.setEnd(textNodes[endNodeIdx], endOffset);

        const span = document.createElement('span');
        span.className = 'subtitle-segment';
        span.dataset.subtitleId = subtitle.id;

        const extracted = range.extractContents();
        span.appendChild(extracted);
        range.insertNode(span);
      } catch (err) {
        console.warn('range wrap failed', err);
      }
      currentSearchIndex = matchEnd;
      lastUsedSubtitleIndex = i + 1;
    }
  }

  return {
    html: tempDiv.innerHTML,
    lastUsedSubtitleIndex
  };
}

// 主章节渲染函数
export function renderSingleChapterContent(
  chapterContent,
  currentChapterTooltips,
  wordFrequenciesMap,
  maxFreq,
  navigateToChapterCallback,
  subtitleData = []
) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) return;
  chaptersContainer.innerHTML = '';

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  let subtitleTracker = 0;

  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      const { html: subtitleTaggedHtml, lastUsedSubtitleIndex } = preTagSubtitles(item, subtitleData, subtitleTracker);
      subtitleTracker = lastUsedSubtitleIndex;

      const finalHtml = renderMarkdownWithTooltips(
        subtitleTaggedHtml,
        currentChapterTooltips,
        wordFrequenciesMap,
        maxFreq
      );

      const container = document.createElement('div');
      container.innerHTML = finalHtml;
      Array.from(container.children).forEach(el => chaptersContainer.appendChild(el));

    } else if (item.video) {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;margin-bottom:20px;';
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      const videoId = extractVideoId(item.video);
      iframe.src = ensureEnableJsApi(videoId ? `https://www.youtube.com/embed/${videoId}` : item.video);
      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });
}

// ===== 其他辅助函数保持不变 =====

export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters;
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引数据失败:', error);
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
  if (!toc) return;
  toc.innerHTML = '';
  const filtered = chapterIndex.filter(ch => filterCategory === 'all' || (ch.categories || []).includes(filterCategory));
  if (filtered.length === 0) {
    toc.innerHTML = `<p style="text-align:center;padding:50px;color:#666;">No articles found for category: "${filterCategory}"</p>`;
    return;
  }
  filtered.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.classList.add('chapter-list-item');
    const img = document.createElement('img');
    img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
    img.alt = ch.title;
    link.appendChild(img);
    const title = document.createElement('h3');
    title.textContent = ch.title;
    link.appendChild(title);
    link.dataset.filePath = ch.file;
    link.addEventListener('click', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });
    toc.appendChild(link);
  });
}

let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;
export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}