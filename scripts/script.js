// script.js
import { renderMarkdown } from './markdown.js';
import { loadTooltips, loadChapters } from './dataLoader.js';
import { renderChapters } from './chapters.js';
import { setupTooltips } from './tooltip.js';
import { setupVideoAutoPause } from './videoAutoPause.js';
import { setupYouTubeFloatPlayer } from './youtubeFloatPlayer.js';

(async function main() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  renderChapters(chapterData, tooltipData);
  setupTooltips(tooltipData);
  setupVideoAutoPause();
  setupYouTubeFloatPlayer();
})();