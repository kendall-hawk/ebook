// js/main.js
import { loadTooltips, setupTooltips } from './tooltip.js';
import { loadChapters, renderChapters } from './chapterRenderer.js';
import { setupVideoAutoPause, setupFloatingYouTube } from './youtube.js';

/**
 * 页面初始化函数。
 */
async function init() {
  // 加载数据
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  // 渲染章节内容
  renderChapters(chapterData, tooltipData);

  // 设置工具提示功能
  setupTooltips(tooltipData);

  // 设置视频自动暂停功能
  setupVideoAutoPause();

  // 设置浮动视频功能
  setupFloatingYouTube();
}

// 当 DOM 完全加载后，初始化应用
document.addEventListener('DOMContentLoaded', init);
