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
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    allChapterIndex = data.chapters; // 存储到全局变量
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引数据失败:', error);
    return [];
  }
}

/**
 * 加载单个章节的完整内容。
 * @param {string} filePath - 章节内容文件的路径。
 * @returns {Promise<Object>} - 单个章节的完整数据。
 */
async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`); // 注意这里拼接路径
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
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
  title.id = chapterContent.id;
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
          // 修正：确保这里使用标准的 YouTube iframe src 格式
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/`。`或者`[https://www.youtube.com/iframe\_api](https://www.youtube.com/iframe_api)`);
      } else {
          iframe.src = ensureEnableJsApi(videoUrl);
      }

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  // 确保在渲染新内容后重新设置工具提示，因为 DOM 元素已更新
  // 注意：setupTooltips 需要在 main.js 中再次调用，因为它监听的是 document
  // 并且可能需要访问全局的 tooltipData
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
