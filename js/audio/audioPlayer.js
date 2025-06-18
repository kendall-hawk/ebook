// js/audio/audioPlayer.js (最终优化版本 - 提高查找效率，确保事件清理)

let audio;
let subtitleData = [];
let currentHighlightedElement = null; // 用于跟踪当前高亮元素的变量
let audioPlayerContainer = null; // 播放器容器的引用

// 用于存储绑定的事件处理器，以便正确移除
let boundTimeUpdateHandler = null; 
let boundClickHandler = null; 

/**
 * 彻底清理旧的播放器实例和事件监听器
 */
function cleanupOldPlayer() {
  if (audio) {
    audio.pause();
    // 显式移除所有监听器
    if (boundTimeUpdateHandler) {
      audio.removeEventListener('timeupdate', boundTimeUpdateHandler);
      boundTimeUpdateHandler = null;
    }
    audio.src = ''; // 停止任何网络请求
    audio = null;
  }
  if (audioPlayerContainer) {
    audioPlayerContainer.remove();
    audioPlayerContainer = null;
  }
  if (boundClickHandler) {
    document.body.removeEventListener('click', boundClickHandler);
    boundClickHandler = null;
  }
  currentHighlightedElement = null;
  // 清空字幕数据，确保下次加载是干净的
  subtitleData = []; 
}

/**
 * 初始化音频播放器.
 * @param {string} audioSrc - 音频文件路径.
 * @param {Array<Object>} initialSubtitleData - 已解析的字幕数据.
 */
export function initAudioPlayer({ audioSrc, initialSubtitleData }) {
  cleanupOldPlayer(); // 每次初始化时，先彻底清理旧实例，防止事件重复绑定和资源泄露

  if (!audioSrc || typeof audioSrc !== 'string') {
    console.error("音频文件路径无效。播放器无法初始化。");
    return;
  }

  if (!initialSubtitleData || !Array.isArray(initialSubtitleData) || initialSubtitleData.length === 0) {
    console.warn("没有提供有效的字幕数据，播放器将无法同步字幕。");
    // 即使没有字幕，如果音频源有效，仍然可以初始化播放器
    subtitleData = []; 
  } else {
    subtitleData = initialSubtitleData;
  }

  // 创建播放器容器和播放器
  audioPlayerContainer = document.createElement('div');
  audioPlayerContainer.id = 'audio-player-container';
  Object.assign(audioPlayerContainer.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    width: '100%',
    padding: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    boxSizing: 'border-box',
    zIndex: '10000',
    boxShadow: '0 -2px 10px rgba(0,0,0,0.5)'
  });

  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'width: 100%; display: block;',
  });
  
  audioPlayerContainer.appendChild(audio);
  document.body.appendChild(audioPlayerContainer);

  // 绑定事件
  // 将事件处理器绑定到变量，以便之后可以正确移除它们
  boundTimeUpdateHandler = handleTimeUpdate;
  audio.addEventListener('timeupdate', boundTimeUpdateHandler);
  
  boundClickHandler = (e) => handleSubtitleClick(e);
  document.body.addEventListener('click', boundClickHandler);

  console.log('音频播放器已初始化。');
}

/**
 * 使用二分查找法，高效地找到当前时间点对应的字幕索引。
 * 假设 subtitleData 已经按 sub.start 时间排序。
 * @param {number} time - 当前音频时间.
 * @param {Array<Object>} subtitles - 已排序的字幕数据.
 * @returns {number} - 找到的字幕索引，如果没有找到则返回 -1.
 */
function findSubtitleIndex(time, subtitles) {
  let low = 0;
  let high = subtitles.length - 1;
  let resultIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sub = subtitles[mid];

    // 如果当前时间大于或等于字幕开始时间
    if (time >= sub.start) {
      resultIndex = mid; // 这是一个可能的匹配
      low = mid + 1;     // 尝试在右半部分找更晚的字幕
    } else {
      high = mid - 1;    // 在左半部分找更早的字幕
    }
  }
  return resultIndex; // 返回最接近当前时间的字幕索引（其开始时间小于等于当前时间）
}

/**
 * 处理音频播放时间更新，高亮当前字幕.
 */
function handleTimeUpdate() {
  if (!audio || subtitleData.length === 0) return; // 如果没有字幕数据，则不执行高亮逻辑

  const currentTime = audio.currentTime;
  
  // 使用二分查找找到当前字幕的索引
  const activeSubtitleIndex = findSubtitleIndex(currentTime, subtitleData);
  const activeSubtitle = activeSubtitleIndex !== -1 ? subtitleData[activeSubtitleIndex] : null;

  const activeId = activeSubtitle ? String(activeSubtitle.id) : null;
  const highlightedId = currentHighlightedElement ? currentHighlightedElement.dataset.subtitleId : null;

  // 只有当需要高亮的字幕与当前已高亮的字幕不同时，才执行操作
  if (activeId !== highlightedId) {
    clearHighlight(); // 清除旧的高亮

    if (activeId) {
      const elementToHighlight = document.querySelector(`.subtitle-segment[data-subtitle-id="${activeId}"]`);
      if (elementToHighlight) {
        elementToHighlight.classList.add('highlighted-subtitle');
        currentHighlightedElement = elementToHighlight;
        
        // 确保每次高亮变化都居中滚动，提供最佳用户体验
        requestAnimationFrame(() => {
            currentHighlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }
  }
}

/**
 * 处理对预标记字幕的点击，实现音频跳转和页面滚动.
 */
function handleSubtitleClick(e) {
  const target = e.target.closest('.subtitle-segment');
  if (target && target.dataset.subtitleId && audio) {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡到 document.body 的其他监听器

    const subtitleId = parseInt(target.dataset.subtitleId, 10);
    const subtitle = subtitleData.find(s => s.id === subtitleId); // 这里依然是线性查找，因为点击是偶发事件，性能影响不大
    
    if (subtitle) {
        audio.currentTime = subtitle.start;
        // 如果音频是暂停状态，点击字幕后自动播放
        if (audio.paused) {
          audio.play();
        }

        // 立即手动触发一次高亮和滚动，提供即时反馈
        // 即使音频的 timeupdate 事件会很快更新状态，这样做能改善用户体验
        clearHighlight();
        target.classList.add('highlighted-subtitle');
        currentHighlightedElement = target;
        requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }
  }
}

/**
 * 清除当前的高亮.
 */
function clearHighlight() {
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('highlighted-subtitle');
    currentHighlightedElement = null;
  }
}
