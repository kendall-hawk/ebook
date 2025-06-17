// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

/**
 * 健壮的单词包裹函数。它将HTML字符串转换为DOM，然后遍历文本节点，
 * 安全地将每个单词包裹在带有data-word属性的<span>标签中，
 * 同时保留原始HTML结构和Tooltips。
 * @param {string} htmlString - 包含HTML内容的字符串（可能由renderMarkdownWithTooltips生成）。
 * @returns {string} - 包裹单词后的HTML字符串。
 */
function wrapWordsWithSpan(htmlString) {
  const container = document.createElement('div');
  container.innerHTML = htmlString; // 将HTML字符串解析为DOM结构

  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      // 避免处理空的或只包含空白的文本节点
      if (node.textContent.trim() === '') return;

      // 分割单词和非单词部分，保留分隔符
      // 正则表达式 /(\b\w+\b)/ 会捕获单词，同时将其作为单独的元素包含在结果数组中
      const parts = node.textContent.split(/(\b\w+\b)/);

      const fragment = document.createDocumentFragment();
      let hasChanged = false; // 标记是否发生了DOM修改

      for (const part of parts) {
        if (part.length === 0) continue; // 忽略空字符串部分，可能由 split 产生

        if (/\b\w+\b/.test(part)) { // 如果这部分是一个单词
          const span = document.createElement('span');
          span.className = 'word';
          span.dataset.word = part.toLowerCase();
          span.textContent = part;
          fragment.appendChild(span);
          hasChanged = true;
        } else { // 如果这部分是非单词（空格、标点符号等）
          fragment.appendChild(document.createTextNode(part));
        }
      }

      // 只有当实际有单词被包裹时才替换节点，提高性能
      if (hasChanged) {
          node.replaceWith(fragment);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 避免处理某些特殊标签的子节点，例如 <script>, <style>，因为它们不包含用户可见文本
      if (node.nodeName === 'SCRIPT' || node.nodeName === 'STYLE') {
          return;
      }
      // 如果你的 Tooltip 触发器是特定的标签（如<span>）且带有 data-tooltip-id，
      // 并且你不希望 Tooltip 内部的文本再次被包裹，可以添加以下判断：
      // if (node.tagName === 'SPAN' && node.hasAttribute('data-tooltip-id')) {
      //     return; // 跳过处理这个tooltip触发器及其子节点
      // }
      // 或者如果 Tooltip 触发器有特定的类名：
      // if (node.classList.contains('tooltip-trigger')) {
      //     return; // 跳过处理这个tooltip触发器及其子节点
      // }

      // 递归处理子节点
      Array.from(node.childNodes).forEach(processNode);
    }
  }

  processNode(container); // 从根容器开始处理
  return container.innerHTML; // 返回处理后的HTML字符串
}

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
 * 此函数现在会先将Markdown内容转换为HTML并应用Tooltip，
 * 然后再对生成的HTML进行单词包裹。
 * @param {Object} chapterContent - 当前章节的完整数据。
 * @param {Object} currentChapterTooltips - 当前章节专属的 Tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {Function} navigateToChapterCallback - 用于导航到其他章节的回调函数 (Prev/Next)。
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) {
    console.error('未找到 #chapters 容器。');
    return;
  }
  chaptersContainer.innerHTML = ''; // 清空容器内容

  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      // 1. 将Markdown内容渲染为HTML，并应用Tooltips
      const renderedHtmlWithTooltips = renderMarkdownWithTooltips(
          item,
          currentChapterTooltips,
          wordFrequenciesMap,
          maxFreq
      );

      // 2. 对已经包含HTML和Tooltips的字符串进行单词包裹
      const finalRenderedHtml = wrapWordsWithSpan(renderedHtmlWithTooltips);

      // 3. 将最终的HTML添加到DOM中
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = finalRenderedHtml; // 使用 innerHTML 解析字符串

      // 将 tempDiv 的所有子元素（段落、列表、标题等）添加到章节容器中
      Array.from(tempDiv.children).forEach(child => {
          chaptersContainer.appendChild(child);
      });

    } else if (item.video) {
      const videoUrl = item.video;
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative',
        paddingBottom: '56.25%', // 16:9 比例
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
          // 更正 YouTube embed URL 格式为标准格式
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}?enablejsapi=1`);
      } else {
          iframe.src = ensureEnableJsApi(videoUrl); // 如果不是YouTube视频，直接使用原URL
      }

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  // 章节导航链接
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

  // 添加分隔符，如果前面有链接且后面还有链接或本页返回
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
      // 使用 chapterContent.id 确保滚动到当前章节标题
      document.getElementById(chapterContent.id)?.scrollIntoView({ behavior: 'smooth' });
  });
  navSection.appendChild(toTopLink);

  // 添加分隔符，如果前面有链接或本页返回，且后面还有链接
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

  // 确保在 "返回文章列表" 前添加分隔符，只要navSection中有内容
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
      navigateToChapterCallback(''); // 传递空字符串或特定值表示返回主目录
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
