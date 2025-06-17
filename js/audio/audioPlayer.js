let audio, subtitleData = [];
let currentHighlight = null;

/**
 * 初始化音频播放器
 * @param {Object} options
 * @param {string} options.audioSrc - 音频文件路径
 * @param {Array<Object>} options.initialSubtitleData - 已解析字幕数组
 */
export function initAudioPlayer({ audioSrc, initialSubtitleData }) {
  // 清除旧播放器与事件
  const existingContainer = document.getElementById('audio-player-container');
  if (existingContainer) existingContainer.remove();

  subtitleData = initialSubtitleData || [];
  if (!subtitleData.length) {
    console.warn("未提供字幕数据，播放器未初始化。");
    return;
  }

  // 创建播放器 UI
  const container = document.createElement('div');
  container.id = 'audio-player-container';
  Object.assign(container.style, {
    position: 'fixed',
    bottom: '0',
    left: '0',
    width: '100%',
    padding: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    zIndex: '10000',
    boxSizing: 'border-box',
  });

  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'width: 100%',
  });

  container.appendChild(audio);
  document.body.appendChild(container);

  // 事件绑定
  audio.addEventListener('timeupdate', handleTimeUpdate);
  bindSubtitleClicks();
  bindWordClicks();

  console.log('音频播放器已初始化。');
}

/**
 * 播放时处理高亮
 */
function handleTimeUpdate() {
  const currentTime = audio.currentTime;

  const currentIndex = subtitleData.findIndex(
    (sub, i) =>
      currentTime >= sub.start &&
      (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
  );

  if (currentIndex !== -1) {
    const activeSub = subtitleData[currentIndex];
    if (!currentHighlight || currentHighlight.dataset.subtitleId !== String(activeSub.id)) {
      clearHighlight();
      const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${activeSub.id}"]`);
      if (el) {
        el.classList.add('highlighted-subtitle');
        currentHighlight = el;

        const rect = el.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  } else {
    clearHighlight();
  }
}

/**
 * 绑定对 .subtitle-segment 的点击事件
 */
function bindSubtitleClicks() {
  document.querySelectorAll('.subtitle-segment').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.subtitleId, 10);
      const sub = subtitleData.find(s => s.id === id);
      if (sub) {
        audio.currentTime = sub.start + 0.05;
        if (audio.paused) audio.play();
      }
    });
  });
}

/**
 * 绑定对 .word 的点击事件
 */
function bindWordClicks() {
  document.querySelectorAll('.word').forEach(wordEl => {
    wordEl.addEventListener('click', () => {
      const word = wordEl.textContent.trim().toLowerCase();

      // 查找包含该词的字幕（模糊匹配可优化）
      const matched = subtitleData.find(sub =>
        sub.text.toLowerCase().includes(word)
      );

      if (matched) {
        audio.currentTime = matched.start + 0.05;
        if (audio.paused) audio.play();

        // 手动高亮（等同于 handleTimeUpdate）
        clearHighlight();
        const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${matched.id}"]`);
        if (el) {
          el.classList.add('highlighted-subtitle');
          currentHighlight = el;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  });
}

/**
 * 清除当前字幕高亮
 */
function clearHighlight() {
  if (currentHighlight) {
    currentHighlight.classList.remove('highlighted-subtitle');
    currentHighlight = null;
  }
}