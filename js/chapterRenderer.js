// js/chapterRenderer.js

import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

/**
 * 规范化文本，用于匹配
 */
function normalizeTextForComparison(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 基于 DOM 的字幕包裹函数（精确 + 不破坏结构）
 */
function preTagSubtitles(paragraphMarkdown, subtitles, subtitleStartIndex) {
  if (!paragraphMarkdown.trim() || subtitleStartIndex >= subtitles.length) {
    return { html: renderMarkdownWithTooltips(paragraphMarkdown, {}, new Map(), 1), lastUsedSubtitleIndex: subtitleStartIndex };
  }

  const parser = new DOMParser();
  const initialHtml = renderMarkdownWithTooltips(paragraphMarkdown, {}, new Map(), 1);
  const doc = parser.parseFromString(`<div>${initialHtml}</div>`, 'text/html');
  const wrapper = doc.body.firstChild;

  const textNodes = [];
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);

  const paragraphFullText = textNodes.map(n => n.nodeValue).join('');
  const normalizedParagraphText = normalizeTextForComparison(paragraphFullText);

  let currentSearchIndexInParagraph = 0;
  let lastUsedSubtitleIndex = subtitleStartIndex;

  for (let i = subtitleStartIndex; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const normalizedSubtitleText = normalizeTextForComparison(subtitle.text);
    if (!normalizedSubtitleText) continue;

    const matchPos = normalizedParagraphText.indexOf(normalizedSubtitleText, currentSearchIndexInParagraph);
    if (matchPos === -1) break;

    let charCount = 0;
    let startNodeIndex = -1, endNodeIndex = -1;
    let startOffset = -1, endOffset = -1;

    // 定位开始
    for (let j = 0; j < textNodes.length; j++) {
      const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
      if (startNodeIndex === -1 && charCount + normalizedNodeText.length > matchPos) {
        startNodeIndex = j;
        let cleanCharSeen = 0;
        for (let k = 0; k < textNodes[j].nodeValue.length; k++) {
          const ch = textNodes[j].nodeValue[k];
          if (normalizeTextForComparison(ch)) {
            if (cleanCharSeen === matchPos - charCount) {
              startOffset = k;
              break;
            }
            cleanCharSeen++;
          }
        }
      }
      charCount += normalizedNodeText.length;
      if (startNodeIndex !== -1) break;
    }

    // 定位结束
    charCount = 0;
    const matchEndPos = matchPos + normalizedSubtitleText.length;
    for (let j = 0; j < textNodes.length; j++) {
      const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
      if (endNodeIndex === -1 && charCount + normalizedNodeText.length >= matchEndPos) {
        endNodeIndex = j;
        let cleanCharSeen = 0;
        for (let k = 0; k < textNodes[j].nodeValue.length; k++) {
          const ch = textNodes[j].nodeValue[k];
          if (normalizeTextForComparison(ch)) {
            cleanCharSeen++;
            if (cleanCharSeen >= matchEndPos - charCount) {
              endOffset = k + 1;
              break;
            }
          }
        }
      }
      charCount += normalizedNodeText.length;
      if (endNodeIndex !== -1) break;
    }

    // 包裹字幕
    if (startNodeIndex !== -1 && endNodeIndex !== -1) {
      const range = document.createRange();
      range.setStart(textNodes[startNodeIndex], startOffset);
      range.setEnd(textNodes[endNodeIndex], endOffset);

      const span = document.createElement('span');
      span.className = 'subtitle-segment';
      span.dataset.subtitleId = subtitle.id;
      range.surroundContents(span);

      currentSearchIndexInParagraph = matchEndPos;
      lastUsedSubtitleIndex = i + 1;
    }
  }

  return { html: wrapper.innerHTML, lastUsedSubtitleIndex };
}

/**
 * 渲染单章内容（段落、视频、tooltips、字幕同步）
 */
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
    let finalHtml = '';

    if (typeof item === 'string') {
      const { html: taggedHtml, lastUsedSubtitleIndex } = preTagSubtitles(item, subtitleData, subtitleTracker);
      subtitleTracker = lastUsedSubtitleIndex;

      finalHtml = renderMarkdownWithTooltips(
        taggedHtml,
        currentChapterTooltips,
        wordFrequenciesMap,
        maxFreq
      );

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
      return;
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = finalHtml;
    Array.from(tempDiv.children).forEach(child => {
      chaptersContainer.appendChild(child);
    });
  });
}

/**
 * 加载章节索引数据
 */
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

/**
 * 加载单个章节内容（JSON）
 */
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

/**
 * 渲染目录（TOC）
 */
export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return;

  toc.innerHTML = '';
  const filteredChapters = chapterIndex.filter(ch => filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory)));

  if (filteredChapters.length === 0) {
    toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
    return;
  }

  filteredChapters.forEach(ch => {
    const itemLink = document.createElement('a');
    itemLink.href = `#${ch.id}`;
    itemLink.classList.add('chapter-list-item');

    const img = document.createElement('img');
    img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
    img.alt = ch.title;
    itemLink.appendChild(img);

    const title = document.createElement('h3');
    title.textContent = ch.title;
    itemLink.appendChild(title);

    itemLink.dataset.filePath = ch.file;
    itemLink.addEventListener('click', (e) => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });

    toc.appendChild(itemLink);
  });
}

/**
 * 全局词频控制
 */
export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}