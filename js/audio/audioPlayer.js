/**
 * js/audio/audioPlayer.js
 * 负责音频播放、字幕同步高亮和点击跳转。
 */

import { parseSRT, tokenizeText } from '../utils.js'; // 修正导入路径

let audio;
let subtitleData = [];
let currentHighlightedElement = null; // 当前高亮的字幕段
let audioPlayerContainer = null;
let wordToSubtitleMap = new Map(); // 存储单词到字幕索引的映射

// 用于清理事件监听器的引用
const eventListeners = {};

/**
 * 初始化音频播放器。
 * 每次调用都会清理旧实例并重新绑定。
 * @param {Object} options - 配置对象。
 * @param {string} options.audioSrc - 音频文件路径。
 * @param {string} options.srtSrc - SRT 字幕文件路径。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  cleanupAudioPlayer(); // 每次初始化时，先彻底清理旧实例

  if (!audioSrc || typeof audioSrc !== 'string') {
    console.error("音频文件路径无效。播放器无法初始化。");
    return;
  }

  // 1. 设置或创建音频播放器容器
  audioPlayerContainer = document.getElementById('audio-player');
  if (!audioPlayerContainer) {
    audioPlayerContainer = document.createElement('div');
    audioPlayerContainer.id = 'audio-player';
    // 基础样式，确保其显示在页面底部
    Object.assign(audioPlayerContainer.style, {
      position: 'fixed',
      bottom: '0',
      left: '0',
      width: '100%',
      padding: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      boxSizing: 'border-box',
      zIndex: '10000',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    });
    document.body.appendChild(audioPlayerContainer);
  } else {
    audioPlayerContainer.innerHTML = ''; // 清空现有内容
    audioPlayerContainer.style.display = 'flex'; // 确保显示
  }

  // 2. 创建并添加音频元素
  audio = document.createElement('audio');
  audio.src = audioSrc;
  audio.controls = true; // 显示浏览器默认控件
  audio.preload = 'metadata'; // 预加载元数据，以便获取时长
  audio.style.width = '80%'; // 让音频控件宽度适中
  audioPlayerContainer.appendChild(audio);

  // 3. 获取并解析 SRT 字幕数据
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
      console.warn('SRT 文件加载或解析失败，播放器将无法同步字幕:', err);
      subtitleData = [];
    }
  } else {
    console.warn("没有提供有效的 SRT 文件路径，播放器将无法同步字幕。");
    subtitleData = [];
  }

  // 4. 构建单词到字幕的映射
  if (subtitleData.length > 0) {
    buildWordToSubtitleMap();
  } else {
    wordToSubtitleMap.clear();
  }

  // 5. 绑定事件监听器
  // 使用具名函数引用，方便清理
  eventListeners.timeupdate = () => handleTimeUpdate();
  audio.addEventListener('timeupdate', eventListeners.timeupdate);

  // 在 #chapters 容器上使用事件委托，处理 .word 和 .subtitle-segment 点击
  const chaptersContainer = document.getElementById('chapters');
  if (chaptersContainer) {
    eventListeners.chapterClickDelegate = (e) => {
        const wordEl = e.target.closest('.word'); // 可能有 data-tooltip-id 或无
        const subtitleSegmentEl = e.target.closest('.subtitle-segment');

        if (wordEl && !e.target.closest('.subtitle-segment')) { // 避免双重处理，优先字幕段点击
            // 如果是普通的 .word 且不在 .subtitle-segment 内部，或者仅是 .word 
            e.stopPropagation();
            handleWordClick(wordEl);
        } else if (subtitleSegmentEl) {
            e.stopPropagation();
            handleSubtitleSegmentClick(subtitleSegmentEl);
        }
    };
    // 确保只添加一次事件监听器
    if (!chaptersContainer._hasAudioClickListener) {
        chaptersContainer.addEventListener('click', eventListeners.chapterClickDelegate);
        chaptersContainer._hasAudioClickListener = true;
    }
  } else {
      console.warn("Chapters container #chapters not found, word/subtitle segment clicks will not be enabled.");
  }


  console.log('音频播放器已初始化。');
}

/**
 * 彻底清理旧的播放器实例和事件监听器。
 */
export function cleanupAudioPlayer() {
  if (audio) {
    audio.pause();
    if (eventListeners.timeupdate) {
      audio.removeEventListener('timeupdate', eventListeners.timeupdate);
      delete eventListeners.timeupdate;
    }
    audio = null;
  }

  if (audioPlayerContainer) {
      // 检查是否是动态创建的，如果是则移除，否则只清空内容
      if (audioPlayerContainer.parentNode && audioPlayerContainer.id === 'audio-player') {
          audioPlayerContainer.innerHTML = '';
          audioPlayerContainer.style.display = 'none'; // 隐藏播放器
      }
  }

  const chaptersContainer = document.getElementById('chapters');
  if (chaptersContainer && eventListeners.chapterClickDelegate) {
    chaptersContainer.removeEventListener('click', eventListeners.chapterClickDelegate);
    delete eventListeners.chapterClickDelegate;
    chaptersContainer._hasAudioClickListener = false; // 重置标记
  }

  // 清理所有引用和高亮状态
  currentHighlightedElement = null;
  subtitleData = [];
  wordToSubtitleMap.clear();
  document.querySelectorAll('.subtitle-segment.active, .word.active').forEach(el => {
    el.classList.remove('active');
  });
}

/**
 * 处理 .word 元素的点击事件。
 * @param {HTMLElement} wordEl - 被点击的 .word 元素。
 */
function handleWordClick(wordEl) {
  const word = wordEl.textContent.trim().toLowerCase();
  const bestIndex = findBestMatchingSubtitleIndex(word);
  if (bestIndex !== -1) {
    const subtitle = subtitleData[bestIndex];
    if (audio) {
      audio.currentTime = subtitle.start;
      audio.play();
    }
    highlightSubtitleElement(subtitle.id);
  } else {
      console.log(`没有找到与单词 "${word}" 匹配的字幕。`);
  }
}

/**
 * 处理 .subtitle-segment 元素的点击事件。
 * @param {HTMLElement} subtitleSegmentEl - 被点击的 .subtitle-segment 元素。
 */
function handleSubtitleSegmentClick(subtitleSegmentEl) {
  const subtitleId = parseInt(subtitleSegmentEl.dataset.subtitleId, 10);
  const subtitle = subtitleData.find(s => s.id === subtitleId);
  if (subtitle && audio) {
    audio.currentTime = subtitle.start;
    if (audio.paused) {
      audio.play();
    }
    highlightSubtitleElement(subtitle.id);
  }
}


/**
 * 构建 word → subtitle index 的倒排索引。
 * 遍历所有字幕条目，使用 tokenizeText 分词，并记录每个词出现在哪些字幕的索引中。
 */
function buildWordToSubtitleMap() {
  wordToSubtitleMap.clear();
  subtitleData.forEach((entry, index) => {
    // 对字幕文本进行分词，并转换为小写
    const words = tokenizeText(entry.text.toLowerCase());
    for (const { word } of words) {
      // 仅存储有实际内容的字母/数字词
      if (word.length > 0 && (/\p{L}/u.test(word) || /\p{N}/u.test(word))) {
        if (!wordToSubtitleMap.has(word)) {
          wordToSubtitleMap.set(word, new Set());
        }
        wordToSubtitleMap.get(word).add(index);
      }
    }
  });
}


/**
 * 播放过程中，根据音频时间更新字幕高亮。
 * 使用二分查找提高效率。
 */
function handleTimeUpdate() {
  if (!audio || subtitleData.length === 0) return;

  const currentTime = audio.currentTime;
  let activeSubtitleId = null;

  // 使用二分查找找到当前时间对应的字幕
  let low = 0;
  let high = subtitleData.length - 1;

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

  // 只有当高亮状态改变时才更新 DOM
  if (currentHighlightedElement && String(activeSubtitleId) === currentHighlightedElement.dataset.subtitleId) {
    return;
  }
  highlightSubtitleElement(activeSubtitleId);
}

/**
 * 模糊查找给定单词最匹配的字幕索引。
 * 优先查找完全匹配的，如果找到则直接返回。
 * 如果没有完全匹配的，则基于 Levenshtein 距离找到最佳（最小距离）匹配。
 * @param {string} word - 要查找的单词。
 * @returns {number} - 最佳匹配的字幕索引，如果没有找到则返回 -1。
 */
function findBestMatchingSubtitleIndex(word) {
  const candidateIndexes = wordToSubtitleMap.get(word);

  if (candidateIndexes) {
    // 优先查找完全匹配的字幕 (精确包含整个单词)
    for (const index of candidateIndexes) {
      const subtitle = subtitleData[index];
      // 使用更可靠的方式检查整个单词是否存在于字幕的 tokenize 结果中
      const subtitleWords = tokenizeText(subtitle.text.toLowerCase()).map(t => t.word);
      if (subtitleWords.includes(word)) {
        return index;
      }
    }

    // 如果没有完全匹配，进行模糊匹配
    let bestIndex = -1;
    let minDistance = Infinity;

    for (const index of candidateIndexes) {
      const subtitle = subtitleData[index];
      const wordsInSubtitle = tokenizeText(subtitle.text.toLowerCase()).map(t => t.word);

      for (const subWord of wordsInSubtitle) {
        const distance = levenshteinDistance(word, subWord);
        if (distance < minDistance) {
          minDistance = distance;
          bestIndex = index;
        }
      }
    }

    // 设定一个合理的模糊匹配阈值，避免匹配不相关的词
    // 例如，距离不应超过单词长度的一半，且至少为1（避免零距离匹配已处理）
    if (bestIndex !== -1 && minDistance > Math.floor(word.length * 0.3) + 1) { // 阈值调整
        return -1;
    }
    return bestIndex;

  } else {
    // 如果Map中没有这个词，进行更广泛的模糊搜索（效率较低，作为回退）
    let bestIndex = -1;
    let minDistance = Infinity;

    subtitleData.forEach((entry, index) => {
      const wordsInSubtitle = tokenizeText(entry.text.toLowerCase()).map(t => t.word);
      for (const subWord of wordsInSubtitle) {
        const distance = levenshteinDistance(word, subWord);
        if (distance < minDistance && distance <= Math.floor(word.length * 0.3) + 1) {
          minDistance = distance;
          bestIndex = index;
        }
      }
    });
    return bestIndex;
  }
}


/**
 * 高亮指定 ID 的字幕段，并移除旧的高亮。
 * 同时高亮字幕段内的所有 `.word` 元素。
 * @param {number|string|null} subtitleId - 要高亮的字幕的 ID (或 null/undefined 表示清除高亮)。
 */
function highlightSubtitleElement(subtitleId) {
  // 清除之前的高亮
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('active');
    currentHighlightedElement.querySelectorAll('.word').forEach(w => w.classList.remove('active'));
  }

  if (subtitleId === null || subtitleId === undefined) {
      currentHighlightedElement = null;
      return;
  }

  const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${subtitleId}"]`);
  if (el) {
    el.classList.add('active');
    // 高亮字幕段内的所有 .word 元素
    el.querySelectorAll('.word').forEach(w => w.classList.add('active'));

    // 确保高亮元素在可视区域内
    requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    currentHighlightedElement = el;
  } else {
    currentHighlightedElement = null;
  }
}

/**
 * 计算两个字符串之间的 Levenshtein 距离。
 * @param {string} a - 第一个字符串。
 * @param {string} b - 第二个字符串。
 * @returns {number} - Levenshtein 距离。
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // increment along the first column of each row
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // increment each column in the first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
