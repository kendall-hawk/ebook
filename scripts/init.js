import { loadTooltips, setupTooltips } from './tooltip.js';
import { loadChapters, renderChapters } from './chapters.js';
import { setupVideoAutoPause } from './videoAutoPause.js';
import './floatVideo.js'; // 自执行模块

document.addEventListener('DOMContentLoaded', async () => {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  renderChapters(chapterData, tooltipData);
  setupTooltips(tooltipData);
  setupVideoAutoPause();
});