// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js'; // 假设 renderMarkdownWithTooltips 在 tooltip.js
import { ensureEnableJsApi, extractVideoId } from './utils.js';
import { tokenizeText } from './audio/tokenizer.js'; // 导入分词器
import { parseSRT } from './audio/srtParser.js'; // 导入 SRT 解析器

let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;


export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} - Check 'data/chapters.json' path and server.`);
    }
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
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} - Check 'data/${filePath}' path and server.`);
    }
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

/**
 * 渲染章节目录到 DOM (现在用于主页的缩略图列表)。
 * @param {Array<Object>} chapterIndex - 章节索引数组。
 * @param {Function} onChapterClick - 点击章节时触发的回调函数。
 * @param {string} [filterCategory='all'] - 用于过滤的分类名称，'all' 表示不过滤。
 */
export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) {
    console.error('未找到 #toc 容器。');
    return;
  }
  toc.innerHTML = '';

  const filteredChapters = chapterIndex.filter(ch => {
    if (filterCategory === 'all') {
      return true;
    }
    return Array.isArray(ch.categories) && ch.categories.includes(filterCategory);
  });


  if (filteredChapters.length === 0) {
      toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
      return;
  }


  filteredChapters.forEach(ch => {
    const itemLink = document.createElement('a');
    itemLink.href = `#${ch.id}`;
    itemLink.classList.add('chapter-list-item');

    if (ch.thumbnail) {
      const img = document.createElement('img');
      img.src = ch.thumbnail;
      img.alt = ch.title;
      itemLink.appendChild(img);
    } else {
      const defaultImg = document.createElement('img');
      defaultImg.src = 'assets/default_thumbnail.jpg';
      defaultImg.alt = 'Default Chapter Thumbnail';
      itemLink.appendChild(defaultImg);
    }

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
 * 渲染单个章节内容到 DOM。
 * @param {Object} chapterContent - 当前章节的完整数据。
 * @param {Object} currentChapterTooltips - 当前章节专属的 Tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {Function} navigateToChapterCallback - 用于导航到其他章节的回调函数 (Prev/Next)。
 * @param {Array<Object>} srtEntries - 从 srtParser.js 解析出来的字幕数据数组，每个对象包含 { start, end, text }。
 */
export async function renderSingleChapterContent(
  chapterContent,
  currentChapterTooltips,
  wordFrequenciesMap,
  maxFreq,
  navigateToChapterCallback,
  srtEntries = [] // 新增 SRT 数据参数
) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) {
    console.error('未找到 #chapters 容器。');
    return;
  }
  chaptersContainer.innerHTML = '';

  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  let srtIndex = 0; // 用于跟踪当前处理到哪个 SRT 句子

  for (const item of chapterContent.paragraphs) {
    if (typeof item === 'string') {
      const paragraphContainer = document.createElement('p'); // 使用 <p> 标签作为段落容器
      paragraphContainer.classList.add('chapter-paragraph'); // 可选，用于样式

      // 将段落文本与 SRT 句子进行匹配和切割
      const segments = splitParagraphBySrtSentences(item, srtEntries, srtIndex);

      for (const segment of segments) {
        if (segment.type === 'srtSentence') {
          // 这是 SRT 对应的句子
          const sentenceElement = document.createElement('span');
          sentenceElement.classList.add('sentence');
          sentenceElement.dataset.subIndex = srtIndex; // 关联到 SRT 索引
          sentenceElement.dataset.startTime = srtEntries[srtIndex].start; // 存储开始时间
          sentenceElement.dataset.endTime = srtEntries[srtIndex].end;   // 存储结束时间


          // 对 SRT 句子进行分词并渲染 word <span>
          const tokens = tokenizeText(segment.text);
          tokens.forEach(token => {
            const wordElement = document.createElement('span');
            wordElement.classList.add('word');
            wordElement.textContent = token.word;

            const lowerWord = token.word.toLowerCase();
            // 检查是否有 Tooltip
            if (currentChapterTooltips.hasOwnProperty(lowerWord)) {
              wordElement.dataset.tooltipId = lowerWord; // 添加 data-tooltip-id
            }

            // 计算并应用词频样式
            const freq = wordFrequenciesMap.get(lowerWord) || 0;
            const baseFontSize = 16; // 默认值，与 tooltip.js 中保持一致
            const maxFontSizeIncrease = 12; // 默认值，与 tooltip.js 中保持一致
            if (freq > 0 && maxFreq > 0) {
              const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
              wordElement.style.fontSize = `${calculatedFontSize.toFixed(1)}px`;
            }

            sentenceElement.appendChild(wordElement);
          });
          paragraphContainer.appendChild(sentenceElement);
          srtIndex++; // 递增 SRT 索引
        } else {
          // 这是非 SRT 部分的文本，可能包含 Markdown，交给 renderMarkdownWithTooltips 处理
          // renderMarkdownWithTooltips 内部会处理 Markdown、Tooltip 和词频
          const processedHtml = renderMarkdownWithTooltips(
            segment.text,
            currentChapterTooltips,
            wordFrequenciesMap,
            maxFreq
          );
          // 创建一个临时 div 来解析 HTML 字符串，然后将子节点添加到 paragraphContainer
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = processedHtml;
          while (tempDiv.firstChild) {
            paragraphContainer.appendChild(tempDiv.firstChild);
          }
        }
      }
      chaptersContainer.appendChild(paragraphContainer);
    } else if (item.video) {
      const videoUrl = item.video;
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

      const videoId = extractVideoId(videoUrl);
      if (videoId) {
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`); // 更正 YouTube embed URL 格式
      } else {
          iframe.src = ensureEnableJsApi(videoUrl);
      }

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  }

  const navSection = document.createElement('div');
  navSection.classList.add('chapter-nav-links');

  const currentIndex = allChapterIndex.findIndex(ch => ch.id === chapterContent.id);

  if (currentIndex > 0) {
    const prevChapter = allChapterIndex[currentIndex - 1];
    const prevLink = document.createElement('a');
    prevLink.href = `#${prevChapter.id}`;
    prevLink.textContent = '上一篇';
    prevLink.classList.add('chapter-nav-link');
    prevLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToChapterCallback(prevChapter.id, prevChapter.file);
    });
    navSection.appendChild(prevLink);
  }

  if (currentIndex > 0 && (currentIndex < allChapterIndex.length - 1 || chapterContent.id)) {
    const separator1 = document.createTextNode(' | ');
    navSection.appendChild(separator1);
  }

  const toTopLink = document.createElement('a');
  toTopLink.href = `#${chapterContent.id}`;
  toTopLink.textContent = '返回本篇文章开头';
  toTopLink.classList.add('chapter-nav-link');
  toTopLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(chapterContent.id).scrollIntoView({ behavior: 'smooth' });
  });
  navSection.appendChild(toTopLink);

  if (currentIndex < allChapterIndex.length - 1 && (currentIndex > 0 || chapterContent.id)) {
    const separator2 = document.createTextNode(' | ');
    navSection.appendChild(separator2);
  }

  if (currentIndex < allChapterIndex.length - 1) {
    const nextChapter = allChapterIndex[currentIndex + 1];
    const nextLink = document.createElement('a');
    nextLink.href = `#${nextChapter.id}`;
    nextLink.textContent = '下一篇';
    nextLink.classList.add('chapter-nav-link');
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToChapterCallback(nextChapter.id, nextChapter.file);
    });
    navSection.appendChild(nextLink);
  }

  if (navSection.children.length > 0) {
      const separator3 = document.createTextNode(' | ');
      navSection.appendChild(separator3);
  }
  const backToTocLink = document.createElement('a');
  backToTocLink.href = '#';
  backToTocLink.textContent = '返回文章列表';
  backToTocLink.classList.add('chapter-nav-link');
  backToTocLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToChapterCallback('');
  });
  navSection.appendChild(backToTocLink);


  chaptersContainer.appendChild(navSection);
}

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
 * 辅助函数：根据 SRT 句子切割段落文本
 * 这会尝试在给定的段落文本中查找连续的 SRT 句子，并将其与非 SRT 部分分开。
 * 注意：此函数假定 SRT 句子在原始段落中是连续的，且会从 startIndex 处开始查找。
 * 它可能无法完美处理 SRT 句子在原始 Markdown 中被其他 Markdown 语法（如粗体、链接）分割的情况。
 *
 * @param {string} paragraphText - 原始的段落文本
 * @param {Array<Object>} srtEntries - 所有的 SRT 条目
 * @param {number} startIndex - 当前段落应该从哪个 SRT 索引开始匹配
 * @returns {Array<Object>} - 包含 { type: 'srtSentence' | 'otherText', text: string, srtIndex?: number } 的数组
 */
function splitParagraphBySrtSentences(paragraphText, srtEntries, startIndex) {
  const segments = [];
  let remainingText = paragraphText;
  let currentIndex = startIndex;

  // 标准化字符串：去除多余空格与换行，统一为单空格
  const normalize = text => text.replace(/\s+/g, ' ').trim();

  while (remainingText.length > 0 && currentIndex < srtEntries.length) {
    const srtText = srtEntries[currentIndex].text.trim();
    const normSrtText = normalize(srtText);
    const normRemaining = normalize(remainingText);

    const matchPos = normRemaining.indexOf(normSrtText);

    if (matchPos !== -1) {
      // 在原始剩余文本中找 SRT 原文对应起始位置，尝试匹配原文（非标准化文本）
      const rawIndex = remainingText.indexOf(srtText);

      if (rawIndex !== -1) {
        // 非SRT文本段（SRT句子前）
        if (rawIndex > 0) {
          segments.push({
            type: 'otherText',
            text: remainingText.slice(0, rawIndex),
          });
        }

        // 添加SRT句子
        segments.push({
          type: 'srtSentence',
          text: srtText,
          srtIndex: currentIndex,
        });

        // 更新剩余文本
        remainingText = remainingText.slice(rawIndex + srtText.length);
      } else {
        // 原文中找不到该句，说明文本差异较大，直接作为整体插入，并退出循环
        // 防止死循环
        segments.push({
          type: 'otherText',
          text: remainingText,
        });
        remainingText = '';
      }
    } else {
      // 规范化文本无法匹配，退出循环
      break;
    }
    currentIndex++;
  }

  // 剩余文本作为非 SRT 处理
  if (remainingText.length > 0) {
    segments.push({
      type: 'otherText',
      text: remainingText,
    });
  }

  return segments;
}