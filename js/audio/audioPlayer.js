import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';
// 假设你的 chapterRenderer.js 导出了 renderChapterContent 函数
import { renderChapterContent } from '../chapterRenderer.js'; 

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

  // ✅ 新增：在加载字幕后，调用 chapterRenderer 渲染字幕到页面
  // 确保 renderChapterContent 在 chapterRenderer.js 中已正确导出并接受 subtitleData
  renderChapterContent(null, subtitleData); // 如果 chapterData 不相关，传 null 或空对象

  // 添加点击监听
  // 注意：如果你的单词被包裹在单独的 span 中，这里可能需要更精细的选择器
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
  // ✅ 确保只处理带有 data-subtitle-index 的元素，或者你用来包裹单词的 class
  // 比如如果你将单词包裹在 <span class="clickable-word"> 中，可以这样判断：
  // if (!target || !target.textContent || !target.closest('.subtitle-line')) return; 
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
    // ✅ 现在通过索引查找节点，更准确
    const node = findSubtitleNodeByIndex(index); 
    if (node) {
      const offset = node.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(offset - clickedOffset);
      // ✅ 确保 target.textContent 是点击的单词，而 subtitle.text 是整句字幕
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

// ✅ 新增：通过 data-subtitle-index 直接查找 DOM 节点
function findSubtitleNodeByIndex(index) {
  // 查找带有特定 data-subtitle-index 属性的元素
  return document.querySelector(`#chapters .subtitle-line[data-subtitle-index="${index}"]`);
}

// ✅ 移除或修改：原 findSubtitleNode 不再用于高亮，因为我们现在通过索引查找
// 如果你确认所有字幕都通过 data-subtitle-index 渲染，这个函数可以被移除
// 如果你的其他部分代码仍然需要通过文本查找，可以保留，但它不会用于高亮了
function findSubtitleNode(subtitleText) {
  // 这个函数现在主要用于 findBestSubtitleMatch，它仍依赖文本匹配
  // 但高亮逻辑已切换到 findSubtitleNodeByIndex
  const selector = '#chapters p.subtitle-line, #chapters span.subtitle-line, #chapters div.subtitle-line';
  const nodes = Array.from(document.querySelectorAll(selector));

  for (const node of nodes) {
    if (node.innerText && node.innerText.trim().includes(subtitleText.trim())) {
      return node;
    }
  }
  return null;
}


// 根据字幕索引高亮特定字幕的函数
function highlightSubtitleByIndex(index) {
  removeHighlight(); // 先移除所有旧的高亮

  const node = findSubtitleNodeByIndex(index); // ✅ 通过索引直接查找节点
  
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

// 移除所有字幕高亮的函数
function removeHighlight() {
  // ✅ 修正选择器，只移除具有 'subtitle-line' 和 'highlight' 类的元素的 'highlight' 类
  const nodes = document.querySelectorAll('#chapters .subtitle-line.highlight'); 
  nodes.forEach(n => n.classList.remove('highlight'));
}


// Levenshtein distance (简单实现) - 保持不变
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
