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

  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (error) {
    console.error('加载或解析SRT文件失败:', error);
    return;
  }

  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  document.body.addEventListener('click', handleWordClick);
  console.log('音频播放器初始化完成。');
}

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

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleMatches = wordToSubtitleMap.filter(entry => entry.word === clickedWord);
  if (possibleMatches.length === 0) return;

  const closestIndex = findBestSubtitleMatch(target, possibleMatches);
  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex];
    audio.currentTime = start;
    audio.play();

    // 清除之前的高亮
    document.querySelectorAll('.highlighted').forEach(el =>
      el.classList.remove('highlighted')
    );

    // 查找字幕所在元素并高亮句子
    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      highlightTextInElement(subtitleElement, text);

      // 平滑滚动（延迟到下一帧）
      requestAnimationFrame(() => {
        subtitleElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      });
    }
  }
}

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
 * 将目标 DOM 元素中匹配的句子部分用 <span class="highlighted"> 包裹并替换内容
 * @param {HTMLElement} element - 要修改的 DOM 元素
 * @param {string} targetText - 要高亮的完整句子
 */
function highlightTextInElement(element, targetText) {
  const content = element.textContent;
  const index = content.indexOf(targetText);
  if (index === -1) return;

  const before = content.slice(0, index);
  const match = content.slice(index, index + targetText.length);
  const after = content.slice(index + targetText.length);

  element.innerHTML = `${escapeHtml(before)}<span class="highlighted">${escapeHtml(match)}</span>${escapeHtml(after)}`;
}

/**
 * HTML 转义辅助函数（防止 innerHTML 注入问题）
 */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, match => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return map[match];
  });
}