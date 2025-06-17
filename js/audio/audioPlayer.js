// js/audio/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = new Map();

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 创建音频播放器
  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
  });
  Object.assign(audio.style, {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 9999,
    width: '90%',
    maxWidth: '600px'
  });
  document.body.appendChild(audio);

  // 加载并解析字幕
  const res = await fetch(srtSrc);
  const srtText = await res.text();
  subtitleData = parseSRT(srtText);

  // 构建倒排索引 Map<word, Set<subtitleIndex>>
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 监听词汇点击
  document.body.addEventListener('click', handleWordClick);
}

function buildWordToSubtitleMap(subtitles) {
  const map = new Map();
  subtitles.forEach((sub, index) => {
    const words = tokenizeText(sub.text);
    words.forEach(({ word }) => {
      const w = word.toLowerCase();
      if (!map.has(w)) {
        map.set(w, new Set());
      }
      map.get(w).add(index);
    });
  });
  return map;
}

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.classList.contains('word')) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const indices = wordToSubtitleMap.get(clickedWord);
  if (!indices || indices.size === 0) return;

  const possibleMatches = [...indices].map(index => ({ index }));
  const closest = findBestSubtitleMatch(target, possibleMatches);

  if (closest !== null) {
    const { start } = subtitleData[closest];
    audio.currentTime = start;
    audio.play();

    scrollToSubtitle(closest); // ✅ 新增滚动功能
  }
}

function findBestSubtitleMatch(target, matches) {
  const clickedTop = target.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity;

  matches.forEach(({ index }) => {
    const node = document.querySelector(`.sentence[data-sub-index="${index}"]`);
    if (node) {
      const nodeTop = node.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(clickedTop - nodeTop);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

function scrollToSubtitle(index) {
  const node = document.querySelector(`.sentence[data-sub-index="${index}"]`);
  if (node) {
    node.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}