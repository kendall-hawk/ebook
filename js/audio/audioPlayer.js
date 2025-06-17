// js/audio/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = [];

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

  // 加载并解析字幕文件
  const res = await fetch(srtSrc);
  const srtText = await res.text();
  subtitleData = parseSRT(srtText);

  // 构建词→字幕索引的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 监听点击词汇事件
  document.body.addEventListener('click', handleWordClick);
}

function buildWordToSubtitleMap(subtitles) {
  const map = [];
  subtitles.forEach((sub, index) => {
    const words = tokenizeText(sub.text);
    words.forEach(({ word }) => {
      map.push({ word: word.toLowerCase(), index });
    });
  });
  return map;
}

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.classList.contains('word')) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleMatches = wordToSubtitleMap.filter(entry => entry.word === clickedWord);
  if (possibleMatches.length === 0) return;

  const closest = findBestSubtitleMatch(target, possibleMatches);
  if (closest !== null) {
    const { start } = subtitleData[closest];
    audio.currentTime = start;
    audio.play();
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