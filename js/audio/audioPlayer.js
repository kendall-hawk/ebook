import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

/**
 * 初始化音频播放器，创建音频元素并加载字幕。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;width:90%;max-width:600px;',
  });
  document.body.appendChild(audio);

  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (error) {
    console.error('加载或解析SRT失败:', error);
    return;
  }

  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  document.body.addEventListener('click', handleWordClick);

  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    const index = subtitleData.findIndex(
      (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );
    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      clearAllHighlights();
      const { text } = subtitleData[index];
      const el = findVisibleTextNodeNearText(text);
      if (el) {
        highlightTextInElement(el, text);
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
    }
  });

  console.log('音频播放器初始化完成。');
}

function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    const words = tokenizeText(subtitle.text.toLowerCase());
    words.forEach(({ word }) => {
      map.push({ word, index: i });
    });
  });
  return map;
}

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  const clickedText = target.textContent.trim();
  if (clickedText.length > 30) return;

  const clickedWord = clickedText.toLowerCase();
  if (!clickedWord) return;

  const possibleMatches = wordToSubtitleMap.filter(entry => entry.word === clickedWord);
  if (possibleMatches.length === 0) return;

  const closestIndex = findBestSubtitleMatch(target, possibleMatches);
  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex];
    audio.currentTime = start;
    audio.play();

    clearAllHighlights();
    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      highlightTextInElement(subtitleElement, text);
      subtitleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;

  let bestIndex = null;
  let bestScore = -Infinity;

  for (const { index } of matches) {
    const sub = subtitleData[index];
    const subtitleText = sub.text.toLowerCase();
    const node = findVisibleTextNodeNearText(sub.title || sub.text);
    if (!node) continue;

    const nodeOffset = node.getBoundingClientRect().top + window.scrollY;
    const distance = Math.abs(nodeOffset - clickedOffset);
    const maxDist = 1000;
    const proximityScore = 1 - Math.min(distance / maxDist, 1);

    const content = node.textContent.toLowerCase();
    const sim = computeLevenshteinSimilarity(subtitleText, content);

    const finalScore = sim * 0.7 + proximityScore * 0.3;
    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    }
  });
}

function findVisibleTextNodeNearText(text) {
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  const targetLower = text.trim().toLowerCase();

  for (const node of nodes) {
    const nodeTextContent = node.textContent;
    if (nodeTextContent && nodeTextContent.toLowerCase().includes(targetLower)) {
      if (!node.classList.contains('highlighted')) {
        return node;
      }
    }
  }
  return null;
}

function highlightTextInElement(el, targetText) {
  if (!el || !targetText) return;

  const targetLower = targetText.trim().toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);

  let found = false;
  while (walker.nextNode() && !found) {
    const textNode = walker.currentNode;
    const text = textNode.nodeValue;
    if (textNode.parentNode?.classList.contains('highlighted')) continue;

    const index = text.toLowerCase().indexOf(targetLower);
    if (index !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNode, index);
        range.setEnd(textNode, index + targetLower.length);
        const span = document.createElement('span');
        span.className = 'highlighted';
        range.surroundContents(span);
        found = true;
      } catch (e) {
        console.warn('高亮失败:', e, '文本:', targetText, '节点:', textNode);
      }
    }
  }
}

function computeLevenshteinSimilarity(a, b) {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}