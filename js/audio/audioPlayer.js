// js/audio/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = new Map();

/**
 * 初始化音频播放器，创建音频元素并加载字幕。
 * @param {object} options - 配置选项。
 * @param {string} options.audioSrc - 音频文件的 URL。
 * @param {string} options.srtSrc - SRT 字幕文件的 URL。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 创建音频播放器
  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      width: 90%;
      max-width: 600px;
    `
  });
  document.body.appendChild(audio);

  // 加载并解析 SRT 字幕
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (error) {
    console.error('加载或解析SRT文件失败:', error);
    return;
  }

  // 构建单词到字幕索引的映射 Map<string, Set<number>>
  buildWordToSubtitleMap(subtitleData);

  // 注册点击事件监听器
  document.body.addEventListener('click', handleWordClick);

  console.log('音频播放器初始化完成。');
}

/**
 * 构建 word → Set<subtitleIndex> 的映射。
 * @param {Array<object>} subs - 字幕数据数组。
 */
function buildWordToSubtitleMap(subs) {
  wordToSubtitleMap = new Map();
  subs.forEach((subtitle, i) => {
    if (typeof subtitle.text === 'string') {
      const words = tokenizeText(subtitle.text);
      words.forEach(({ word }) => {
        const lower = word.toLowerCase();
        if (!wordToSubtitleMap.has(lower)) {
          wordToSubtitleMap.set(lower, new Set());
        }
        wordToSubtitleMap.get(lower).add(i);
      });
    }
  });
}

/**
 * 点击单词后触发：查找对应字幕，跳转并播放音频。
 * @param {MouseEvent} e - 鼠标点击事件。
 */
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.classList.contains('word') || !target.textContent) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleIndexes = wordToSubtitleMap.get(clickedWord);
  if (!possibleIndexes || possibleIndexes.size === 0) return;

  const matches = Array.from(possibleIndexes).map(index => ({ index }));
  const bestIndex = findBestSubtitleMatch(target, matches);

  if (bestIndex !== null) {
    const { start, text } = subtitleData[bestIndex];
    audio.currentTime = start;
    audio.play();

    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      subtitleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // 添加高亮类（自动移除）
      subtitleElement.classList.add('highlighted');
      setTimeout(() => subtitleElement.classList.remove('highlighted'), 2000);
    }
  }
}

/**
 * 在可能匹配中找到最靠近点击单词的字幕索引。
 * @param {HTMLElement} target - 点击的单词元素。
 * @param {Array<object>} matches - 匹配字幕索引数组。
 * @returns {number|null} - 最佳字幕索引。
 */
function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;
  let closestIndex = null;
  let minDistance = Infinity;

  matches.forEach(({ index }) => {
    const sText = subtitleData[index].text;
    const node = findVisibleTextNodeNearText(sText);
    if (node) {
      const nodeOffset = node.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(nodeOffset - clickedOffset);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

/**
 * 查找 #chapters 区域中包含指定字幕文本的 DOM 元素。
 * @param {string} text - 字幕内容。
 * @returns {HTMLElement|null}
 */
function findVisibleTextNodeNearText(text) {
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of nodes) {
    if (node.textContent && node.textContent.includes(text)) {
      return node;
    }
  }
  return null;
}