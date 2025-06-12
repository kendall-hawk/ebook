// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = []; // 存储所有章节的索引数据（id, title, file, thumbnail）
let currentChapterData = null; // 存储当前加载并显示的章节完整数据
let globalWordFrequenciesMap = new Map(); // 存储所有章节的词频
let globalMaxFreq = 1; // 存储所有章节中的最高词频


export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} - Check 'data/chapters.json' path and server.`);
    }
    const data = await res.json();
    allChapterIndex = data.chapters; // 确保 allChapterIndex 被填充
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
 */
export function renderChapterToc(chapterIndex, onChapterClick) {
  const toc = document.getElementById('toc');
  if (!toc) {
    console.error('未找到 #toc 容器。');
    return;
  }
  toc.innerHTML = ''; // 清空旧目录

  chapterIndex.forEach(ch => {
    const itemLink = document.createElement('a');
    itemLink.href = `#${ch.id}`; // 链接到章节ID
    itemLink.classList.add('chapter-list-item'); // 添加 CSS 类

    // 添加缩略图
    if (ch.thumbnail) {
      const img = document.createElement('img');
      img.src = ch.thumbnail;
      img.alt = ch.title; // 设置alt文本，提高可访问性
      itemLink.appendChild(img);
    } else {
      // 如果没有缩略图，可以显示一个默认图片或占位符
      const defaultImg = document.createElement('img');
      defaultImg.src = 'assets/default_thumbnail.jpg'; // 请准备一个默认缩略图
      defaultImg.alt = 'Default Chapter Thumbnail';
      itemLink.appendChild(defaultImg);
    }

    // 添加标题
    const title = document.createElement('h3');
    title.textContent = ch.title;
    itemLink.appendChild(title);

    itemLink.dataset.filePath = ch.file; // 存储文件路径
    itemLink.addEventListener('click', (e) => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file); // 调用回调函数加载章节内容
    });
    toc.appendChild(itemLink);
  });
}

/**
 * 渲染单个章节内容到 DOM。
 * @param {Object} chapterContent - 当前章节的完整数据。
 * @param {Object} tooltipData - tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {Function} navigateToChapterCallback - 用于导航到其他章节的回调函数 (Prev/Next)。
 */
export function renderSingleChapterContent(chapterContent, tooltipData, wordFrequenciesMap, maxFreq, navigateToChapterCallback) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) {
    console.error('未找到 #chapters 容器。');
    return;
  }
  chaptersContainer.innerHTML = ''; // 清空旧内容

  currentChapterData = chapterContent; // 更新当前显示的章节数据

  const title = document.createElement('h2');
  title.id = chapterContent.id; // 确保章节标题有其ID
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      const renderedHtml = renderMarkdownWithTooltips(
          item,
          tooltipData,
          wordFrequenciesMap,
          maxFreq
      );

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = renderedHtml;

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
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}?enablejsapi=1`);
      } else {
          iframe.src = ensureEnableJsApi(videoUrl);
      }

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  const navSection = document.createElement('div');
  navSection.classList.add('chapter-nav-links');

  // 获取当前章节在 allChapterIndex 中的位置
  const currentIndex = allChapterIndex.findIndex(ch => ch.id === chapterContent.id);

  // --- 添加“上一篇”按钮 ---
  if (currentIndex > 0) {
    const prevChapter = allChapterIndex[currentIndex - 1];
    const prevLink = document.createElement('a');
    prevLink.href = `#${prevChapter.id}`;
    prevLink.textContent = '上一篇';
    prevLink.classList.add('chapter-nav-link');
    prevLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 调用从 main.js 传入的回调函数进行导航
      navigateToChapterCallback(prevChapter.id, prevChapter.file);
    });
    navSection.appendChild(prevLink);
  }

  // --- 添加分隔符 ---
  // 如果有上一篇和下一篇，或有上一篇和回到顶部，则添加分隔符
  if (currentIndex > 0 && (currentIndex < allChapterIndex.length - 1 || chapterContent.id)) {
    const separator1 = document.createTextNode(' | ');
    navSection.appendChild(separator1);
  }

  // --- 保留“返回本篇文章开头”按钮 ---
  const toTopLink = document.createElement('a');
  toTopLink.href = `#${chapterContent.id}`; // 链接到当前章节的ID
  toTopLink.textContent = '返回本篇文章开头';
  toTopLink.classList.add('chapter-nav-link');
  toTopLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 平滑滚动到当前章节标题的顶部
      document.getElementById(chapterContent.id).scrollIntoView({ behavior: 'smooth' });
  });
  navSection.appendChild(toTopLink);


  // --- 添加分隔符 ---
  // 如果有下一篇和上一篇，或有下一篇和回到顶部，则添加分隔符
  if (currentIndex < allChapterIndex.length - 1 && (currentIndex > 0 || chapterContent.id)) {
    const separator2 = document.createTextNode(' | ');
    navSection.appendChild(separator2);
  }


  // --- 添加“下一篇”按钮 ---
  if (currentIndex < allChapterIndex.length - 1) {
    const nextChapter = allChapterIndex[currentIndex + 1];
    const nextLink = document.createElement('a');
    nextLink.href = `#${nextChapter.id}`;
    nextLink.textContent = '下一篇';
    nextLink.classList.add('chapter-nav-link');
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      // 调用从 main.js 传入的回调函数进行导航
      navigateToChapterCallback(nextChapter.id, nextChapter.file);
    });
    navSection.appendChild(nextLink);
  }

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
