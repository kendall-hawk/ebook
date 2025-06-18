// js/audio/audioPlayer.js (新版本 - 包含单词点击跳转和模糊查找)

import { parseSRT, tokenizeText } from 'data/js/utils.js'; // 假设 utils.js 在同级目录或其父级目录

let audio;
let subtitleData = [];
let currentHighlightedElement = null; // 用于跟踪当前高亮元素的变量
let audioPlayerContainer = null; // 播放器容器的引用
let boundClickHandler = null; // 用于存储 document 上的点击事件处理器，以便正确移除
let wordToSubtitleMap = new Map(); // 新增：用于单词到字幕索引的映射

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
  audio.preload = 'metadata'; // 预加载元数据，以便能获取时长等信息

  // 假设 HTML 中有一个 id 为 'audio-player' 的 div 用于放置播放器
  audioPlayerContainer = document.getElementById('audio-player');
  if (!audioPlayerContainer) {
    // 如果没有预设的容器，则在 body 底部创建一个（与之前版本行为保持一致，或根据需要调整）
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
    // 清空现有内容，确保干净
    audioPlayerContainer.innerHTML = '';
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
      subtitleData = []; // 即使失败也清空，避免使用旧数据
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
  bindSubtitleSegmentClicks(); // 绑定字幕段点击事件 (注意：这需要字幕段已经渲染到 DOM 中)
  audio.addEventListener('timeupdate', handleTimeUpdate); // 绑定音频时间更新事件

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

  // 清理播放器容器
  if (audioPlayerContainer) {
    audioPlayerContainer.innerHTML = ''; // 清空容器内容
    // 注意：如果 audioPlayerContainer 是动态创建并附加到 body 的，
    // 您可能需要在这里移除它，例如：
    // if (audioPlayerContainer.parentNode) {
    //   audioPlayerContainer.parentNode.removeChild(audioPlayerContainer);
    // }
    // audioPlayerContainer = null; // 清除引用
  }

  // 移除 document 上的全局点击监听器
  if (boundClickHandler) {
    document.removeEventListener('click', boundClickHandler);
    boundClickHandler = null;
  }

  currentHighlightedElement = null;
  subtitleData = [];
  wordToSubtitleMap.clear(); // 清空映射
  // 确保移除所有 .subtitle-segment 和 .word 元素的 active 类
  document.querySelectorAll('.subtitle-segment.active, .word.active').forEach(el => {
    el.classList.remove('active');
  });
}

/**
 * 构建 word → subtitle index 的倒排索引。
 * 遍历所有字幕条目，使用 tokenizeText 分词，并记录每个词出现在哪些字幕的索引中。
 */
function buildWordToSubtitleMap() {
  wordToSubtitleMap.clear(); // 每次构建前清空
  subtitleData.forEach((entry, index) => {
    // 对字幕文本进行分词，并转为小写以便匹配
    const words = tokenizeText(entry.text.toLowerCase());
    for (const { word } of words) {
      // 排除纯标点或过短的词，或者根据需要调整过滤逻辑
      if (word.length > 0 && /\p{L}/u.test(word)) { // 确保是包含字母的词
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
 */
function bindWordClickEvents() {
  // 确保只绑定一次
  if (boundClickHandler) {
    document.removeEventListener('click', boundClickHandler);
  }
  boundClickHandler = function (e) {
    // 使用 closest() 查找最近的 .word 父元素
    const wordEl = e.target.closest('.word');
    if (wordEl) {
      e.stopPropagation(); // 阻止事件冒泡，避免干扰其他点击事件
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
  // 使用二分查找找到当前时间点最接近的字幕索引
  let low = 0;
  let high = subtitleData.length - 1;
  let activeSubtitleId = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const subtitle = subtitleData[mid];

    if (currentTime >= subtitle.start && currentTime < subtitle.end) {
      activeSubtitleId = subtitle.id;
      break; // 找到当前活动的字幕
    } else if (currentTime < subtitle.start) {
      high = mid - 1;
    } else { // currentTime >= subtitle.end
      low = mid + 1;
    }
  }

  // 避免不必要的 DOM 操作，只有在高亮字幕改变时才更新
  if (currentHighlightedElement && String(activeSubtitleId) === currentHighlightedElement.dataset.subtitleId) {
    return; // 已经是当前高亮，无需操作
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
  let bestScore = Infinity; // 存储最小的 Levenshtein 距离

  // 优先查找完全匹配的字幕
  for (const index of candidateIndexes) {
    const subtitle = subtitleData[index];
    const wordsInSubtitle = tokenizeText(subtitle.text.toLowerCase()).map(w => w.word);
    if (wordsInSubtitle.includes(word)) {
      return index; // 找到完全匹配，直接返回
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
  
  // 阈值：如果最佳匹配的距离过大，可能不是有效匹配
  // 例如，如果 Levenshtein 距离超过单词长度的一半，可以认为不是有效匹配
  if (bestIndex !== -1 && bestScore > Math.floor(word.length / 2) + 1) { 
      return -1; // 距离太大，视为无有效匹配
  }

  return bestIndex;
}


/**
 * 高亮指定 ID 的字幕段，并移除旧的高亮。
 * 同时高亮字幕段内的所有 `.word` 元素。
 * @param {number|string} subtitleId - 要高亮的字幕的 ID。
 */
function highlightSubtitleElement(subtitleId) {
  // 移除旧的高亮
  if (currentHighlightedElement) {
    currentHighlightedElement.classList.remove('active');
    // 移除旧高亮字幕段内所有 .word 的高亮
    currentHighlightedElement.querySelectorAll('.word').forEach(w => w.classList.remove('active'));
  }

  if (subtitleId === null) { // 如果没有需要高亮的字幕，则只清除高亮
      currentHighlightedElement = null;
      return;
  }

  // 查找新的高亮元素
  const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${subtitleId}"]`);
  if (el) {
    el.classList.add('active');
    // 高亮新字幕段内所有 .word
    el.querySelectorAll('.word').forEach(w => w.classList.add('active'));

    // 滚动到视图中心
    requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    
    currentHighlightedElement = el; // 更新当前高亮元素
  } else {
    currentHighlightedElement = null; // 如果找不到元素，确保引用为空
  }
}

/**
 * 绑定字幕段的点击事件，使其点击时音频跳转到对应时间并播放。
 * 注意：这个函数需要在字幕段被渲染到 DOM 后调用。
 * 在 chapterRenderer.js 渲染章节内容后，可以调用此函数来重新绑定事件。
 */
function bindSubtitleSegmentClicks() {
  // 由于章节内容可能会重新渲染，所以每次需要重新绑定。
  // 更好的做法是使用事件委托，绑定到共同的父元素上，但这里为了保持与当前结构一致，
  // 假设在渲染新章节后会调用此函数重新绑定。
  // 在 cleanup 中不需要显式移除这些监听器，因为它们绑定在被替换的 DOM 元素上。
  document.querySelectorAll('.subtitle-segment').forEach(el => {
    // 避免重复绑定，确保每个元素只绑定一次
    if (!el._hasClickListener) {
      el.addEventListener('click', () => {
        const subtitleId = parseInt(el.dataset.subtitleId, 10);
        const subtitle = subtitleData.find(s => s.id === subtitleId); // 线性查找，点击是偶发事件，影响不大
        if (subtitle) {
          audio.currentTime = subtitle.start;
          if (audio.paused) { // 如果音频暂停，点击字幕后自动播放
            audio.play();
          }
          highlightSubtitleElement(subtitle.id); // 立即高亮点击的字幕
        }
      });
      el._hasClickListener = true; // 标记已绑定
    }
  });
}

/**
 * 计算两个字符串之间的 Levenshtein 距离。
 * 用于衡量两个序列之间的差异程度，即从一个字符串转换成另一个字符串所需的最小单字符编辑（插入、删除或替换）次数。
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
          dp[i - 1][j] + 1,    // Deletion
          dp[i][j - 1] + 1,    // Insertion
          dp[i - 1][j - 1] + 1 // Substitution
        );
      }
    }
  }

  return dp[a.length][b.length];
}
