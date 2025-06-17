// js/chapterRenderer.js (优化后)
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

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
    // 注意：这里的 'cat' 变量没有定义。如果你的分类逻辑需要它，请确保它被正确传入或定义。
    // 假设 'cat' 应该指的是 filterCategory
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
      defaultImg.src = 'assets/default_thumbnail.jpg'; // 确保你有这个默认缩略图
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
 * @param {Array<Object>} subtitleData - 当前章节的字幕数据。
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback, subtitleData) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) {
    console.error('未找到 #chapters 容器。');
    return;
  }
  chaptersContainer.innerHTML = ''; // 清空现有内容

  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  // 用一个临时的 div 来收集所有段落元素，以便统一处理和标记
  const tempParagraphContainer = document.createElement('div');

  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      const renderedHtml = renderMarkdownWithTooltips(
          item,
          currentChapterTooltips,
          wordFrequenciesMap,
          maxFreq
      );

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = renderedHtml;

      // 将 Markdown 渲染后的子元素（例如 <p>, <div>, <span>）追加到临时容器
      Array.from(tempDiv.children).forEach(child => {
          tempParagraphContainer.appendChild(child);
      });

    } else if (item.video) {
      // 视频部分保持不变，直接添加到 chaptersContainer (无需字幕标记)
      const videoUrl = item.video;
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative', paddingBottom: '56.25%', height: '0',
        overflow: 'hidden', maxWidth: '100%', marginBottom: '20px'
      });
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute', top: '0', left: '0',
        width: '100%', height: '100%',
      });
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

      const videoId = extractVideoId(videoUrl);
      if (videoId) {
          // 注意这里修正了 YouTube embed URL 的格式，并确保使用 HTTPS
          iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
      } else {
          iframe.src = ensureEnableJsApi(videoUrl); // 如果不是 YouTube 视频，则按原样处理
      }
      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  // --- 关键：后处理文本内容，添加 data-subtitle-id ---
  // 在这里调用新的函数来处理字幕ID标记
  processAndAddSubtitleIds(tempParagraphContainer, subtitleData);
  // 将处理后的段落内容添加到实际的 chaptersContainer
  Array.from(tempParagraphContainer.children).forEach(child => {
      chaptersContainer.appendChild(child);
  });
  // --- 关键结束 ---

  // 导航链接部分保持不变
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

/**
 * 遍历已渲染的DOM元素，并根据字幕数据添加 data-subtitle-id 属性。
 * 这将尝试在页面文本中找到与字幕文本匹配的部分，并为其添加唯一标识。
 * @param {HTMLElement} container - 包含章节文本内容的容器元素 (tempParagraphContainer)。
 * @param {Array<Object>} subtitleData - 当前章节的字幕数据。
 */
function processAndAddSubtitleIds(container, subtitleData) {
  if (!subtitleData || subtitleData.length === 0) {
    console.warn('未提供字幕数据，跳过 data-subtitle-id 处理。');
    return;
  }

  // 收集所有可供匹配的文本块元素 (例如，P标签、DIV标签或 SPANS)
  // 假设你的章节文本主要在 <p> 标签中，但也可能是其他块级元素或行内元素
  const textBlocks = Array.from(container.querySelectorAll('p, div, span, h1, h2, h3, li'));

  // 创建一个 Map 来跟踪每个 subtitleData 索引是否已被标记到某个 DOM 元素
  const markedSubtitleIndices = new Set();

  subtitleData.forEach((sub, subIndex) => {
    // 如果这个字幕已经被成功标记过，则跳过
    if (markedSubtitleIndices.has(subIndex)) {
        return;
    }

    const subtitleTextLower = sub.text.trim().toLowerCase();
    let bestMatchedElement = null;
    let highestScore = -Infinity;

    for (const blockEl of textBlocks) {
      if (blockEl.textContent) {
        const blockTextLower = blockEl.textContent.trim().toLowerCase();

        // 使用 Jaro-Winkler 相似度来判断匹配度
        const similarity = computeJaroWinklerSimilarity(blockTextLower, subtitleTextLower);

        // 如果相似度足够高，并且是目前找到的最高分，就记录下来
        // 阈值可以根据你的数据和期望的匹配精度进行调整
        // 0.75 是一个建议的起始值，可以根据需要降低或升高
        if (similarity > 0.75 && similarity > highestScore) {
          highestScore = similarity;
          bestMatchedElement = blockEl;
        }
      }
    }

    // 如果找到了一个足够好的匹配，则为该元素添加 data-subtitle-id
    if (bestMatchedElement && highestScore >= 0.75) {
      // 避免重复设置，如果一个元素已经有 data-subtitle-id，则追加
      const existingId = bestMatchedElement.dataset.subtitleId;
      if (existingId) {
          // 如果一个段落对应多个字幕，则将多个 ID 用逗号分隔
          bestMatchedElement.dataset.subtitleId = `${existingId},${subIndex}`;
      } else {
          bestMatchedElement.dataset.subtitleId = String(subIndex); // 确保是字符串
      }
      // 添加一个类，方便 CSS 样式或后续 JS 识别哪些元素是可点击的字幕部分
      bestMatchedElement.classList.add('subtitle-segment');
      markedSubtitleIndices.add(subIndex); // 标记此字幕已被处理
    }
  });
}

/**
 * Computes the Jaro-Winkler similarity between two strings.
 * Values range from 0 to 1, where 1 means identical strings.
 * @param {string} s1 - String 1.
 * @param {string} s2 - String 2.
 * @returns {number} The Jaro-Winkler similarity score.
 */
function computeJaroWinklerSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const n1 = s1.length;
    const n2 = s2.length;
    if (n1 === 0 || n2 === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(n1, n2) / 2) - 1;
    const s1Matches = new Array(n1).fill(false);
    const s2Matches = new Array(n2).fill(false);
    let numMatches = 0;

    for (let i = 0; i < n1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, n2);
        for (let j = start; j < end; j++) {
            if (!s2Matches[j] && s1[i] === s2[j]) {
                s1Matches[i] = true;
                s2Matches[j] = true;
                numMatches++;
                break;
            }
        }
    }

    if (numMatches === 0) return 0.0;

    let k = 0;
    let numTranspositions = 0;
    for (let i = 0; i < n1; i++) {
        if (s1Matches[i]) {
            while (!s2Matches[k]) k++;
            if (s1[i] !== s2[k]) {
                numTranspositions++;
            }
            k++;
        }
    }
    const jaro = (numMatches / n1 + numMatches / n2 + (numMatches - numTranspositions / 2) / numMatches) / 3;

    // Winkler modification
    const prefixLength = Math.min(4, n1, n2); // Max prefix length to consider is 4
    let commonPrefix = 0;
    for (let i = 0; i < prefixLength; i++) {
        if (s1[i] === s2[i]) {
            commonPrefix++;
        } else {
            break;
        }
    }

    const p = 0.1; // Scaling factor for the common prefix. Usually 0.1
    return jaro + commonPrefix * p * (1 - jaro);
}


// 原来的 wrapTextWithSubtitleId 函数不再需要，因为我们现在标记的是整个段落/块级元素。
// 如果未来你需要更细粒度的点击（比如点击单个词跳转），可以再考虑重新引入和修改。
// function wrapTextWithSubtitleId(element, targetText, subtitleIndex) { ... }


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
