// js/chapterRenderer.js (最终修正版 - 采用DOM解析和包裹，彻底解决问题)

import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];

// ================= 最终修正：全新的、基于DOM的预标记函数 =================

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
 * 这是整个解决方案的核心。它将一个段落的Markdown文本，转换为已注入字幕标签的HTML。
 * @param {string} paragraphMarkdown - 原始段落的Markdown文本.
 * @param {Array<Object>} subtitles - 全部的SRT字幕数据.
 * @param {number} subtitleStartIndex - 从哪个字幕索引开始查找.
 * @returns {{html: string, lastUsedSubtitleIndex: number}}
 */
function preTagSubtitles(paragraphMarkdown, subtitles, subtitleStartIndex) {
  if (!paragraphMarkdown.trim() || subtitleStartIndex >= subtitles.length) {
    return { html: renderMarkdownWithTooltips(paragraphMarkdown, {}, new Map(), 1), lastUsedSubtitleIndex: subtitleStartIndex };
  }

  // 步骤 1: 将整个段落的Markdown预先渲染成HTML
  const parser = new DOMParser();
  // 注意：renderMarkdownWithTooltips在这里只用于将Markdown转为HTML，其他参数为空
  const initialHtml = renderMarkdownWithTooltips(paragraphMarkdown, {}, new Map(), 1);
  const doc = parser.parseFromString(`<div>${initialHtml}</div>`, 'text/html');
  const wrapper = doc.body.firstChild;

  // 步骤 2: 遍历DOM，提取所有文本节点及其内容
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

    // 步骤 3: 在提取的纯文本中查找匹配
    const matchPos = normalizedParagraphText.indexOf(normalizedSubtitleText, currentSearchIndexInParagraph);

    if (matchPos !== -1) {
      // 步骤 4: 找到匹配后，定位到其在原始文本节点中的起始和结束位置
      let charCount = 0;
      let startNodeIndex = -1, endNodeIndex = -1;
      let startOffset = -1, endOffset = -1;

      // 定位起始节点和偏移
      for (let j = 0; j < textNodes.length; j++) {
        const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
        if (startNodeIndex === -1 && charCount + normalizedNodeText.length > matchPos) {
          startNodeIndex = j;
          startOffset = matchPos - charCount;
          // 需要从原始nodeValue中找到真正的偏移
          let tempOffset = 0;
          let cleanCharSeen = 0;
          for(let k=0; k < textNodes[j].nodeValue.length; k++){
              if (normalizeTextForComparison(textNodes[j].nodeValue[k])) {
                  if(cleanCharSeen >= startOffset) {
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
        if(charCount > matchPos) break; // 优化
      }
      
      // 定位结束节点和偏移
      charCount = 0;
      const matchEndPos = matchPos + normalizedSubtitleText.length;
      for (let j = 0; j < textNodes.length; j++) {
        const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
        if (endNodeIndex === -1 && charCount + normalizedNodeText.length >= matchEndPos) {
          endNodeIndex = j;
          endOffset = matchEndPos - charCount;
          // 需要从原始nodeValue中找到真正的偏移
          let tempOffset = 0;
          let cleanCharSeen = 0;
          for(let k=0; k < textNodes[j].nodeValue.length; k++){
              if (normalizeTextForComparison(textNodes[j].nodeValue[k])) {
                  cleanCharSeen++;
                  if(cleanCharSeen >= endOffset) {
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
      
      // 步骤 5: 使用Range API精确包裹，绝不破坏现有HTML结构
      if (startNodeIndex !== -1) {
        const range = document.createRange();
        range.setStart(textNodes[startNodeIndex], startOffset);
        range.setEnd(textNodes[endNodeIndex], endOffset);
        
        const span = document.createElement('span');
        span.className = 'subtitle-segment';
        span.dataset.subtitleId = subtitle.id;
        
        // surroundContents会移动内容，所以我们克隆并插入
        range.surroundContents(span);

        // 更新下次搜索的起始位置
        currentSearchIndexInParagraph = matchEndPos;
        lastUsedSubtitleIndex = i + 1;
      }
    } else {
      // 如果这个段落找不到当前字幕了，就停止在这个段落的搜索
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
            // 核心流程：
            // 1. 智能预标记字幕，得到包含字幕span的HTML
            const { html: taggedHtml, lastUsedSubtitleIndex } = preTagSubtitles(item, subtitleData, subtitleTracker);
            subtitleTracker = lastUsedSubtitleIndex;

            // 2. 在已经标记好字幕的HTML上，再应用Tooltips
            // 注意：这次renderMarkdownWithTooltips不应再处理Markdown，因为它已经是HTML了
            // 所以我们直接操作这个HTML字符串
            finalHtml = renderMarkdownWithTooltips(
                taggedHtml, // 已经是HTML，但函数内部逻辑会处理
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
            return; // 处理完视频后跳过后续步骤
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = finalHtml;

        Array.from(tempDiv.children).forEach(child => {
            chaptersContainer.appendChild(child);
        });
    });
    
    // ... 章节导航链接逻辑（无变化）...
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
