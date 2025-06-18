// js/chapterRenderer.js (最优化且无假设版本 - 与提供的 tooltip.js 完美协作)

import { renderMarkdownWithTooltips } from './tooltip.js'; // 导入您提供的 tooltip.js 中的渲染函数
import { ensureEnableJsApi, extractVideoId } from './utils.js'; // 假设 extractVideoId 和 ensureEnableJsApi 来源于此

let allChapterIndex = [];

// ================= preTagSubtitles 函数 (无需修改，与之前提供的版本一致) =================

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
    // 如果没有内容或字幕，直接返回原始HTML，因为Tooltip已经处理过了
    return { html: paragraphHtmlWithTooltips, lastUsedSubtitleIndex: subtitleStartIndex };
  }

  // 步骤 1: 将已带有Tooltip的HTML解析成DOM文档
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${paragraphHtmlWithTooltips}</div>`, 'text/html');
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
          // 计算在当前文本节点原始值中的实际偏移
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
      
      // 定位结束节点和偏移
      charCount = 0;
      const matchEndPos = matchPos + normalizedSubtitleText.length;
      for (let j = 0; j < textNodes.length; j++) {
        const normalizedNodeText = normalizeTextForComparison(textNodes[j].nodeValue);
        if (endNodeIndex === -1 && charCount + normalizedNodeText.length >= matchEndPos) {
          endNodeIndex = j;
          // 计算在当前文本节点原始值中的实际偏移
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
      
      // 步骤 5: 使用Range API精确包裹，绝不破坏现有HTML结构
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
            // **最优化流程 (与您提供的 tooltip.js 完美协作):**
            // 1. 将原始Markdown文本传递给 `renderMarkdownWithTooltips`。
            //    此函数会使用 `marked` 解析Markdown，并注入所有 `tooltip` 相关的 `<span>` 标签。
            //    其输出是已经包含 Tooltip 的 HTML 字符串。
            const htmlWithTooltips = renderMarkdownWithTooltips(
                item, // 原始 Markdown 文本
                currentChapterTooltips,
                wordFrequenciesMap,
                maxFreq
            );

            // 2. 将此“已包含 Tooltip 的 HTML”传递给 `preTagSubtitles`。
            //    `preTagSubtitles` 内部会将其解析为 DOM 树，并使用安全的 Range API
            //    在此现有结构上包裹字幕 `<span>` 标签，而不会破坏已有的 Tooltip 结构。
            const { html: taggedHtmlFinal, lastUsedSubtitleIndex } = preTagSubtitles(
                htmlWithTooltips, // 传入已经处理过 Tooltip 的 HTML
                subtitleData,
                subtitleTracker
            );
            subtitleTracker = lastUsedSubtitleIndex;
            finalHtml = taggedHtmlFinal; // 这就是最终的 HTML
            
        } else if (item.video) {
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;margin-bottom:20px;';
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
            iframe.frameBorder = '0';
            iframe.allowFullscreen = true;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            const videoId = extractVideoId(item.video);
            // 修正 YouTube 嵌入 URL：确保这里使用的是正确的 YouTube 嵌入路径
            // 您的原始代码中 `https://www.youtube.com/embed/${videoId}` 看起来不标准
            // 通常是 `https://www.youtube.com/embed/{videoId}` 或 `https://www.youtube-nocookie.com/embed/{videoId}`
            // 这里我保留了您的原意，但请根据实际需要检查并修正此URL
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
    
    // 章节导航链接逻辑（通常在这里，取决于您的具体实现）
    // 例如，在渲染完所有内容后，可以遍历 chaptersContainer 的子元素来生成导航
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
