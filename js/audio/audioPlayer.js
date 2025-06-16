// js/audio/audioPlayer.js

import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

// --- 常量定义 ---
const AUDIO_PLAYER_ID = 'audioPlayer'; // 音频播放器元素的ID
const CHAPTERS_CONTAINER_SELECTOR = '#chapters'; // 包含字幕文本的容器选择器
const HIGHLIGHT_CLASS = 'highlighted-word'; // 高亮单词的CSS类名

// --- 模块级变量 ---
let audio = null; // 音频播放器DOM元素
let subtitleData = []; // 解析后的字幕数据
// 使用 Map 存储单词到字幕索引的映射，键为小写单词，值为一个数组，
// 数组中包含该单词出现的所有 { subIndex: 字幕索引, wordIndexInSubtitle: 单词在字幕中的索引 }
let wordToSubtitleMap = new Map();
let currentHighlightedWordElement = null; // 当前被高亮的单词DOM元素
let previousSubtitleIndex = -1; // 用于跟踪上一个高亮的字幕索引，避免重复处理

/**
 * 初始化音频播放器和字幕同步功能。
 * @param {object} options - 初始化选项。
 * @param {string} options.audioSrc - 音频文件URL。
 * @param {string} options.srtSrc - SRT字幕文件URL。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 1. 初始化或获取播放器元素
  audio = document.getElementById(AUDIO_PLAYER_ID);
  if (!audio) {
    audio = document.createElement('audio');
    audio.id = AUDIO_PLAYER_ID;
    audio.controls = true;
    // 使用 style.cssText 更方便地设置多行样式，或最好通过CSS类管理
    audio.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      width: 90%;
      max-width: 600px;
    `;
    document.body.appendChild(audio);
  }
  audio.src = audioSrc;

  // 2. 解析 .srt 文件
  try {
    const res = await fetch(srtSrc);
    if (!res.ok) {
      throw new Error(`Failed to fetch SRT file: ${res.statusText} (${res.status})`);
    }
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (error) {
    console.error('Error loading or parsing SRT:', error);
    // 可以在这里向用户显示错误消息
    alert('Failed to load subtitles. Please try again later.');
    return; // 如果字幕加载失败，停止后续初始化
  }

  // 3. 建立词 -> 字幕索引的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 4. 监听字幕容器内的点击事件 (事件委托)
  const chaptersContainer = document.querySelector(CHAPTERS_CONTAINER_SELECTOR);
  if (chaptersContainer) {
    // 假设所有可点击的单词都有 'word-clickable' 类
    chaptersContainer.addEventListener('click', handleWordClick);
  } else {
    console.warn(`Subtitle container with selector "${CHAPTERS_CONTAINER_SELECTOR}" not found. Word click functionality might be limited.`);
    // 如果容器不存在，仍将事件监听器添加到 body，但建议始终使用特定容器
    document.body.addEventListener('click', handleWordClick);
  }

  // 5. 监听音频播放时间更新，实现单词高亮
  audio.addEventListener('timeupdate', highlightCurrentWord);
  // 监听音频暂停和结束，清除高亮
  audio.addEventListener('pause', clearWordHighlight);
  audio.addEventListener('ended', clearWordHighlight);

  console.log('Audio player initialized successfully.');
}

/**
 * 构建单词到字幕数据的映射。
 * 优化：使用 Map 存储，每个单词关联其出现的所有字幕索引和单词在字幕中的位置。
 * @param {Array<Object>} subs - 字幕数据数组。
 * @returns {Map<string, Array<{subIndex: number, wordIndexInSubtitle: number}>>} 单词映射Map。
 */
function buildWordToSubtitleMap(subs) {
  const map = new Map();
  subs.forEach((subtitle, subIndex) => {
    // 确保 tokenizeText 返回包含原始单词和其在句子中位置的信息
    const words = tokenizeText(subtitle.text);
    words.forEach((token, wordIndexInSubtitle) => {
      const lowerWord = token.word.toLowerCase();
      if (!map.has(lowerWord)) {
        map.set(lowerWord, []);
      }
      map.get(lowerWord).push({ subIndex, wordIndexInSubtitle });
    });
  });
  return map;
}

/**
 * 处理单词点击事件。
 * 优化：利用 Map 直接查找，事件委托减少监听器。
 * @param {Event} e - 点击事件对象。
 */
function handleWordClick(e) {
  const target = e.target;
  // 确保点击的是一个包含文本且可能是可点击单词的元素
  // 建议：前端给可点击单词元素添加一个特定类，如 'word-clickable'
  // if (!target.classList.contains('word-clickable')) return;

  const clickedWord = target.textContent?.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) {
    // 避免处理过长或空字符串
    return;
  }

  // 从 Map 中直接获取可能的匹配项
  const possibleMatches = wordToSubtitleMap.get(clickedWord);

  if (!possibleMatches || possibleMatches.length === 0) {
    return;
  }

  // 通过元素的offsetTop精确比对是哪一句话中的该单词
  const bestMatchSubIndex = findBestSubtitleMatch(target, possibleMatches);

  if (bestMatchSubIndex !== null) {
    const { start } = subtitleData[bestMatchSubIndex];
    audio.currentTime = start;
    audio.play();
  }
}

/**
 * 在多个匹配的字幕中找到与点击元素最接近的字幕。
 * 优化：假设字幕元素有 data-sub-index 属性以进行精确查找。
 * @param {HTMLElement} clickedElement - 用户点击的DOM元素。
 * @param {Array<Object>} possibleMatches - 包含 {subIndex: number, wordIndexInSubtitle: number} 的数组。
 * @returns {number|null} 最佳匹配字幕的索引，如果没有找到则为 null。
 */
function findBestSubtitleMatch(clickedElement, possibleMatches) {
  const clickedOffset = clickedElement.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity;

  // 遍历所有可能的字幕索引
  for (const { subIndex } of possibleMatches) {
    // 假设每个字幕行都有一个 data-sub-index 属性，例如：<p data-sub-index="0">...</p>
    const subtitleElement = document.querySelector(`${CHAPTERS_CONTAINER_SELECTOR} [data-sub-index="${subIndex}"]`);

    if (subtitleElement) {
      const offset = subtitleElement.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(offset - clickedOffset);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = subIndex;
      }
    }
  }
  return closestIndex;
}

/**
 * 根据当前音频时间高亮对应的单词。
 * 假设：前端渲染时，每个字幕行有 data-sub-index，每个单词有 data-word-index。
 */
function highlightCurrentWord() {
  if (!audio || audio.paused || !subtitleData.length) {
    clearWordHighlight();
    return;
  }

  const currentTime = audio.currentTime;
  // 查找当前时间点对应的字幕
  const currentSubtitle = subtitleData.find(sub =>
    currentTime >= sub.start && currentTime < sub.end
  );

  if (currentSubtitle) {
    const currentSubtitleIndex = subtitleData.indexOf(currentSubtitle);

    // 如果字幕切换了，清除旧的高亮并更新索引
    if (currentSubtitleIndex !== previousSubtitleIndex) {
      clearWordHighlight();
      previousSubtitleIndex = currentSubtitleIndex;
    }

    // 获取当前字幕的文本，并再次分词以获取单词顺序
    const tokenizedCurrentSubtitle = tokenizeText(currentSubtitle.text);

    // 简单估算每个单词的平均持续时间（如果没有词级时间戳）
    const totalSubDuration = currentSubtitle.end - currentSubtitle.start;
    const wordsInSubtitleCount = tokenizedCurrentSubtitle.length;
    const averageWordDuration = wordsInSubtitleCount > 0 ? totalSubDuration / wordsInSubtitleCount : 0;

    let accumulatedTime = currentSubtitle.start; // 从字幕开始时间累加

    for (let i = 0; i < tokenizedCurrentSubtitle.length; i++) {
      const token = tokenizedCurrentSubtitle[i];
      // 累加每个单词的预计结束时间
      accumulatedTime += averageWordDuration;

      // 如果当前音频时间小于累加时间，说明这个单词是当前正在播放的
      if (currentTime < accumulatedTime) {
        // 查找对应的字幕元素
        const subtitleElement = document.querySelector(`${CHAPTERS_CONTAINER_SELECTOR} [data-sub-index="${currentSubtitleIndex}"]`);
        if (subtitleElement) {
          // 查找该字幕行中带有 data-word-index 的单词元素
          const targetWordElement = subtitleElement.querySelector(`[data-word-index="${i}"]`);

          if (targetWordElement && targetWordElement !== currentHighlightedWordElement) {
            clearWordHighlight(); // 清除旧的高亮
            targetWordElement.classList.add(HIGHLIGHT_CLASS); // 添加高亮类
            currentHighlightedWordElement = targetWordElement;

            // 可选：滚动到高亮的单词，使其可见
            // targetWordElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        break; // 找到当前单词后退出循环
      }
    }
  } else {
    // 如果当前时间没有匹配任何字幕，清除高亮
    clearWordHighlight();
    previousSubtitleIndex = -1;
  }
}

/**
 * 清除当前高亮的单词。
 */
function clearWordHighlight() {
  if (currentHighlightedWordElement) {
    currentHighlightedWordElement.classList.remove(HIGHLIGHT_CLASS);
    currentHighlightedWordElement = null;
  }
}
