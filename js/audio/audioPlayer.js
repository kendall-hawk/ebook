// js/audio/audioPlayer.js

import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js'; // 保留此导入，尽管在本文件中不直接用于 DOM 词分

let audio; // 音频元素实例
let subtitleData = []; // SRT 字幕数据
let currentSentenceIndex = -1; // 当前高亮句子索引
let currentHighlightAnimationFrameId = null; // requestAnimationFrame 的 ID
let currentSentenceElement = null; // 当前句子的 DOM 元素

function parseTimeToSeconds(timeString) {
  const parts = timeString.split(/[:,]/);
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(parts[2], 10);
  const milliseconds = parseInt(parts[3], 10);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  if (!audio) {
    audio = document.createElement('audio');
    audio.controls = true;
    audio.id = 'myAudioPlayer';
    audio.style.width = '90%';
    audio.style.maxWidth = '600px';
    audio.style.display = 'none';
    document.body.appendChild(audio);

    document.body.addEventListener('click', handleWordClick);
    audio.addEventListener('timeupdate', handleAudioTimeUpdate);
    audio.addEventListener('pause', clearHighlights);
    audio.addEventListener('ended', clearHighlights);
    audio.addEventListener('seeking', clearHighlights);
  }

  audio.src = audioSrc;
  audio.load();

  try {
    const res = await fetch(srtSrc);
    if (!res.ok) throw new Error(`Failed to load SRT: ${res.statusText}`);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText).map(entry => ({
      ...entry,
      start: typeof entry.start === 'string' ? parseTimeToSeconds(entry.start) : entry.start,
      end: typeof entry.end === 'string' ? parseTimeToSeconds(entry.end) : entry.end
    }));
  } catch (err) {
    console.error('SRT 字幕加载或解析失败:', err);
    subtitleData = [];
  }

  audio.oncanplaythrough = () => {
    handleAudioTimeUpdate();
    audio.oncanplaythrough = null;
  };
}

export function showAudioPlayer() {
  if (audio) audio.style.display = 'block';
}

export function hideAudioPlayer() {
  if (audio) {
    audio.style.display = 'none';
    audio.pause();
    clearHighlights();
  }
}

function handleAudioTimeUpdate() {
  const currentTime = audio.currentTime;
  let newSentenceIndex = -1;

  for (let i = 0; i < subtitleData.length; i++) {
    const { start, end } = subtitleData[i];
    if (currentTime >= start && currentTime < end) {
      newSentenceIndex = i;
      break;
    }
  }

  if (newSentenceIndex === currentSentenceIndex && currentSentenceElement) {
    highlightWordsInSentence(
      currentSentenceElement,
      subtitleData[currentSentenceIndex].start,
      subtitleData[currentSentenceIndex].end,
      audio
    );
    return;
  }

  clearHighlights();

  if (newSentenceIndex !== -1) {
    currentSentenceIndex = newSentenceIndex;
    const sentenceEl = document.querySelector(`.sentence[data-sub-index="${currentSentenceIndex}"]`);

    if (sentenceEl) {
      currentSentenceElement = sentenceEl;
      sentenceEl.classList.add('active-sentence');
      sentenceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      highlightWordsInSentence(
        sentenceEl,
        subtitleData[currentSentenceIndex].start,
        subtitleData[currentSentenceIndex].end,
        audio
      );
    }
  } else {
    currentSentenceIndex = -1;
  }
}

function clearHighlights() {
  if (currentHighlightAnimationFrameId) {
    cancelAnimationFrame(currentHighlightAnimationFrameId);
    currentHighlightAnimationFrameId = null;
  }

  if (currentSentenceElement) {
    currentSentenceElement.querySelectorAll('.word.highlight').forEach(w => w.classList.remove('highlight'));
  } else {
    document.querySelectorAll('.word.highlight').forEach(w => w.classList.remove('highlight'));
  }

  document.querySelectorAll('.sentence.active-sentence').forEach(el => el.classList.remove('active-sentence'));
  currentSentenceElement = null;
}

function handleWordClick(e) {
  const target = e.target;
  if (target && target.classList.contains('word')) {
    const parentSentence = target.closest('.sentence');
    if (parentSentence) {
      const subIndex = parseInt(parentSentence.dataset.subIndex, 10);
      const startTime = parseFloat(parentSentence.dataset.startTime);
      if (!isNaN(startTime) && subtitleData[subIndex]) {
        audio.currentTime = startTime;
        audio.play();
        handleAudioTimeUpdate();
      }
    }
  }
}

function highlightWordsInSentence(sentenceEl, sentenceStartTime, sentenceEndTime, audioEl) {
  sentenceEl.querySelectorAll('.word.highlight').forEach(w => w.classList.remove('highlight'));

  const words = Array.from(sentenceEl.querySelectorAll('.word'));
  const totalDuration = sentenceEndTime - sentenceStartTime;
  if (words.length === 0 || totalDuration <= 0) return;

  let totalChars = 0;
  const wordLengths = words.map(wordEl => {
    const cleanText = wordEl.textContent.trim().replace(/[^a-zA-Z0-9'-]/g, '');
    totalChars += cleanText.length;
    return cleanText.length;
  });

  let wordStartTimes = [];

  if (totalChars === 0) {
    const avg = Math.max(0.05, totalDuration / words.length);
    let t = sentenceStartTime;
    for (let i = 0; i < words.length; i++) {
      wordStartTimes.push(t);
      t += avg;
    }
    wordStartTimes.push(sentenceEndTime);
  } else {
    let t = sentenceStartTime;
    for (let i = 0; i < words.length; i++) {
      wordStartTimes.push(t);
      const duration = (wordLengths[i] / totalChars) * totalDuration;
      t += duration;
    }
    wordStartTimes.push(sentenceEndTime);
  }

  let currentWordIndex = -1;

  const animate = () => {
    const currentTime = audioEl.currentTime;

    if (!audioEl || audioEl.paused || audioEl.ended || currentTime < sentenceStartTime || currentTime >= sentenceEndTime) {
      clearHighlights();
      return;
    }

    let nextIndex = -1;
    for (let i = 0; i < wordStartTimes.length - 1; i++) {
      if (currentTime >= wordStartTimes[i] && currentTime < wordStartTimes[i + 1]) {
        nextIndex = i;
        break;
      }
    }

    if (nextIndex !== -1 && nextIndex !== currentWordIndex) {
      if (currentWordIndex !== -1) {
        words[currentWordIndex].classList.remove('highlight');
      }
      words[nextIndex].classList.add('highlight');
      currentWordIndex = nextIndex;
    }

    currentHighlightAnimationFrameId = requestAnimationFrame(animate);
  };

  animate();
}