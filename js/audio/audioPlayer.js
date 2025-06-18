// js/audio/audioPlayer.js (最终优化版本 - 提高查找效率，确保事件清理)

import { extractVideoId, ensureJsApi } from './utils.js'; // <-- 更改了导入路径

let audio;
let subtitleData = [];
let currentHighlightedElement = null; 
let audioPlayerContainer = null; 

let boundTimeUpdateHandler = null; 
let boundClickHandler = null; 

function cleanupOldPlayer() {
  if (audio) {
    audio.pause();
    if (boundTimeUpdateHandler) {
      audio.removeEventListener('timeupdate', boundTimeUpdateHandler);
      boundTimeUpdateHandler = null;
    }
    audio.src = ''; 
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
  subtitleData = []; 
}

export function initAudioPlayer({ audioSrc, initialSubtitleData }) {
  cleanupOldPlayer(); 

  if (!audioSrc || typeof audioSrc !== 'string') {
    console.error("音频文件路径无效。播放器无法初始化。");
    return;
  }

  if (!initialSubtitleData || !Array.isArray(initialSubtitleData) || initialSubtitleData.length === 0) {
    console.warn("没有提供有效的字幕数据，播放器将无法同步字幕。");
    subtitleData = []; 
  } else {
    subtitleData = initialSubtitleData;
  }

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

  boundTimeUpdateHandler = handleTimeUpdate;
  audio.addEventListener('timeupdate', boundTimeUpdateHandler);
  
  boundClickHandler = (e) => handleSubtitleClick(e);
  document.body.addEventListener('click', boundClickHandler);

  console.log('音频播放器已初始化。');
}

function findSubtitleIndex(time, subtitles) {
  let low = 0;
  let high = subtitles.length - 1;
  let resultIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const sub = subtitles[mid];

    if (time >= sub.start) {
      resultIndex = mid; 
      low = mid + 1;     
    } else {
      high = mid - 1;    
    }
  }
  return resultIndex; 
}

function handleTimeUpdate() {
  if (!audio || subtitleData.length === 0) return; 

  const currentTime = audio.currentTime;
  
  const activeSubtitleIndex = findSubtitleIndex(currentTime, subtitleData);
  const activeSubtitle = activeSubtitleIndex !== -1 ? subtitleData[activeSubtitleIndex] : null;

  const activeId = activeSubtitle ? String(activeSubtitle.id) : null;
  const highlightedId = currentHighlightedElement ? currentHighlightedElement.dataset.subtitleId : null;

  if (activeId !== highlightedId) {
    clearHighlight(); 

    if (activeId) {
      const elementToHighlight = document.querySelector(`.subtitle-segment[data-subtitle-id="${activeId}"]`);
      if (elementToHighlight) {
        elementToHighlight.classList.add('highlighted-subtitle');
        currentHighlightedElement = elementToHighlight;
        
        requestAnimationFrame(() => {
            currentHighlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      }
    }
  }
}

function handleSubtitleClick(e) {
  const target = e.target.closest('.subtitle-segment');
  if (target && target.dataset.subtitleId && audio) {
    e.preventDefault();
    e.stopPropagation();

    const subtitleId = parseInt(target.dataset.subtitleId, 10);
    const subtitle = subtitleData.find(s => s.id === subtitleId); 
    
    if (subtitle) {
        audio.currentTime = subtitle.start;
        if (audio.paused) {
          audio.play();
        }

        clearHighlight();
        target.classList.add('highlighted-subtitle');
        currentHighlightedElement = target;
        requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }
  }
}

function clearHighlight() {
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('highlighted-subtitle');
    currentHighlightedElement = null;
  }
}
