// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = []; // 存储所有章节的索引数据（id, title, file）
let currentChapterData = null; // 存储当前加载并显示的章节完整数据
let globalWordFrequenciesMap = new Map(); // 存储所有章节的词频
let globalMaxFreq = 1; // 存储所有章节中的最高词频

/**
 * 加载章节索引数据。
 * @returns {Promise<Array<Object>>} - 章节索引数组。
 */
export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) {
      // 如果文件不存在或无法访问，这里会捕获错误
      throw new Error(`HTTP error! status: ${res.status} - Check 'data/chapters.json' path and server.`);
    }
    const data = await res.json();
    allChapterIndex = data.chapters; // 存储到全局变量
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引数据失败:', error);
    // 返回空数组，避免后续操作出错
    return [];
  }
}

/**
 * 加载单个章节的完整内容。
 * @param {string} filePath - 章节内容文件的路径 (例如: 'chapters/1.json')。
 * @returns {Promise<Object>} - 单个章节的完整数据。
 */
export async function loadSingleChapterContent(filePath) {
  try {
    // 确保这里拼接的路径是相对于网站根目录的正确路径
    // 如果 filePath 本身已包含 'data/' (例如 'data/chapters/1.json')，
    // 则在 chapters.json 中应将其改为 'chapters/1.json'
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
 * 渲染章节目录到 DOM。
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
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    link.dataset.filePath = ch.file; // 存储文件路径
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // 调用传入的回调函数来处理章节加载和渲染
      onChapterClick(ch.id, ch.file);
    });
    toc.appendChild(link);
  });
}

/**
 * 渲染单个章节内容到 DOM。
 * @param {Object} chapterContent - 单个章节的完整数据。
 * @param {Object} tooltipData - tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 */
export function renderSingleChapterContent(chapterContent, tooltipData, wordFrequenciesMap, maxFreq) {
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
      const para = document.createElement('p');
      para.innerHTML = renderMarkdownWithTooltips(
          item,
          tooltipData,
          wordFrequenciesMap,
          maxFreq
      );
      chaptersContainer.appendChild(para);
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
      // 关键：允许画中画，autoplay 必须在 enablejsapi=1 的情况下才能通过 API 控制
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

      const videoId = extractVideoId(videoUrl);
      if (videoId) {
          // ！！！ 关键修正 ！！！ 使用正确的 YouTube 嵌入 URL 格式
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`);
      } else {
          // 如果是完整的 YouTube URL，也要确保 enablejsapi=1
          // 这里假设 videoUrl 已经是完整的嵌入 URL，否则 extractVideoId 会失败
          iframe.src = ensureEnableJsApi(videoUrl);
      }

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  // --- 新增：文章末尾导航链接 ---
  const navSection = document.createElement('div');
  navSection.classList.add('chapter-nav-links'); // 添加一个类名，用于CSS样式

  // 1. 返回本篇文章开头
  const toTopLink = document.createElement('a');
  toTopLink.href = `#${chapterContent.id}`; // 链接到当前章节标题的ID
  toTopLink.textContent = 'Scroll back to the top';
  toTopLink.classList.add('chapter-nav-link'); // 添加一个类名，用于CSS样式
  navSection.appendChild(toTopLink);

  // 添加一个分隔符（可选）
  const separator = document.createTextNode(' | ');
  navSection.appendChild(separator);

  // 2. 返回目录
  const toTocLink = document.createElement('a');
  toTocLink.href = '#toc'; // 链接到目录的ID（在index.html中是<nav id="toc">）
  toTocLink.textContent = 'Back to contents';
  toTocLink.classList.add('chapter-nav-link'); // 添加一个类名，用于CSS样式
  navSection.appendChild(toTocLink);

  chaptersContainer.appendChild(navSection); // 将导航部分添加到章节容器
}

// 导出 getter，以便其他模块可以访问全局词频数据
export function getGlobalWordFrequenciesMap() {
  return globalWordFrequenciesMap;
}

export function getGlobalMaxFreq() {
  return globalMaxFreq;
}

// 导出 setter，以便 main.js 可以设置全局词频数据
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}
