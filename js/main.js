// js/main.js
import { loadTooltips, setupTooltips } from './tooltip.js';
import {
  loadChapterIndex,
  renderChapterToc,
  renderSingleChapterContent,
  setGlobalWordFrequencies, // 导入 setter
  getGlobalWordFrequenciesMap, // 导入 getter
  getGlobalMaxFreq // 导入 getter
} from './chapterRenderer.js'; // 导入新的章节渲染函数
import { setupVideoAutoPause, setupFloatingYouTube } from './youtube.js';
import { getWordFrequencies, getWordFrequenciesMap } from './utils.js';

// 用于存储所有章节的原始文本，以便进行全局词频统计
let allParagraphTexts = [];
let tooltipData = {}; // 存储 tooltipData，供后续调用

/**
 * 页面初始化函数。
 */
async function init() {
  // 加载数据
  tooltipData = await loadTooltips(); // 加载工具提示数据

  // 1. 加载章节索引 (data/chapters.json)
  const chapterIndex = await loadChapterIndex();

  // 2. 在后台加载所有章节的内容，以获取完整的文本进行词频统计
  // 这一步会发起多个请求，但不会阻塞页面渲染
  const allChapterContentsPromises = chapterIndex.map(ch =>
    fetch(`data/${ch.file}`).then(res => res.json())
  );
  const allChapterContents = await Promise.all(allChapterContentsPromises);

  // 3. 从所有章节内容中提取所有段落文本
  allParagraphTexts = allChapterContents.flatMap(chapter =>
    chapter.paragraphs.filter(p => typeof p === 'string')
  );

  // 4. 准备受保护的关键词（来自 tooltipData 的键）
  const protectedWords = new Set(Object.keys(tooltipData));

  // 5. 统计所有章节的全局词频
  const wordFrequencies = getWordFrequencies(allParagraphTexts, undefined, protectedWords);
  const wordFrequenciesMap = getWordFrequenciesMap(wordFrequencies);
  const maxFreq = wordFrequencies.length > 0 ? wordFrequencies[0].count : 1;

  // 6. 将全局词频数据存储到 chapterRenderer 中，供渲染时使用
  setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);


  // 7. 渲染章节目录，并设置点击回调
  renderChapterToc(chapterIndex, async (chapterId, filePath) => {
    const content = await loadSingleChapterContent(filePath); // 加载单个章节内容
    if (content) {
      // 使用全局词频数据渲染单个章节
      renderSingleChapterContent(content, tooltipData, getGlobalWordFrequenciesMap(), getGlobalMaxFreq());
      // 每次加载新章节后，需要重新设置工具提示功能，因为 DOM 元素可能已更新
      setupTooltips(tooltipData);
      // 同样，浮动视频功能也可能需要重新初始化或更新其观察器
      setupFloatingYouTube();
    }
  });

  // 8. 初始加载第一个章节（或根据需要加载默认章节）
  if (chapterIndex.length > 0) {
    const firstChapter = chapterIndex[0];
    const content = await loadSingleChapterContent(firstChapter.file);
    if (content) {
      renderSingleChapterContent(content, tooltipData, getGlobalWordFrequenciesMap(), getGlobalMaxFreq());
    }
  }

  // 9. 设置工具提示功能 (首次加载时)
  // 注意：每次加载新章节内容后，可能需要再次调用 setupTooltips()
  // 或者让 setupTooltips 具有更新监听器的能力
  setupTooltips(tooltipData);

  // 10. 设置视频自动暂停和浮动视频功能
  setupVideoAutoPause();
  setupFloatingYouTube();
}

// 辅助函数 (需要从 chapterRenderer.js 导入或重新定义)
// 这里为了示例方便，暂时在 main.js 中重新定义，但建议从 chapterRenderer.js 导入
async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

// 当 DOM 完全加载后，初始化应用
document.addEventListener('DOMContentLoaded', init);
