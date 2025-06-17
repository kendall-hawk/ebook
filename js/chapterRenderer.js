// js/chapterRenderer.js
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
    return Array.isArray(ch.categories) && ch.categories.includes(cat);
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
 * @param {Array<Object>} subtitleData - 当前章节的字幕数据。 <-- 重新添加参数
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback, subtitleData) {
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

  // 用一个临时的 div 来收集所有段落元素，以便统一处理
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

      Array.from(tempDiv.children).forEach(child => {
          tempParagraphContainer.appendChild(child); // 追加到临时容器
      });

    } else if (item.video) {
      // 视频部分保持不变，直接添加到 chaptersContainer
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
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`); // 更正 YouTube embed URL 格式并使用 HTTPS
      } else {
          iframe.src = ensureEnableJsApi(videoUrl);
      }
      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  // --- 关键：后处理文本内容，添加 data-subtitle-id ---
  processAndAddSubtitleIds(tempParagraphContainer, subtitleData);
  // 将处理后的段落内容添加到实际的 chaptersContainer
  Array.from(tempParagraphContainer.children).forEach(child => {
      chaptersContainer.appendChild(child);
  });
  // --- 关键结束 ---

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
    // console.warn('未提供字幕数据，跳过 data-subtitle-id 处理。'); // 避免过多警告
    return;
  }

  // 为每个字幕条目在DOM中找到并包裹其对应的文本，添加 data-subtitle-id
  // 确保一个字幕索引只被一个 DOM 元素标记，但一个 DOM 元素可以包含多个字幕
  subtitleData.forEach((sub, subIndex) => {
    const subtitleTextLower = sub.text.trim().toLowerCase();
    
    // 寻找在 container 中包含当前字幕文本的元素
    // 遍历所有的 p, span, div，尝试找到并包裹
    const allTextElements = container.querySelectorAll('p, span, div'); 

    for (const el of allTextElements) {
        if (el.nodeType === Node.ELEMENT_NODE && el.textContent) {
            const elementTextLower = el.textContent.trim().toLowerCase();

            // 如果当前元素包含字幕文本，尝试在其内部进行包裹
            if (elementTextLower.includes(subtitleTextLower)) {
                // wrapTextWithSubtitleId 负责在文本节点层面精确包裹
                let foundAndWrapped = wrapTextWithSubtitleId(el, subtitleTextLower, subIndex);
                if (foundAndWrapped) {
                    // 如果成功包裹，我们认为这个字幕文本在DOM中找到了它的主要位置
                    // 并且通过 data-subtitle-id 进行了标记。
                    // 即使一个段落包含多个字幕，每个字幕也会尝试被包裹。
                    // 不需要 break，因为一个字幕文本可能在不同的元素中出现（虽然不常见）。
                }
            }
        }
    }
  });
}

/**
 * 在一个元素内部查找并包裹指定的文本，添加 data-subtitle-id。
 * 不再添加 'highlighted' 类，只用于标记可点击区域。
 * @param {HTMLElement} element - 要在其内部查找和包裹文本的 DOM 元素。
 * @param {string} targetText - 要查找和包裹的文本（小写）。
 * @param {number} subtitleIndex - 对应的字幕索引。
 * @returns {boolean} - 如果成功找到并包裹了文本，则返回 true。
 */
function wrapTextWithSubtitleId(element, targetText, subtitleIndex) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
  let currentNode;
  let found = false;

  while ((currentNode = walker.nextNode())) {
    const textNode = currentNode;
    const text = textNode.nodeValue;

    // 避免重复包裹或嵌套包裹
    if (textNode.parentNode && textNode.parentNode.dataset.subtitleId) {
      continue; 
    }

    const index = text.toLowerCase().indexOf(targetText);
    if (index !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNode, index);
        range.setEnd(textNode, index + targetText.length);

        const span = document.createElement('span');
        span.className = 'subtitle-click-segment'; // 新的类名，表示可点击的字幕部分
        span.dataset.subtitleId = subtitleIndex; // 添加 data-subtitle-id

        range.surroundContents(span);
        found = true;
        // 成功包裹后，当前文本节点已经变为 span 及其内部文本节点
        // 为了避免 walker 失效，并确保每个字幕文本只被包裹一次（即使可能在多个文本节点中）
        // 我们选择在成功包裹后退出当前文本节点的遍历，进入下一个字幕的匹配。
        break; 
      } catch (e) {
        // console.warn('包裹字幕文本失败 (wrapTextWithSubtitleId):', e, '文本:', targetText, '节点:', textNode);
      }
    }
  }
  return found;
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
