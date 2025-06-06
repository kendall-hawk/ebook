// js/main.js
import { loadTooltips, setupTooltips } from './tooltip.js';
import { loadChapters, renderChapters } from './chapterRenderer.js';
import { setupVideoAutoPause, setupFloatingYouTube } from './youtube.js';
import { getWordFrequencies } from './utils.js'; // 导入 getWordFrequencies
import { renderWordCloud } from './wordCloud.js'; // 导入 renderWordCloud

/**
 * 页面初始化函数。
 */
async function init() {
  // 加载数据
  const tooltipData = await loadTooltips();
  const chapterData = await await loadChapters(); // 修正：这里有个 await 重复了

  // 提取所有段落文本用于词频统计
  const allParagraphTexts = chapterData.chapters.flatMap(chapter =>
    chapter.paragraphs.filter(p => typeof p === 'string')
  );

  // 渲染章节内容
  renderChapters(chapterData, tooltipData);

  // 设置工具提示功能
  setupTooltips(tooltipData);

  // 设置视频自动暂停功能
  setupVideoAutoPause();

  // 设置浮动视频功能
  setupFloatingYouTube();

  // 渲染词云
  renderWordCloud(allParagraphTexts, '#word-cloud-display');
}

// 当 DOM 完全加载后，初始化应用
document.addEventListener('DOMContentLoaded', init);
