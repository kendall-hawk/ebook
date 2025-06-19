/**
 * js/chapterRenderer.js
 * 负责加载和渲染章节内容，包括处理 Markdown、工具提示和字幕段落。
 */

import { renderMarkdownWithTooltips } from './tooltip.js';
import { extractVideoId, getYouTubeEmbedUrl } from './youtube.js';
import { parseSRT } from './utils.js'; // 重新导入 parseSRT，因为 chapterRenderer 内部也需要

let allChapterIndex = []; // 全局存储章节索引数据

/**
 * 规范化文本，用于模糊匹配。移除非字母数字字符（保留空格），转为小写，合并空格。
 * @param {string} text - 原始文本.
 * @returns {string} - 清理后的、用于比较的文本.
 */
function normalizeTextForComparison(text) {
  if (!text) return '';
  // 移除非字母数字的Unicode字符 (保留空格), 转为小写，合并空格
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // 保留字母、数字、空格
    .replace(/\s+/g, ' ') // 合并多个空格为一个
    .trim();
}

/**
 * 核心函数：将原始文本（可能含Markdown）转换为已注入字幕标签的HTML。
 * 此函数通过DOM解析和Range API精确包裹字幕，不会破坏现有HTML结构。
 * @param {string} rawTextOrMarkdown - 原始段落的纯文本或Markdown文本.
 * @param {Array<Object>} subtitles - 全部的SRT字幕数据.
 * @param {number} subtitleStartIndex - 从哪个字幕索引开始查找 (用于优化搜索范围).
 * @returns {{html: string, lastUsedSubtitleIndex: number}} 包含处理后的HTML和最后一个使用的字幕索引。
 */
function preTagSubtitles(rawTextOrMarkdown, subtitles, subtitleStartIndex) {
  if (!rawTextOrMarkdown.trim() || !subtitles || subtitles.length === 0 || subtitleStartIndex >= subtitles.length) {
    return { html: rawTextOrMarkdown, lastUsedSubtitleIndex: subtitleStartIndex };
  }

  const parser = new DOMParser();
  // 关键改变：用一个临时的 <div> 包裹原始文本。这样，即使 rawTextOrMarkdown 是纯文本，
  // DOMParser 也能创建一个可操作的 DOM 结构。
  // 注意：这里传入的是原始文本，不是 Marked.js 渲染后的 HTML。
  const doc = parser.parseFromString(`<div>${rawTextOrMarkdown}</div>`, 'text/html');
  const wrapper = doc.body.firstChild;

  const textNodes = [];
  // 创建一个 TreeWalker 来遍历所有文本节点
  // 重要的是，我们在这里只关心文本节点，不关心任何 Markdown 语法生成的HTML标签
  const walker = doc.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue.trim().length > 0) { // 过滤掉空文本节点，提高效率
        textNodes.push(node);
    }
  }

  // 将所有文本节点的内容连接起来，形成段落的完整文本
  // 同时保留原始文本节点和它们在连接后文本中的起始索引，用于后续精确映射
  let paragraphFullText = '';
  const textNodeCharOffsets = new Map(); // Map<TextNode, { start: number, end: number }>
  let currentOffset = 0;
  for (const tn of textNodes) {
      const nodeValue = tn.nodeValue || '';
      textNodeCharOffsets.set(tn, { start: currentOffset, end: currentOffset + nodeValue.length });
      paragraphFullText += nodeValue;
      currentOffset += nodeValue.length;
  }
  
  const normalizedParagraphText = normalizeTextForComparison(paragraphFullText);

  let currentSearchIndexInParagraph = 0; // 在段落规范化文本中的当前搜索位置
  let lastUsedSubtitleIndex = subtitleStartIndex; // 记录已成功匹配的最后一个字幕索引

  // 优化：提前构建原始文本到规范化文本的字符映射
  const originalToNormalizedMap = [];
  let originalIdx = 0;
  let normalizedIdx = 0;
  while (originalIdx < paragraphFullText.length) {
      const char = paragraphFullText[originalIdx];
      const normalizedChar = normalizeTextForComparison(char);
      for (let i = 0; i < normalizedChar.length; i++) {
          originalToNormalizedMap[normalizedIdx + i] = originalIdx;
      }
      if (normalizedChar.length === 0) { // 如果字符被规范化移除了，则它不对应任何规范化索引
          // do nothing, originalIdx will just advance
      } else {
          normalizedIdx += normalizedChar.length;
      }
      originalIdx++;
  }


  for (let i = subtitleStartIndex; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const normalizedSubtitleText = normalizeTextForComparison(subtitle.text);

    if (!normalizedSubtitleText) {
      lastUsedSubtitleIndex = i + 1;
      continue;
    }

    // 在规范化段落文本中查找规范化字幕文本
    const matchPos = normalizedParagraphText.indexOf(normalizedSubtitleText, currentSearchIndexInParagraph);

    if (matchPos !== -1) {
      // 成功匹配，现在需要在原始DOM中找到对应的位置
      // 使用预计算的 originalToNormalizedMap 来转换索引
      const originalMatchStart = originalToNormalizedMap[matchPos];
      // 找到匹配的原始文本结束位置
      let originalMatchEnd = originalToNormalizedMap[matchPos + normalizedSubtitleText.length - 1];
      // 如果匹配的最后一个规范化字符对应多个原始字符，需要找到其在原始文本中的真实结束位置
      // 简单的方法是取匹配的最后一个规范化字符对应的原始字符的下一个字符的索引
      if (matchPos + normalizedSubtitleText.length < originalToNormalizedMap.length) {
          originalMatchEnd = originalToNormalizedMap[matchPos + normalizedSubtitleText.length];
      } else {
          // 如果匹配到规范化文本的末尾，原始文本结束位置就是原始文本的长度
          originalMatchEnd = paragraphFullText.length;
      }


      let startNode = null, endNode = null;
      let startOffset = -1, endOffset = -1;

      // 寻找起始节点和偏移
      for (const tn of textNodes) {
        const { start, end } = textNodeCharOffsets.get(tn);
        if (originalMatchStart >= start && originalMatchStart < end) {
            startNode = tn;
            startOffset = originalMatchStart - start;
        }
        if (originalMatchEnd > start && originalMatchEnd <= end) { // 结束点可能落在节点末尾，或在下一个节点的开头
            endNode = tn;
            endOffset = originalMatchEnd - start;
            break; // 找到结束节点后就可以退出循环
        } else if (originalMatchEnd <= start) { // 结束点在当前节点之前，表示起始节点已经是最后一个节点了
            endNode = tn; // 理论上这不会发生，因为匹配是连续的
            endOffset = 0; // 或者设置为起始节点末尾
            break;
        }
      }
        // 如果结束点恰好是某个文本节点的起始点，那么它应该是上一个文本节点的末尾
        // 或者，如果endOffset为0，且endNode不是startNode，则endNode应是前一个文本节点
        if (startNode && endNode && startOffset !== -1 && endOffset !== -1) {
            const range = doc.createRange();
            try {
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);

                // 再次检查范围是否为空或无效，尤其是在边界情况下
                const rangeContent = range.toString().trim();
                if (rangeContent.length === 0 && normalizedSubtitleText.length > 0) {
                    console.warn(`Skipping empty or invalid range for subtitle ID ${subtitle.id} ("${subtitle.text}"). Range content: "${range.toString()}"`);
                    lastUsedSubtitleIndex = i + 1;
                    currentSearchIndexInParagraph = matchPos + normalizedSubtitleText.length; // 即使跳过，也要推进搜索位置
                    continue;
                }

                const span = doc.createElement('span');
                span.className = 'subtitle-segment';
                span.dataset.subtitleId = subtitle.id;

                range.surroundContents(span);
                
            } catch (e) {
                console.warn('Range.surroundContents failed for subtitle:', subtitle.text, 'Error:', e, 'StartNode:', startNode.nodeValue, 'StartOffset:', startOffset, 'EndNode:', endNode ? endNode.nodeValue : 'N/A', 'EndOffset:', endOffset);
                lastUsedSubtitleIndex = i + 1; // 即使失败也推进索引，避免死循环
                currentSearchIndexInParagraph = matchPos + normalizedSubtitleText.length;
                continue;
            }
            currentSearchIndexInParagraph = matchPos + normalizedSubtitleText.length;
            lastUsedSubtitleIndex = i + 1;
        } else {
            console.warn(`Failed to find precise DOM position for subtitle ID ${subtitle.id} ("${subtitle.text}"). Skipping subsequent subtitles for this paragraph.`);
            // 如果没有找到精确的 DOM 位置，则停止处理此段落的后续字幕
            break;
        }
    } else {
      // 如果当前字幕在段落中找不到匹配，则停止处理此段落的后续字幕
      break;
    }
  }

  // 返回处理后的 wrapper 的 innerHTML。此时它可能包含原始 Markdown 文本和 <span class="subtitle-segment"> 标签。
  // 它**不应该**包含额外的 <p> 标签，因为我们最初用 <div> 包裹。
  return { html: wrapper.innerHTML, lastUsedSubtitleIndex };
}


/**
 * 渲染单个章节内容。
 * @param {Object} chapterContent - 章节内容数据。
 * @param {Object} currentChapterTooltips - 当前章节的工具提示数据。
 * @param {Map<string, number>} wordFrequenciesMap - 全局词频 Map。
 * @param {number} maxFreq - 全局最大词频。
 * @param {Array<Object>} allChapterSubtitles - 当前章节所有字幕的完整SRT数据 (外部传入)。
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, allChapterSubtitles = []) {
    const chaptersContainer = document.getElementById('chapters');
    if (!chaptersContainer) {
        console.error('Chapters container not found!');
        return;
    }
    chaptersContainer.innerHTML = ''; // 清空之前的内容

    if (!chapterContent || !chapterContent.paragraphs) {
        chaptersContainer.innerHTML = '<p>Chapter content not available.</p>';
        return;
    }

    const title = document.createElement('h2');
    title.id = chapterContent.id; // 设置ID以便锚点跳转
    title.textContent = chapterContent.title;
    chaptersContainer.appendChild(title);

    let subtitleTracker = 0; // 用于跟踪在当前章节中处理到的字幕索引

    chapterContent.paragraphs.forEach(item => {
        if (typeof item === 'string') {
            // 对于文本内容 (Markdown 字符串)：
            // 1. 首先，将原始 Markdown 文本与字幕进行匹配和包裹。
            //    preTagSubtitles 现在接收原始 Markdown 字符串，并返回一个包含字幕 <span> 标签的 HTML 字符串。
            //    这个返回的 HTML 字符串仍然包含 Markdown 语法，并且没有额外的 <p> 标签。
            const { html: markdownWithSubtitles, lastUsedSubtitleIndex } = preTagSubtitles(
                item, // 传入原始的 Markdown 字符串
                allChapterSubtitles, // 传入当前章节的所有字幕数据
                subtitleTracker
            );
            subtitleTracker = lastUsedSubtitleIndex; // 更新字幕追踪器

            // 2. 然后，将这个带有字幕标签的 Markdown 字符串传给 renderMarkdownWithTooltips。
            //    renderMarkdownWithTooltips 将负责解析 Markdown、添加工具提示和词频样式，
            //    并最终生成包含 <p> 标签的完整 HTML 结构。
            //    由于 Marked.js 的 sanitize: false，preTagSubtitles 插入的 <span> 标签将被保留。
            const finalHtml = renderMarkdownWithTooltips(
                markdownWithSubtitles, // 传入已包含字幕标签但未完全渲染的 Markdown 字符串
                currentChapterTooltips,
                wordFrequenciesMap,
                maxFreq
            );

            // 将最终的 HTML 字符串解析并添加到 DOM 中
            if (finalHtml) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = finalHtml;
                // 将 tempDiv 的所有子元素直接添加到 chaptersContainer
                Array.from(tempDiv.children).forEach(child => {
                    chaptersContainer.appendChild(child);
                });
            }

        } else if (item.video) {
            // 处理视频项 (这部分逻辑不变)
            const videoId = extractVideoId(item.video);
            if (videoId) {
                const iframeSrc = getYouTubeEmbedUrl(videoId, true); // 启用 JS API

                const wrapper = document.createElement('div');
                wrapper.className = 'video-embed-wrapper';
                Object.assign(wrapper.style, {
                    position: 'relative',
                    paddingBottom: '56.25%',
                    height: '0',
                    overflow: 'hidden',
                    maxWidth: '100%',
                    marginBottom: '20px',
                    backgroundColor: '#000'
                });

                const iframe = document.createElement('iframe');
                iframe.src = iframeSrc;
                Object.assign(iframe.style, {
                    position: 'absolute',
                    top: '0',
                    left: '0',
                    width: '100%',
                    height: '100%',
                    border: '0'
                });
                iframe.setAttribute('allowfullscreen', 'true');
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');

                wrapper.appendChild(iframe);
                chaptersContainer.appendChild(wrapper);
            } else {
                console.warn('无法为视频项生成有效的 YouTube 嵌入 URL:', item.video);
            }
            // 视频项不继续处理为段落，直接返回
        }
    });
}

/**
 * 加载章节索引数据。
 * @returns {Promise<Array<Object>>} - 章节索引数组。
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
 * 加载单个章节内容。
 * @param {string} filePath - 章节内容文件的路径（相对于 data/ 目录）。
 * @returns {Promise<Object|null>} - 章节内容对象或 null。
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
 * 渲染章节目录 (Table of Contents)。
 * @param {Array<Object>} chapterIndex - 章节索引数据。
 * @param {Function} onChapterClick - 点击章节链接时的回调函数。
 * @param {string} [filterCategory='all'] - 用于筛选章节的类别。
 */
export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
    const toc = document.getElementById('toc');
    if (!toc) {
        console.error('TOC container #toc not found.');
        return;
    }
    toc.innerHTML = ''; // 清空旧内容

    const filteredChapters = chapterIndex.filter(ch =>
        filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory))
    );

    if (filteredChapters.length === 0) {
        toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
        return;
    }

    filteredChapters.forEach(ch => {
        const itemLink = document.createElement('a');
        itemLink.href = `#${ch.id}`; // 使用章节ID作为锚点
        itemLink.classList.add('chapter-list-item');
        itemLink.dataset.filePath = ch.file; // 存储文件路径，方便点击时加载

        const img = document.createElement('img');
        img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
        img.alt = ch.title;
        img.loading = 'lazy'; // 添加懒加载
        itemLink.appendChild(img);

        const title = document.createElement('h3');
        title.textContent = ch.title;
        itemLink.appendChild(title);

        // 使用事件委托，将点击处理委托给父级 (main.js 中的处理)
        itemLink.addEventListener('click', (e) => {
            e.preventDefault(); // 阻止默认的锚点跳转
            // 调用回调函数加载章节，并传递章节 ID 和文件路径
            onChapterClick(ch.id, ch.file);
        });
        toc.appendChild(itemLink);
    });
}

// 全局词频数据和最大频率，由 main.js 初始化和更新
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }

/**
 * 设置全局单词频率 Map 和最大频率。
 * @param {Map<string, number>} map - 单词频率 Map。
 * @param {number} maxF - 最大频率。
 */
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}
