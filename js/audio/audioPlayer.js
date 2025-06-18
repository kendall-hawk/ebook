import { parseSRT, tokenizeText } from '../utils.js';

let audio;
let subtitleData = [];
let currentHighlightedElement = null;
let audioPlayerContainer = null;
let boundClickHandler = null;
let wordToSubtitleMap = new Map();

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  cleanup();

  // 创建音频元素
  audio = document.createElement('audio');
  audio.src = audioSrc;
  audio.controls = true;
  audio.preload = 'metadata';

  audioPlayerContainer = document.getElementById('audio-player');
  if (audioPlayerContainer) {
    audioPlayerContainer.innerHTML = '';
    audioPlayerContainer.appendChild(audio);
  }

  const srtText = await fetch(srtSrc).then(res => res.text());
  subtitleData = parseSRT(srtText);

  buildWordToSubtitleMap();
  bindWordClickEvents();
  bindSubtitleSegmentClicks();

  audio.addEventListener('timeupdate', handleTimeUpdate);
}

// 🧹 清除旧状态
function cleanup() {
  if (audio) {
    audio.pause();
    audio.removeEventListener('timeupdate', handleTimeUpdate);
    audio = null;
  }

  if (audioPlayerContainer) {
    audioPlayerContainer.innerHTML = '';
  }

  if (boundClickHandler) {
    document.removeEventListener('click', boundClickHandler);
    boundClickHandler = null;
  }

  currentHighlightedElement = null;
  subtitleData = [];
  wordToSubtitleMap.clear();
}

// 🔄 构建 word → subtitle index 的倒排索引
function buildWordToSubtitleMap() {
  subtitleData.forEach((entry, index) => {
    const words = tokenizeText(entry.text.toLowerCase());
    for (const { word } of words) {
      if (!wordToSubtitleMap.has(word)) {
        wordToSubtitleMap.set(word, new Set());
      }
      wordToSubtitleMap.get(word).add(index);
    }
  });
}

// 🔗 给 .word 元素绑定点击事件
function bindWordClickEvents() {
  boundClickHandler = function (e) {
    const wordEl = e.target.closest('.word');
    if (wordEl) {
      const word = wordEl.textContent.trim().toLowerCase();
      const bestIndex = findBestMatchingSubtitleIndex(word);
      if (bestIndex !== -1) {
        const subtitle = subtitleData[bestIndex];
        audio.currentTime = subtitle.start;
        audio.play();
        highlightSubtitleElement(subtitle.id);
      }
    }
  };
  document.addEventListener('click', boundClickHandler);
}

// ⏯ 播放过程中字幕高亮
function handleTimeUpdate() {
  const currentTime = audio.currentTime;
  for (const subtitle of subtitleData) {
    if (currentTime >= subtitle.start && currentTime < subtitle.end) {
      highlightSubtitleElement(subtitle.id);
      break;
    }
  }
}

// 💡 模糊查找最接近的字幕 index
function findBestMatchingSubtitleIndex(word) {
  const candidateIndexes = wordToSubtitleMap.get(word) || new Set();

  let bestIndex = -1;
  let bestScore = Infinity;

  for (const index of candidateIndexes) {
    const subtitle = subtitleData[index];
    const wordsInSubtitle = tokenizeText(subtitle.text.toLowerCase()).map(w => w.word);

    for (const w of wordsInSubtitle) {
      const distance = levenshteinDistance(word, w);
      if (distance < bestScore) {
        bestScore = distance;
        bestIndex = index;
        if (distance === 0) return bestIndex; // 完全匹配直接返回
      }
    }
  }

  return bestIndex;
}

// 🖍 高亮字幕段 + 同步高亮其中的 .word
function highlightSubtitleElement(subtitleId) {
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('active');
    currentHighlightedElement.querySelectorAll('.word').forEach(w => w.classList.remove('active'));
  }

  const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${subtitleId}"]`);
  if (el) {
    el.classList.add('active');
    el.querySelectorAll('.word').forEach(w => w.classList.add('active'));

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    currentHighlightedElement = el;
  }
}

// 🖱 支持点击字幕段跳转音频
function bindSubtitleSegmentClicks() {
  document.querySelectorAll('.subtitle-segment').forEach(el => {
    el.addEventListener('click', () => {
      const subtitleId = parseInt(el.dataset.subtitleId, 10);
      const subtitle = subtitleData.find(s => s.id === subtitleId);
      if (subtitle) {
        audio.currentTime = subtitle.start;
        audio.play();
        highlightSubtitleElement(subtitle.id);
      }
    });
  });
}

// 🔠 Levenshtein 距离，用于容错匹配
function levenshteinDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // 删除
          dp[i][j - 1] + 1,    // 插入
          dp[i - 1][j - 1] + 1 // 替换
        );
      }
    }
  }

  return dp[a.length][b.length];
}