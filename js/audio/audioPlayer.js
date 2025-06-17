import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';
import { computeLevenshteinSimilarity } from './levenshtein.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

/**
 * 初始化音频播放器
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  injectHighlightStyles();

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

  // 加载字幕
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (err) {
    console.error('加载字幕失败:', err);
    return;
  }

  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  document.body.addEventListener('click', handleWordClick);

  let lastIndex = -1;
  audio.addEventListener('timeupdate', () => {
    const current = audio.currentTime;
    const index = subtitleData.findIndex(
      (sub, i) => current >= sub.start && (i === subtitleData.length - 1 || current < subtitleData[i + 1].start)
    );
    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      clearHighlights();
      const el = findVisibleTextNodeNearText(subtitleData[index].text);
      if (el) {
        highlightTextInElement(el, subtitleData[index].text);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

/**
 * 创建词到字幕的映射 Map
 */
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((sub, i) => {
    tokenizeText(sub.text).forEach(({ word }) => {
      map.push({ word: word.toLowerCase(), index: i });
    });
  });
  return map;
}

/**
 * 处理点击 .word 元素
 */
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  if (target.classList.contains('highlighted') || target.textContent.length > 30) {
    const parentText = target.parentNode?.textContent?.toLowerCase();
    const word = target.textContent.trim().toLowerCase();
    if (!parentText?.includes(word)) return;
  }

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord) return;

  const candidates = wordToSubtitleMap.filter(entry => entry.word === clickedWord);
  if (candidates.length === 0) return;

  const bestIndex = findBestSubtitleMatch(target, candidates);
  if (bestIndex !== null) {
    const sub = subtitleData[bestIndex];
    audio.currentTime = sub.start;
    audio.play();

    clearHighlights();
    const el = findVisibleTextNodeNearText(sub.text);
    if (el) {
      highlightTextInElement(el, sub.text);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

/**
 * 清除所有高亮
 */
function clearHighlights() {
  document.querySelectorAll('.highlighted').forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    }
  });
}

/**
 * 查找最接近点击位置的字幕
 */
function findBestSubtitleMatch(target, candidates) {
  const targetY = target.getBoundingClientRect().top + window.scrollY;
  let minDist = Infinity;
  let bestIndex = null;

  candidates.forEach(({ index }) => {
    const node = findVisibleTextNodeNearText(subtitleData[index].text);
    if (node) {
      const y = node.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(targetY - y);
      if (dist < minDist) {
        minDist = dist;
        bestIndex = index;
      }
    }
  });

  return bestIndex;
}

/**
 * 查找与字幕文本最接近的页面节点
 */
function findVisibleTextNodeNearText(text) {
  const clean = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = clean(text);
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters div, #chapters span'));

  let bestMatch = null, bestScore = 0;
  for (const node of nodes) {
    if (!node.isConnected || !node.offsetParent) continue;
    const content = clean(node.textContent || '');
    if (content.length === 0) continue;
    const score = computeLevenshteinSimilarity(content, target);
    if (score > bestScore && score > 0.6) {
      bestScore = score;
      bestMatch = node;
    }
  }

  return bestMatch;
}

/**
 * 高亮指定节点中的指定字幕句子（只变字体颜色）
 */
function highlightTextInElement(el, targetText) {
  const clean = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const target = clean(targetText);

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue) continue;
    const text = clean(node.nodeValue);
    const index = text.indexOf(target);
    if (index !== -1) {
      const range = document.createRange();
      const rawText = node.nodeValue;
      const rawIndex = rawText.toLowerCase().indexOf(target);
      if (rawIndex === -1) continue;

      range.setStart(node, rawIndex);
      range.setEnd(node, rawIndex + target.length);

      const span = document.createElement('span');
      span.className = 'highlighted';
      span.style.color = '#d60000';
      span.style.fontWeight = 'bold';

      try {
        range.surroundContents(span);
        break;
      } catch (err) {
        console.warn('高亮失败:', err);
      }
    }
  }
}

/**
 * 注入高亮样式
 */
function injectHighlightStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .highlighted {
      color: #d60000 !important;
      font-weight: bold !important;
    }
  `;
  document.head.appendChild(style);
}