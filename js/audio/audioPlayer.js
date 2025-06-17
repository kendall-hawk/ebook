Import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let invertedIndex = new Map();

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 初始化音频播放器
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

  // 加载字幕并建立倒排索引
  const res = await fetch(srtSrc);
  const srtText = await res.text();
  subtitleData = parseSRT(srtText);
  buildInvertedIndex(subtitleData);

  // 添加点击监听（委托）
  document.body.addEventListener('click', handleWordClick);
}

function buildInvertedIndex(subs) {
  invertedIndex.clear();
  subs.forEach((subtitle, i) => {
    const words = tokenizeText(subtitle.text);
    words.forEach(({ word }) => {
      const lower = word.toLowerCase();
      if (!invertedIndex.has(lower)) {
        invertedIndex.set(lower, new Set());
      }
      invertedIndex.get(lower).add(i);
    });
  });
}

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.classList.contains('word')) return;

  const clickedWord = target.dataset.word?.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleIndexes = invertedIndex.get(clickedWord);
  if (!possibleIndexes || possibleIndexes.size === 0) return;

  const matches = Array.from(possibleIndexes).map(index => ({
    word: clickedWord,
    index
  }));

  const bestIndex = findBestSubtitleMatch(target, matches);
  if (bestIndex !== null) {
    const { start, text } = subtitleData[bestIndex];
    highlightAndScrollToText(text, clickedWord);
    audio.currentTime = start;
    audio.play();
  }
}

function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;
  let closestIndex = null;
  let minScore = Infinity;

  matches.forEach(({ index }) => {
    const subtitle = subtitleData[index];
    const node = findVisibleTextNodeNearText(subtitle.text);
    if (node) {
      const offset = node.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(offset - clickedOffset);
      const textDistance = levenshtein(target.textContent, subtitle.text);
      const score = distance + textDistance * 5; // 可调权重
      if (score < minScore) {
        minScore = score;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

function findVisibleTextNodeNearText(text) {
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of nodes) {
    if (node.innerText && node.innerText.includes(text)) {
      return node;
    }
  }
  return null;
}

function highlightAndScrollToText(text, targetWord) {
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));

  // 移除现有高亮
  nodes.forEach(n => n.classList.remove('highlight'));
  document.querySelectorAll('.word').forEach(w => w.classList.remove('highlight'));

  // 匹配字幕文本的段落
  for (const node of nodes) {
    if (node.innerText && node.innerText.includes(text)) {
      node.classList.add('highlight');

      // 高亮匹配单词
      const wordSpans = node.querySelectorAll(`.word[data-word="${targetWord}"]`);
      wordSpans.forEach(span => span.classList.add('highlight'));

      // 滚动到第一个匹配单词
      if (wordSpans.length > 0) {
        wordSpans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      break;
    }
  }
}

// Levenshtein distance
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}