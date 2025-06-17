import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

/**
 * 初始化音频播放器，创建音频元素并加载字幕。
 * @param {object} options - 配置选项。
 * @param {string} options.audioSrc - 音频文件的 URL。
 * @param {string} options.srtSrc - SRT 字幕文件的 URL。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 创建音频播放器
  audio = document.createElement('audio');
  audio.src = audioSrc;
  audio.controls = true;
  audio.style.position = 'fixed';
  audio.style.bottom = '20px';
  audio.style.left = '50%';
  audio.style.transform = 'translateX(-50%)';
  audio.style.zIndex = 9999;
  audio.style.width = '90%';
  audio.style.maxWidth = '600px';
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

  // 建立词到字幕句子的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 注册点击事件监听器
  document.body.addEventListener('click', handleWordClick);

  // 播放进度更新时自动高亮当前字幕句子
  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;

    const index = subtitleData.findIndex(
      (sub, i) =>
        currentTime >= sub.start &&
        (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );

    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;

      // 清除所有旧高亮
      document.querySelectorAll('.highlighted').forEach(el =>
        el.classList.remove('highlighted')
      );

      const { text } = subtitleData[index];
      const el = findVisibleTextNodeNearText(text);
      if (el) {
        highlightTextInElement(el, text);
        requestAnimationFrame(() => {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        });
      }
    }
  });

  console.log('音频播放器初始化完成。');
}

/**
 * 构建单词到字幕句子索引的映射表
 */
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    if (typeof subtitle.text === 'string') {
      const words = tokenizeText(subtitle.text);
      words.forEach(({ word }) => {
        map.push({ word: word.toLowerCase(), index: i });
      });
    }
  });
  return map;
}

/**
 * 处理点击单词事件，跳转并播放对应句子
 */
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleMatches = wordToSubtitleMap
    .filter(entry => entry.word === clickedWord);

  if (possibleMatches.length === 0) return;

  const closestIndex = findBestSubtitleMatch(target, possibleMatches);
  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex];
    audio.currentTime = start;
    audio.play();

    // 清除所有旧高亮
    document.querySelectorAll('.highlighted').forEach(el =>
      el.classList.remove('highlighted')
    );

    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      highlightTextInElement(subtitleElement, text);
      subtitleElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }
}

/**
 * 选择与点击位置最接近的字幕句子
 */
function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity;

  matches.forEach(({ index }) => {
    const sText = subtitleData[index].text;
    const foundNode = findVisibleTextNodeNearText(sText);
    if (foundNode) {
      const offset = foundNode.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(offset - clickedOffset);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

/**
 * 查找页面中包含给定字幕文本的节点
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

/**
 * 高亮指定 DOM 元素中的目标文本（只变字体颜色）
 */
function highlightTextInElement(el, targetText) {
  if (!el || !targetText) return;

  const html = el.innerHTML;
  const escapedText = targetText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
  const regex = new RegExp(escapedText, 'i');

  const newHTML = html.replace(regex, match => {
    return `<span class="highlighted" style="color: #d60000; font-weight: bold;">${match}</span>`;
  });

  el.innerHTML = newHTML;
}