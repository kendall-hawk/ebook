// js/chapterRenderer.js (更新导入路径)

import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js'; // <-- 更改了导入路径

let allChapterIndex = [];

// ================= preTagSubtitles 函数 (无修改) =================

/**
 * 规范化文本，用于模糊匹配。
 * @param {string} text - 原始文本.
 * @returns {string} - 清理后的、用于比较的文本.
 */
function normalizeTextForComparison(text) {
  if (!text) return '';
  // 移除非字母数字字符（保留空格），转为小写，合并空格
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') 
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 核心函数：将一个已渲染Tooltip的HTML段落，转换为已注入字幕标签的HTML。
 * 此函数通过DOM解析和Range API精确包裹字幕，不会破坏现有HTML结构。
 * @param {string} paragraphHtmlWithTooltips - 原始段落的HTML文本，已包含Tooltips.
 * @param {Array<Object>} subtitles - 全部的SRT字幕数据.
 * @param {number} subtitleStartIndex - 从哪个字幕索引开始查找.
 * @returns {{html: string, lastUsedSubtitleIndex: number}}
 */
function preTagSubtitles(paragraphHtmlWithTooltips, subtitles, subtitleStartIndex) {
  if (!paragraphHtmlWithTooltips.trim() || subtitleStartIndex >= subtitles.length) {
    return { html: paragraphHtmlWithTooltips, lastUsedSubtitleIndex: subtitleStartIndex };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${paragraphHtmlWithTooltips}</div>`, 'text/html');
  const wrapper = doc.body.firstChild;

  const textNodes = [];
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  const paragraphFullText = textNodes.map(n => n.nodeValue).join('');
  const normalizedParagraphText = normalizeTextForComparison(paragraphFullText);

  let currentSearchIndexInParagraph = 0;
  let lastUsedSubtitleIndex = subtitleStartIndex;

  for (let i = subtitleStartIndex; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const normalizedSubtitleText = normalizeTextForComparison(subtitle.text);

    if (!normalizedSubtitleText) continue;

    const matchPos = normalizedParagraphText.indexOf(normalizedSubtitleText, currentSearchIndexInParagraph);

    if (matchPos !== -1) {
      let charCount = 0;
      let startNodeIndex = -1, endNodeIndex = -1;
      let startOffset = -1, endOffset = -1;

      for (let j = 0; j < textNodes.length; j++) {
        const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
        if (startNodeIndex === -1 && charCount + normalizedNodeText.length > matchPos) {
          startNodeIndex = j;
          let tempOffset = 0;
          let cleanCharSeen = 0;
          for(let k=0; k < textNodes[j].nodeValue.length; k++){
              if (normalizeTextForComparison(textNodes[j].nodeValue[k])) {
                  if(cleanCharSeen >= (matchPos - charCount)) { 
                      tempOffset = k;
                      break;
                  }
                  cleanCharSeen++;
              }
              if(k === textNodes[j].nodeValue.length -1) tempOffset = k+1; 
          }
          startOffset = tempOffset;
        }
        charCount += normalizedNodeText.length;
      }
      
      charCount = 0;
      const matchEndPos = matchPos + normalizedSubtitleText.length;
      for (let j = 0; j < textNodes.length; j++) {
        const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
        if (endNodeIndex === -1 && charCount + normalizedNodeText.length >= matchEndPos) {
          endNodeIndex = j;
          let tempOffset = 0;
          let cleanCharSeen = 0;
          for(let k=0; k < textNodes[j].nodeValue.length; k++){
              if (normalizeTextForComparison(textNodes[j].nodeValue[k])) {
                  cleanCharSeen++;
                  if(cleanCharSeen >= (matchEndPos - charCount)) { 
                      tempOffset = k+1; 
                      break;
                  }
              }
              if(k === textNodes[j].nodeValue.length -1) tempOffset = k+1; 
          }
          endOffset = tempOffset;
          break; 
        }
        charCount += normalizedNodeText.length;
      }
      
      if (startNodeIndex !== -1 && endNodeIndex !== -1) { 
        const range = document.createRange();
        range.setStart(textNodes[startNodeIndex], startOffset);
        range.setEnd(textNodes[endNodeIndex], endOffset);
        
        const span = document.createElement('span');
        span.className = 'subtitle-segment';
        span.dataset.subtitleId = subtitle.id;
        
        try {
            range.surroundContents(span);
        } catch (e) {
            console.warn('Range.surroundContents failed for subtitle. Skipping this subtitle:', subtitle.text, e);
        }

        currentSearchIndexInParagraph = matchEndPos;
        lastUsedSubtitleIndex = i + 1;
      } else {
          break; 
      }
    } else {
      break; 
    }
  }

  return { html: wrapper.innerHTML, lastUsedSubtitleIndex };
}

// 渲染主函数
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback, subtitleData = []) {
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
            const htmlWithTooltips = renderMarkdownWithTooltips(
                item, 
                currentChapterTooltips,
                wordFrequenciesMap,
                maxFreq
            );

            const { html: taggedHtmlFinal, lastUsedSubtitleIndex } = preTagSubtitles(
                htmlWithTooltips, 
                subtitleData,
                subtitleTracker
            );
            subtitleTracker = lastUsedSubtitleIndex;
            finalHtml = taggedHtmlFinal; 
            
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
                height: '100%'
            });
            iframe.frameBorder = '0';
            iframe.allowFullscreen = true;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            const videoId = extractVideoId(item.video);
            iframe.src = ensureEnableJsApi(videoId ? `https://www.youtube.com/embed/${videoId}` : item.video); // <-- 修正 YouTube URL 格式
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


// ============== 以下函数均无变化，为方便您替换，在此保留 ===================

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

let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;
export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}
