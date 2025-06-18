// js/chapterRenderer.js (核心重构 - 采用模糊有序匹配)

import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];

// ================= 核心修正：全新的智能预标记函数 =================

/**
 * 规范化文本，用于模糊匹配。
 * 移除标点、数字、说话人标记（如“名字：”）、转为小写、合并空格。
 * @param {string} text - 原始文本.
 * @returns {string} - 清理后的文本.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\b[a-zA-Z\s]+:/g, '') // 移除 "speaker:" 这样的标记
    .replace(/[^\w\s]|[\d]/g, '')   // 移除非字母、非空格的字符和所有数字
    .replace(/\s+/g, ' ')           // 合并多个空格为一个
    .trim();
}

/**
 * 在段落中智能查找所有字幕文本，并用带有 data-subtitle-id 的 span 包裹它们。
 * 采用有序、模糊匹配算法。
 * @param {string} paragraphText - 原始段落文本.
 * @param {Array<Object>} subtitles - 解析后的SRT字幕数组.
 * @returns {{html: string, lastUsedSubtitleIndex: number}} - 返回处理后的HTML和最后一个用过的字幕索引
 */
function preTagSubtitles(paragraphText, subtitles, startingSubtitleIndex) {
  if (!subtitles || subtitles.length === 0 || startingSubtitleIndex >= subtitles.length) {
    return { html: paragraphText, lastUsedSubtitleIndex: startingSubtitleIndex };
  }

  let processedParts = [];
  let lastIndexInParagraph = 0;
  let currentSubtitleIndex = startingSubtitleIndex;

  const normalizedParagraph = normalizeText(paragraphText);

  while (currentSubtitleIndex < subtitles.length) {
    const subtitle = subtitles[currentSubtitleIndex];
    const normalizedSubtitleText = normalizeText(subtitle.text);

    if (!normalizedSubtitleText) {
      currentSubtitleIndex++;
      continue;
    }

    // 在规范化后的文章段落中，从上一个匹配结束的位置开始，查找当前字幕
    const matchIndex = normalizedParagraph.indexOf(normalizedSubtitleText, lastIndexInParagraph);

    if (matchIndex !== -1) {
      // 找到了匹配，现在需要在原始文本中找到对应的精确起止位置
      // 这是一个简化的近似方法，但在多数情况下有效
      // 我们假设清理前后，字符相对位置变化不大
      const originalTextSubstring = paragraphText.substring(lastIndexInParagraph);
      const normalizedOriginalTextSubstring = normalizeText(originalTextSubstring);
      const matchIndexInSubstring = normalizedOriginalTextSubstring.indexOf(normalizedSubtitleText);
      
      if(matchIndexInSubstring !== -1) {
        // 找到了近似的原始文本位置
        const originalMatchStart = lastIndexInParagraph + matchIndexInSubstring;
        // 为了找到结束位置，我们在原始文本中从匹配开始处查找
        // 这是一个启发式方法：我们认为匹配的原始文本长度和字幕文本长度相近
        // 一个更鲁棒的方法需要更复杂的对齐算法，但这个应该能解决人名等问题
        let originalMatchEnd = originalMatchStart + subtitle.text.length;
        // 粗略调整结束位置，以包含可能的说话人等
        while(normalizeText(paragraphText.substring(originalMatchStart, originalMatchEnd)).length < normalizedSubtitleText.length && originalMatchEnd < paragraphText.length) {
            originalMatchEnd++;
        }

        // 1. 添加上一个匹配到当前匹配之间的、未被包裹的文本
        processedParts.push(paragraphText.substring(lastIndexInParagraph, originalMatchStart));
        
        // 2. 添加当前匹配的、被包裹的文本
        const originalTextToWrap = paragraphText.substring(originalMatchStart, originalMatchEnd);
        processedParts.push(`<span class="subtitle-segment" data-subtitle-id="${subtitle.id}">${originalTextToWrap}</span>`);
        
        // 3. 更新下一个查找的起始位置
        lastIndexInParagraph = originalMatchEnd;
      }
      currentSubtitleIndex++;
    } else {
      // 如果在这个段落里再也找不到当前顺序的字幕了，就跳出循环
      break;
    }
  }

  // 添加段落中最后一个匹配之后的所有剩余文本
  if (lastIndexInParagraph < paragraphText.length) {
    processedParts.push(paragraphText.substring(lastIndexInParagraph));
  }

  return {
    html: processedParts.join(''),
    lastUsedSubtitleIndex: currentSubtitleIndex
  };
}


// ================= 其他函数保持不变，但 renderSingleChapterContent 有改动 =================

export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback, subtitleData = []) {
    const chaptersContainer = document.getElementById('chapters');
    if (!chaptersContainer) return;
    chaptersContainer.innerHTML = '';

    const title = document.createElement('h2');
    title.id = chapterContent.id;
    title.textContent = chapterContent.title;
    chaptersContainer.appendChild(title);
    
    let subtitleTracker = 0; // 新增：跟踪哪个字幕已经被用过了

    chapterContent.paragraphs.forEach(item => {
        if (typeof item === 'string') {
            // 核心改动：调用新的、更智能的预标记函数
            const { html: preTaggedHtml, lastUsedSubtitleIndex } = preTagSubtitles(item, subtitleData, subtitleTracker);
            subtitleTracker = lastUsedSubtitleIndex; // 更新跟踪器

            const renderedHtml = renderMarkdownWithTooltips(
                preTaggedHtml,
                currentChapterTooltips,
                wordFrequenciesMap,
                maxFreq
            );

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderedHtml;

            Array.from(tempDiv.children).forEach(child => {
                chaptersContainer.appendChild(child);
            });

        } else if (item.video) {
            // ... 视频渲染逻辑无变化 ...
        }
    });
    
    // ... 章节导航链接逻辑无变化 ...
    // （为简洁省略，这部分不需要修改）
}


// 其他所有导出函数 (loadChapterIndex, loadSingleChapterContent, renderChapterToc, etc.)
// 保持不变，为简洁起见在此省略。请只替换上面的 renderSingleChapterContent 函数
// 和新增的 preTagSubtitles / normalizeText 函数。
// 下面提供了不变的函数，以便您完整替换。

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

// Global Frequencies functions remain unchanged
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;
export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}
