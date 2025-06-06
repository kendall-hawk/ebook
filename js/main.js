// js/main.js
import { loadTooltips, setupTooltips } from './tooltip.js';
import { loadChapters, renderChapters } from './chapterRenderer.js';
import { setupVideoAutoPause, setupFloatingYouTube } from './youtube.js';
// 从 utils.js 导入词频相关函数
import { getWordFrequencies, getWordFrequenciesMap } from './utils.js';

// ** 移除此行，因为不再生成独立的词云 **
// import { renderWordCloud } from './wordCloud.js';

/**
 * 页面初始化函数。
 */
async function init() {
  // 加载数据
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  // 1. 提取所有段落文本
  const allParagraphTexts = chapterData.chapters.flatMap(chapter =>
    chapter.paragraphs.filter(p => typeof p === 'string')
  );

  // 2. 统计词频
  const wordFrequencies = getWordFrequencies(allParagraphTexts);
  const wordFrequenciesMap = getWordFrequenciesMap(wordFrequencies);

  // 3. 获取最高频率（如果词频列表不为空）
  const maxFreq = wordFrequencies.length > 0 ? wordFrequencies[0].count : 1; // 避免除以零

  // 渲染章节内容，并传递词频数据
  renderChapters(chapterData, tooltipData, wordFrequenciesMap, maxFreq);

  // 设置工具提示功能
  setupTooltips(tooltipData);

  // 设置视频自动暂停功能
  setupVideoAutoPause();

  // 设置浮动视频功能
  setupFloatingYouTube();

  // ** 移除此行，因为不再生成独立的词云 **
  // renderWordCloud(allParagraphTexts, '#word-cloud-display');
}

// 当 DOM 完全加载后，初始化应用
document.addEventListener('DOMContentLoaded', init);
