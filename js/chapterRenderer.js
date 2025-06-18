// js/chapterRenderer.js (优化版)

import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];

/**
 * 规范化文本，去除特殊字符，统一小写，方便模糊匹配。
 * @param {string} text - 原始文本
 * @returns {string} - 规范化文本
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
 * 预先标记段落中与字幕匹配的文本片段，包裹为带有 data-subtitle-id 的 span。
 * 通过 Range API 精准包裹，不破坏原有HTML结构。
 * @param {string} paragraphHtmlWithTooltips - 段落HTML，已包含词tooltip
 * @param {Array<Object>} subtitles - 字幕数组
 * @param {number} subtitleStartIndex - 从哪个字幕索引开始匹配
 * @returns {{html: string, lastUsedSubtitleIndex: number}} - 处理后的HTML和最后用到的字幕索引
 */
function preTagSubtitles(paragraphHtmlWithTooltips, subtitles, subtitleStartIndex) {
  if (!paragraphHtmlWithTooltips.trim() || subtitleStartIndex >= subtitles.length) {
    return { html: paragraphHtmlWithTooltips, lastUsedSubtitleIndex: subtitleStartIndex };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${paragraphHtmlWithTooltips}</div>`, 'text/html');
  const wrapper = doc.body.firstChild;

  // 收集所有文本节点
  const textNodes = [];
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  const paragraphFullText = textNodes.map(n => n.nodeValue).join('');
  const normalizedParagraphText = normalizeTextForComparison(paragraphFullText);

  let currentSearchIndex = 0;
  let lastUsedSubtitleIndex = subtitleStartIndex;

  for (let i = subtitleStartIndex; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const normalizedSubtitleText = normalizeTextForComparison(subtitle.text);
    if (!normalizedSubtitleText) continue;

    const matchPos = normalizedParagraphText.indexOf(normalizedSubtitleText, currentSearchIndex);
    if (matchPos === -1) break; // 当前字幕未找到，退出循环

    // 查找对应的文本节点区间
    let charCount = 0;
    let startNodeIndex = -1, endNodeIndex = -1;
    let startOffset = -1, endOffset = -1;

    // 找起始节点和偏移
    for (let j = 0; j < textNodes.length; j++) {
      const nodeTextNormalized = normalizeTextForComparison(textNodes[j].nodeValue);
      if (startNodeIndex === -1 && charCount + nodeTextNormalized.length > matchPos) {
        startNodeIndex = j;

        // 计算偏移，区分原文本和规范化文本，防止定位错误
        let offsetInOriginal = 0;
        let countClean = 0;
        for (let k = 0; k < textNodes[j].nodeValue.length; k++) {
          const ch = textNodes[j].nodeValue[k];
          if (/[a-z0-9]/i.test(ch)) countClean++;
          if (countClean > matchPos - charCount) {
            offsetInOriginal = k;
            break;
          }
          if (k === textNodes[j].nodeValue.length - 1) offsetInOriginal = k + 1;
        }
        startOffset = offsetInOriginal;
      }
      charCount += nodeTextNormalized.length;
    }

    // 找结束节点和偏移
    charCount = 0;
    const matchEndPos = matchPos + normalizedSubtitleText.length;
    for (let j = 0; j < textNodes.length; j++) {
      const nodeTextNormalized = normalizeTextForComparison(textNodes[j].nodeValue);
      if (endNodeIndex === -1 && charCount + nodeTextNormalized.length >= matchEndPos) {
        endNodeIndex = j;

        let offsetInOriginal = 0;
        let countClean = 0;
        for (let k = 0; k < textNodes[j].nodeValue.length; k++) {
          const ch = textNodes[j].nodeValue[k];
          if (/[a-z0-9]/i.test(ch)) countClean++;
          if (countClean >= matchEndPos - charCount) {
            offsetInOriginal = k + 1;
            break;
          }
          if (k === textNodes[j].nodeValue.length - 1) offsetInOriginal = k + 1;
        }
        endOffset = offsetInOriginal;
        break;
      }
      charCount += nodeTextNormalized.length;
    }

    // 包裹对应文本范围
    if (startNodeIndex !== -1 && endNodeIndex !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNodes[startNodeIndex], startOffset);
        range.setEnd(textNodes[endNodeIndex], endOffset);
      } catch (err) {
        console.warn('设置Range出错，跳过该字幕包裹:', subtitle.text, err);
        break;
      }
      const span = document.createElement('span');
      span.className = 'subtitle-segment';
      span.dataset.subtitleId = subtitle.id;
      try {
        range.surroundContents(span);
      } catch (e) {
        console.warn('Range.surroundContents失败，跳过该字幕包裹:', subtitle.text, e);
      }
      currentSearchIndex = matchEndPos;
      lastUsedSubtitleIndex = i + 1;
    } else {
      break;
    }
  }

  return { html: wrapper.innerHTML, lastUsedSubtitleIndex };
}

/**
 * 渲染单章节内容：包括标题、视频、段落等。
 * @param {Object} chapterContent - 章节数据
 * @param {Object} currentChapterTooltips - 词汇tooltip数据
 * @param {Map} wordFrequenciesMap - 词频映射
 * @param {number} maxFreq - 最高词频，用于字体大小计算
 * @param {function} navigateToChapterCallback - 章节切换回调（暂未用）
 * @param {Array} subtitleData - 当前章节的字幕数组
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback, subtitleData = []) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) return;
  chaptersContainer.innerHTML = '';

  // 渲染标题
  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  let subtitleTracker = 0; // 追踪已使用字幕索引，避免重复匹配

  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      // 字符串段落，先渲染tooltip，再预标记字幕
      const htmlWithTooltips = renderMarkdownWithTooltips(
        item,
        currentChapterTooltips,
        wordFrequenciesMap,
        maxFreq
      );
      const { html: taggedHtml, lastUsedSubtitleIndex } = preTagSubtitles(
        htmlWithTooltips,
        subtitleData,
        subtitleTracker
      );
      subtitleTracker = lastUsedSubtitleIndex;

      // 插入DOM
      const container = document.createElement('div');
      container.innerHTML = taggedHtml;
      Array.from(container.children).forEach(child => chaptersContainer.appendChild(child));

    } else if (item.video) {
      // 视频段落，插入响应式YouTube iframe
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative',
        paddingBottom: '56.25%', // 16:9 比例
        height: '0',
        overflow: 'hidden',
        maxWidth: '100%',
        marginBottom: '20px',
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

      // 处理视频链接，优先用 extractVideoId 提取ID，拼接启用 JS API 的URL
      const videoId = extractVideoId(item.video);
      iframe.src = videoId
        ? ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`)
        : item.video;

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);

    }
  });
}

/**
 * 加载章节索引JSON，返回章节数组
 * @returns {Promise<Array>}
 */
export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP 错误，状态码: ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters || [];
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引失败:', error);
    return [];
  }
}

/**
 * 加载单章节JSON内容
 * @param {string} filePath - 章节文件路径
 * @returns {Promise<Object|null>}
 */
export async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`HTTP 错误，状态码: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

/**
 * 渲染目录列表
 * @param {Array} chapterIndex - 章节索引数组
 * @param {Function} onChapterClick - 点击章节回调，传入章节 id 和文件路径
 * @param {string} filterCategory - 分类过滤，默认显示全部
 */
export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return;
  toc.innerHTML = '';

  const filtered = chapterIndex.filter(ch => {
    if (filterCategory === 'all') return true;
    if (Array.isArray(ch.categories)) {
      return ch.categories.includes(filterCategory);
    }
    return false;
  });

  if (filtered.length === 0) {
    toc.innerHTML = `<p style="text-align:center; padding:50px; color:#666;">No articles found for category: "${filterCategory}".</p>`;
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

    const title = document.createElement('h3');
    title.textContent = ch.title;

    link.appendChild(img);
    link.appendChild(title);

    link.addEventListener('click', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });

    toc.appendChild(link);
  });
}

// 词频全局存储
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;
export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}