import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

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

  // 加载并解析字幕
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
        map.push({
          word: word.toLowerCase(),
          index: i,
        });
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

    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      clearAllHighlights();
      highlightTextInElement(subtitleElement, text);
      subtitleElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
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

function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize(); // 合并文本节点
  });
}

function highlightTextInElement(el, targetText) {
  if (!el || !targetText) return;

  const targetLower = targetText.trim().toLowerCase();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const text = textNode.nodeValue;
    const index = text.toLowerCase().indexOf(targetLower);

    if (index !== -1) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + targetLower.length);

      const span = document.createElement('span');
      span.className = 'highlighted';
      span.style.color = '#d60000';
      span.style.fontWeight = 'bold';

      range.surroundContents(span);
      break;
    }
  }
}