// js/audio/audioPlayer.js (已修正所有已知问题)

let audio;
let subtitleData = [];
let currentHighlightedElement = null; // 用于跟踪当前高亮元素的变量
let audioPlayerContainer = null; // 播放器容器的引用
let boundClickHandler = null; // 用于存储绑定的点击事件处理器

/**
 * 彻底清理旧的播放器实例和事件监听器
 */
function cleanupOldPlayer() {
  if (audio) {
    audio.pause();
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
}

/**
 * 初始化音频播放器.
 * @param {string} audioSrc - 音频文件路径.
 * @param {Array<Object>} initialSubtitleData - 已解析的字幕数据.
 */
export function initAudioPlayer({ audioSrc, initialSubtitleData }) {
  cleanupOldPlayer(); // 修正 #4: 每次初始化时，先彻底清理旧实例，防止事件重复绑定

  if (!initialSubtitleData || initialSubtitleData.length === 0) {
    console.warn("没有提供字幕数据，播放器无法初始化。");
    return;
  }
  subtitleData = initialSubtitleData;

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
  audio.addEventListener('timeupdate', handleTimeUpdate);
  
  // 将事件处理器绑定到变量，以便之后可以正确移除它
  boundClickHandler = (e) => handleSubtitleClick(e);
  document.body.addEventListener('click', boundClickHandler);

  console.log('音频播放器已初始化。');
}

/**
 * 处理音频播放时间更新，高亮当前字幕.
 */
function handleTimeUpdate() {
  if (!audio) return;
  const currentTime = audio.currentTime;
  
  const activeSubtitle = subtitleData.find(
    (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
  );

  const activeId = activeSubtitle ? String(activeSubtitle.id) : null;
  const highlightedId = currentHighlightedElement ? currentHighlightedElement.dataset.subtitleId : null;

  // 修正 #1: 只有当需要高亮的字幕与当前已高亮的字幕不同时，才执行操作
  if (activeId !== highlightedId) {
    clearHighlight(); // 清除旧的高亮

    if (activeId) {
      const elementToHighlight = document.querySelector(`.subtitle-segment[data-subtitle-id="${activeId}"]`);
      if (elementToHighlight) {
        elementToHighlight.classList.add('highlighted-subtitle');
        currentHighlightedElement = elementToHighlight;
        
        // 修正 #3: 移除滚动条件，确保每次高亮变化都居中滚动
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
    e.stopPropagation();

    const subtitleId = parseInt(target.dataset.subtitleId, 10);
    const subtitle = subtitleData.find(s => s.id === subtitleId);
    
    // 修正 #2: 实现点击跳转和滚动
    if (subtitle) {
        audio.currentTime = subtitle.start;
        if (audio.paused) {
          audio.play();
        }

        // 立即手动触发一次高亮和滚动，提供即时反馈
        // 即使音频很快会通过 timeupdate 更新，这样做用户体验更好
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
