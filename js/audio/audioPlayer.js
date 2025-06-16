Import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let invertedIndex = new Map();
let currentHighlightedSubtitleIndex = -1; // 跟踪当前高亮的字幕索引

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

  // 添加点击监听
  document.body.addEventListener('click', handleWordClick);

  // 添加音频时间更新监听器，实现自动高亮
  audio.ontimeupdate = () => {
    const currentTime = audio.currentTime;
    let newIndexToHighlight = -1;

    // 遍历所有字幕，找到当前时间对应的字幕
    for (let i = 0; i < subtitleData.length; i++) {
      const subtitle = subtitleData[i];
      // 如果当前时间在字幕的开始和结束之间
      if (currentTime >= subtitle.start && currentTime < subtitle.end) {
        newIndexToHighlight = i;
        break; // 找到后立即退出循环
      }
    }

    // 如果需要高亮的字幕索引发生变化
    if (newIndexToHighlight !== currentHighlightedSubtitleIndex) {
      if (newIndexToHighlight !== -1) {
        // 高亮新的字幕
        highlightSubtitleByIndex(newIndexToHighlight);
      } else {
        // 如果当前时间不在任何字幕区间内，则移除所有高亮
        removeHighlight();
      }
      currentHighlightedSubtitleIndex = newIndexToHighlight; // 更新当前高亮的索引
    }
  };
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
  if (!target || !target.textContent) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleIndexes = invertedIndex.get(clickedWord);
  if (!possibleIndexes || possibleIndexes.size === 0) return;

  const matches = Array.from(possibleIndexes).map(index => ({
    word: clickedWord,
    index
  }));

  const bestIndex = findBestSubtitleMatch(target, matches);
  if (bestIndex !== null) {
    const { start } = subtitleData[bestIndex];

    // 调用新的高亮函数，并更新当前高亮状态
    highlightSubtitleByIndex(bestIndex);
    currentHighlightedSubtitleIndex = bestIndex; // 更新当前高亮索引

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
    // 使用更可靠的 findSubtitleNode 函数
    const node = findSubtitleNode(subtitle.text);
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

// 优化后的函数：用于查找与特定字幕文本匹配的 DOM 节点
// 确保这个函数能够可靠地找到你的字幕文本对应的 HTML 元素
function findSubtitleNode(subtitleText) {
  const selector = '#chapters p, #chapters span, #chapters div';
  const nodes = Array.from(document.querySelectorAll(selector));

  for (const node of nodes) {
    // 使用 trim() 移除可能存在的首尾空白符，使匹配更健壮
    if (node.innerText && node.innerText.trim().includes(subtitleText.trim())) {
      return node;
    }
  }
  return null;
}

// 根据字幕索引高亮特定字幕的函数
function highlightSubtitleByIndex(index) {
  // 先移除所有旧的高亮
  removeHighlight();

  const subtitle = subtitleData[index];
  if (subtitle) {
    const node = findSubtitleNode(subtitle.text);
    if (node) {
      node.classList.add('highlight');
      // 只有当高亮节点不在可视区域时才滚动
      const rect = node.getBoundingClientRect();
      const isVisible = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
      if (!isVisible) {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
}

// 移除所有字幕高亮的函数
function removeHighlight() {
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  nodes.forEach(n => n.classList.remove('highlight'));
}


// Levenshtein distance (简单实现)
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