// js/main.js
import { loadTooltips, setupTooltips } from './tooltip.js';
import {
  loadChapterIndex,
  loadSingleChapterContent,
  renderChapterToc,
  renderSingleChapterContent,
  setGlobalWordFrequencies,
  getGlobalWordFrequenciesMap,
  getGlobalMaxFreq
} from './chapterRenderer.js';
import { setupVideoAutoPause, setupFloatingYouTube } from './youtube.js';
import { getWordFrequencies, getWordFrequenciesMap } from './utils.js';

let allParagraphTexts = []; // 用于存储所有章节的原始文本，以便进行全局词频统计
let tooltipData = {};       // 存储 tooltipData，供后续调用

/**
 * 页面初始化函数。
 */
async function init() {
  try {
    // 加载数据
    tooltipData = await loadTooltips(); // 加载工具提示数据

    // 1. 加载章节索引 (data/chapters.json)
    const chapterIndex = await loadChapterIndex();
    if (chapterIndex.length === 0) {
        console.warn("未找到章节索引，或者索引为空。请检查 data/chapters.json 文件。");
        // 如果没有章节，这里应该停止，否则后续操作可能会出错
        return;
    }

    // 2. 在后台加载所有章节的内容，以获取完整的文本进行全局词频统计
    // 这一步会发起多个请求，但不会阻塞页面渲染
    const allChapterContentsPromises = chapterIndex.map(ch =>
      loadSingleChapterContent(ch.file)
    );
    const allChapterContents = await Promise.all(allChapterContentsPromises);

    // 过滤掉加载失败的章节内容 (null)
    const validChapterContents = allChapterContents.filter(content => content !== null);

    // 3. 从所有章节内容中提取所有段落文本
    allParagraphTexts = validChapterContents.flatMap(chapter =>
      chapter.paragraphs.filter(p => typeof p === 'string')
    );

    // 4. 准备受保护的关键词（来自 tooltipData 的键）
    const protectedWords = new Set(Object.keys(tooltipData));

    // 5. 统计所有章节的全局词频
    const wordFrequencies = getWordFrequencies(allParagraphTexts, undefined, protectedWords);
    const wordFrequenciesMap = getWordFrequenciesMap(wordFrequencies);
    // 确保 maxFreq 至少为 1，避免除以零的错误
    const maxFreq = wordFrequencies.length > 0 ? wordFrequencies[0].count : 1;

    // 6. 将全局词频数据存储到 chapterRenderer 中，供渲染时使用
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    // 7. 渲染章节目录，并设置点击回调
    renderChapterToc(chapterIndex, async (chapterId, filePath) => {
      const content = await loadSingleChapterContent(filePath); // 加载单个章节内容
      if (content) {
        // 使用全局词频数据渲染单个章节
        renderSingleChapterContent(content, tooltipData, getGlobalWordFrequenciesMap(), getGlobalMaxFreq());
        // 每次加载新章节后，需要重新设置工具提示功能，因为 DOM 元素已更新
        // setupTooltips 内部会移除并重新绑定监听器
        setupTooltips(tooltipData);
        // setupFloatingYouTube() 只需要在应用启动时调用一次，此处不需要重复调用
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
    // 这一步很重要，确保在第一次渲染后立即为所有初始元素绑定事件
    setupTooltips(tooltipData);

    // 10. 设置视频自动暂停和浮动视频功能 (只需要在应用启动时调用一次)
    setupVideoAutoPause();
    setupFloatingYouTube(); // 这个调用应该只发生一次

  } catch (error) {
    console.error("初始化应用时发生错误:", error);
  }
}

// 当 DOM 完全加载后，初始化应用
document.addEventListener('DOMContentLoaded', init);
