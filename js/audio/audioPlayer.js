// js/audio/audioPlayer.js (重构后 - 简洁高效版)

let audio, subtitleData = [];
let currentHighlight = null;

/**
 * 初始化音频播放器.
 * @param {string} audioSrc - 音频文件路径.
 * @param {Array<Object>} initialSubtitleData - 已解析的字幕数据.
 */
export function initAudioPlayer({ audioSrc, initialSubtitleData }) {
  // 移除旧的播放器和事件监听器
  const existingContainer = document.getElementById('audio-player-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  document.body.removeEventListener('click', handleSubtitleClick);

  if (!initialSubtitleData || initialSubtitleData.length === 0) {
    console.warn("没有提供字幕数据，播放器无法初始化。");
    return;
  }
  subtitleData = initialSubtitleData;

  // 创建播放器容器
  const container = document.createElement('div');
  container.id = 'audio-player-container';
  Object.assign(container.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    width: '100%',
    padding: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    boxSizing: 'border-box',
    zIndex: '10000'
  });

  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'width: 100%; display: block;',
  });
  
  container.appendChild(audio);
  document.body.appendChild(container);

  // 绑定事件
  audio.addEventListener('timeupdate', handleTimeUpdate);
  document.body.addEventListener('click', handleSubtitleClick);

  console.log('音频播放器已初始化。');
}

/**
 * 处理音频播放时间更新，高亮当前字幕.
 */
function handleTimeUpdate() {
  const currentTime = audio.currentTime;
  // 使用二分查找优化性能，但对于典型长度的SRT，线性查找也足够快
  const currentIndex = subtitleData.findIndex(
    (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
  );

  if (currentIndex !== -1) {
    const activeSubtitle = subtitleData[currentIndex];
    // 如果当前高亮不是应该高亮的，则更新高亮
    if (!currentHighlight || currentHighlight.dataset.subtitleId !== String(activeSubtitle.id)) {
      clearHighlight(); // 清除旧的高亮

      const elementToHighlight = document.querySelector(`.subtitle-segment[data-subtitle-id="${activeSubtitle.id}"]`);
      if (elementToHighlight) {
        elementToHighlight.classList.add('highlighted-subtitle');
        currentHighlight = elementToHighlight;
        
        // 只有当元素在视口之外时才滚动
        const rect = elementToHighlight.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
             elementToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  } else {
    clearHighlight(); // 如果当前时间没有对应字幕，清除所有高亮
  }
}

/**
 * 处理对预标记字幕的点击，实现音频跳转.
 */
function handleSubtitleClick(e) {
    const target = e.target.closest('.subtitle-segment');
    if (target && target.dataset.subtitleId) {
        const subtitleId = parseInt(target.dataset.subtitleId, 10);
        const subtitle = subtitleData.find(s => s.id === subtitleId);
        if (subtitle) {
            audio.currentTime = subtitle.start;
            if (audio.paused) {
              audio.play();
            }
        }
    }
}

/**
 * 清除当前的高亮.
 */
function clearHighlight() {
  if (currentHighlight) {
    currentHighlight.classList.remove('highlighted-subtitle');
    currentHighlight = null;
  }
}
