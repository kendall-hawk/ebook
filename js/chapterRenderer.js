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
  if (!rawTextOrMarkdown.trim() || subtitleStartIndex >= subtitles.length) {
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
    textNodes.push(node);
  }

  // 将所有文本节点的内容连接起来，形成段落的完整文本
  const paragraphFullText = textNodes.map(n => n.nodeValue || '').join('');
  const normalizedParagraphText = normalizeTextForComparison(paragraphFullText);

  let currentSearchIndexInParagraph = 0; // 在段落规范化文本中的当前搜索位置
  let lastUsedSubtitleIndex = subtitleStartIndex; // 记录已成功匹配的最后一个字幕索引

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
      let charCount = 0; // 原始文本中的字符计数 (基于规范化后的长度)
      let startNode = null, endNode = null;
      let startOffset = -1, endOffset = -1;

      // 寻找起始节点和偏移
      for (let j = 0; j < textNodes.length; j++) {
        const nodeValue = textNodes[j].nodeValue || '';
        const normalizedNodeValue = normalizeTextForComparison(nodeValue);

        if (startNode === null && charCount + normalizedNodeValue.length > matchPos) {
          startNode = textNodes[j];
          let cleanCharSeen = 0; // 已经匹配的规范化字符数
          for (let k = 0; k < nodeValue.length; k++) {
            const charNormalizedLength = normalizeTextForComparison(nodeValue[k]).length;
            if (charNormalizedLength > 0) {
              if (cleanCharSeen >= (matchPos - charCount)) {
                startOffset = k;
                break;
              }
              cleanCharSeen++;
            }
            if (k === nodeValue.length - 1) startOffset = k + 1; // 如果到节点末尾还没找到，就是末尾
          }
        }
        charCount += normalizedNodeValue.length;
      }

      charCount = 0; // 重置计数器，用于寻找结束位置
      const matchEndPos = matchPos + normalizedSubtitleText.length;
      // 寻找结束节点和偏移
      for (let j = 0; j < textNodes.length; j++) {
        const nodeValue = textNodes[j].nodeValue || '';
        const normalizedNodeValue = normalizeTextForComparison(nodeValue);

        if (charCount + normalizedNodeValue.length >= matchEndPos) {
          endNode = textNodes[j];
          let cleanCharSeen = 0;
          for (let k = 0; k < nodeValue.length; k++) {
            const charNormalizedLength = normalizeTextForComparison(nodeValue[k]).length;
            if (charNormalizedLength > 0) {
              cleanCharSeen++;
              if (cleanCharSeen >= (matchEndPos - charCount)) {
                endOffset = k + 1; // 结束偏移是匹配字符的后一位
                break;
              }
            }
            if (k === nodeValue.length - 1) endOffset = k + 1; // 如果到节点末尾还没找到，就是末尾
          }
          break; // 找到结束节点后就可以退出循环
        }
        charCount += normalizedNodeValue.length;
      }

      if (startNode && endNode && startOffset !== -1 && endOffset !== -1) {
        const range = doc.createRange();
        try {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);

            if (range.toString().trim().length > 0) {
              const span = doc.createElement('span');
              span.className = 'subtitle-segment';
              span.dataset.subtitleId = subtitle.id;

              range.surroundContents(span);
            } else {
                console.warn('Skipping empty range for subtitle:', subtitle.text);
                lastUsedSubtitleIndex = i + 1;
                continue;
            }

        } catch (e) {
            console.warn('Range.surroundContents failed for subtitle:', subtitle.text, 'Range:', range.toString(), 'Error:', e);
            continue;
        }
        currentSearchIndexInParagraph = matchEndPos;
        lastUsedSubtitleIndex = i + 1;
      } else {
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
 * @param {Array<Object>} subtitleData - SRT 字幕数据 (用于渲染字幕段)。
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, subtitleData = []) {
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
                subtitleData,
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
