// js/audio/audioPlayer.js (重构版 - 修正导入路径和事件绑定策略)

// 修正：根据文件结构，导入路径改为 '../utils.js'
import { parseSRT, tokenizeText } from './utils.js';

let audio;
let subtitleData = [];
let currentHighlightedElement = null;
let audioPlayerContainer = null;
let boundClickHandler = null;
let wordToSubtitleMap = new Map();

/**
 * 初始化音频播放器.
 * @param {string} audioSrc - 音频文件路径.
 * @param {string} srtSrc - SRT 字幕文件路径.
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  cleanup(); // 每次初始化时，先彻底清理旧实例，防止事件重复绑定和资源泄露

  if (!audioSrc || typeof audioSrc !== 'string') {
    console.error("音频文件路径无效。播放器无法初始化。");
    return;
  }

  // 1. 获取并设置音频元素
  audio = document.createElement('audio');
  audio.src = audioSrc;
  audio.controls = true;
  audio.preload = 'metadata';

  audioPlayerContainer = document.getElementById('audio-player');
  if (!audioPlayerContainer) {
    audioPlayerContainer = document.createElement('div');
    audioPlayerContainer.id = 'audio-player';
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
    document.body.appendChild(audioPlayerContainer);
  } else {
    audioPlayerContainer.innerHTML = ''; // 清空现有内容，确保干净
  }
  audioPlayerContainer.appendChild(audio);

  // 2. 获取并解析 SRT 字幕数据
  if (srtSrc && typeof srtSrc === 'string') {
    try {
      const srtRes = await fetch(srtSrc);
      if (!srtRes.ok) {
        throw new Error(`Failed to load SRT file: ${srtRes.statusText}`);
      }
      const srtText = await srtRes.text();
      subtitleData = parseSRT(srtText);
      console.log('SRT 字幕数据加载并解析完成。');
    } catch (err) {
      console.warn('SRT 文件加载或解析失败:', err);
      subtitleData = [];
    }
  } else {
    console.warn("没有提供有效的 SRT 文件路径，播放器将无法同步字幕。");
    subtitleData = [];
  }

  // 3. 构建单词到字幕的映射
  if (subtitleData.length > 0) {
    buildWordToSubtitleMap();
  } else {
    wordToSubtitleMap.clear();
  }

  // 4. 绑定事件监听器
  bindWordClickEvents(); // 绑定文档上的 .word 元素点击事件
  bindSubtitleSegmentClicks(); // 绑定字幕段点击事件 (在 chapterRenderer 渲染后调用 initAudioPlayer，此时元素应已存在)
  audio.addEventListener('timeupdate', handleTimeUpdate);

  console.log('音频播放器已初始化。');
}

/**
 * 彻底清理旧的播放器实例和事件监听器.
 */
function cleanup() {
  if (audio) {
    audio.pause();
    audio.removeEventListener('timeupdate', handleTimeUpdate);
    audio = null;
  }

  if (audioPlayerContainer) {
    audioPlayerContainer.innerHTML = '';
    // 如果 audioPlayerContainer 是动态添加到 body 的，在这里可以移除它
    // if (audioPlayerContainer.parentNode && audioPlayerContainer.id === 'audio-player') {
    //   audioPlayerContainer.parentNode.removeChild(audioPlayerContainer);
    // }
    // audioPlayerContainer = null;
  }

  // 移除 document 上的全局点击监听器
  if (boundClickHandler) {
    document.removeEventListener('click', boundClickHandler);
    boundClickHandler = null;
  }

  currentHighlightedElement = null;
  subtitleData = [];
  wordToSubtitleMap.clear();
  document.querySelectorAll('.subtitle-segment.active, .word.active').forEach(el => {
    el.classList.remove('active');
  });
}

/**
 * 构建 word → subtitle index 的倒排索引。
 * 遍历所有字幕条目，使用 tokenizeText 分词，并记录每个词出现在哪些字幕的索引中。
 */
function buildWordToSubtitleMap() {
  wordToSubtitleMap.clear();
  subtitleData.forEach((entry, index) => {
    const words = tokenizeText(entry.text.toLowerCase());
    for (const { word } of words) {
      if (word.length > 0 && /\p{L}/u.test(word)) {
        if (!wordToSubtitleMap.has(word)) {
          wordToSubtitleMap.set(word, new Set());
        }
        wordToSubtitleMap.get(word).add(index);
      }
    }
  });
}

/**
 * 给 .word 元素绑定点击事件。
 * 这是一个全局事件委托，效率更高。
 * 绑定到 document 而非特定章节容器，确保新渲染的章节中的 .word 也能响应。
 */
function bindWordClickEvents() {
  if (boundClickHandler) {
    document.removeEventListener('click', boundClickHandler);
  }
  boundClickHandler = function (e) {
    const wordEl = e.target.closest('.word');
    if (wordEl) {
      e.stopPropagation();
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


/**
 * 播放过程中，根据音频时间更新字幕高亮。
 * 使用二分查找提高效率。
 */
function handleTimeUpdate() {
  if (!audio || subtitleData.length === 0) return;

  const currentTime = audio.currentTime;
  let low = 0;
  let high = subtitleData.length - 1;
  let activeSubtitleId = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const subtitle = subtitleData[mid];

    if (currentTime >= subtitle.start && currentTime < subtitle.end) {
      activeSubtitleId = subtitle.id;
      break;
    } else if (currentTime < subtitle.start) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  if (currentHighlightedElement && String(activeSubtitleId) === currentHighlightedElement.dataset.subtitleId) {
    return;
  }

  highlightSubtitleElement(activeSubtitleId);
}


/**
 * 模糊查找给定单词最匹配的字幕索引。
 * 首先查找完全匹配的，如果找到则直接返回。
 * 如果没有完全匹配的，则基于 Levenshtein 距离找到最佳（最小距离）匹配。
 * @param {string} word - 要查找的单词。
 * @returns {number} - 最佳匹配的字幕索引，如果没有找到则返回 -1。
 */
function findBestMatchingSubtitleIndex(word) {
  const candidateIndexes = wordToSubtitleMap.get(word) || new Set();

  let bestIndex = -1;
  let bestScore = Infinity;

  // 优先查找完全匹配的字幕
  for (const index of candidateIndexes) {
    const subtitle = subtitleData[index];
    const wordsInSubtitle = tokenizeText(subtitle.text.toLowerCase()).map(w => w.word);
    if (wordsInSubtitle.includes(word)) {
      return index;
    }
  }

  // 如果没有完全匹配，则进行模糊匹配
  if (candidateIndexes.size > 0) {
    for (const index of candidateIndexes) {
      const subtitle = subtitleData[index];
      const wordsInSubtitle = tokenizeText(subtitle.text.toLowerCase()).map(w => w.word);

      for (const w of wordsInSubtitle) {
        const distance = levenshteinDistance(word, w);
        if (distance < bestScore) {
          bestScore = distance;
          bestIndex = index;
        }
      }
    }
  }

  if (bestIndex !== -1 && bestScore > Math.floor(word.length / 2) + 1) {
      return -1;
  }

  return bestIndex;
}


/**
 * 高亮指定 ID 的字幕段，并移除旧的高亮。
 * 同时高亮字幕段内的所有 `.word` 元素。
 * @param {number|string} subtitleId - 要高亮的字幕的 ID。
 */
function highlightSubtitleElement(subtitleId) {
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('active');
    currentHighlightedElement.querySelectorAll('.word').forEach(w => w.classList.remove('active'));
  }

  if (subtitleId === null) {
      currentHighlightedElement = null;
      return;
  }

  const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${subtitleId}"]`);
  if (el) {
    el.classList.add('active');
    el.querySelectorAll('.word').forEach(w => w.classList.add('active'));

    requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    currentHighlightedElement = el;
  } else {
    currentHighlightedElement = null;
  }
}

/**
 * 绑定字幕段的点击事件，使其点击时音频跳转到对应时间并播放。
 * 注意：由于 chapterRenderer 渲染时 `.subtitle-segment` 已存在，此处直接绑定。
 * 更优解是使用事件委托在 main.js 或 app.js 中绑定到 #chapters 容器。
 */
function bindSubtitleSegmentClicks() {
  document.querySelectorAll('.subtitle-segment').forEach(el => {
    if (!el._hasClickListener) { // 避免重复绑定
      el.addEventListener('click', () => {
        const subtitleId = parseInt(el.dataset.subtitleId, 10);
        const subtitle = subtitleData.find(s => s.id === subtitleId);
        if (subtitle) {
          audio.currentTime = subtitle.start;
          if (audio.paused) {
            audio.play();
          }
          highlightSubtitleElement(subtitle.id);
        }
      });
      el._hasClickListener = true;
    }
  });
}

/**
 * 计算两个字符串之间的 Levenshtein 距离。
 * @param {string} a - 第一个字符串。
 * @param {string} b - 第二个字符串。
 * @returns {number} - Levenshtein 距离。
 */
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
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }
  return dp[a.length][b.length];
}
