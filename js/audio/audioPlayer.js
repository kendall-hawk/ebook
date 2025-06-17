// js/audio/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = [];

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  if (!audio) {
    // 1. 初始化播放器元素（仅一次）
    audio = document.createElement('audio');
    audio.className = 'audio-player';
    audio.src = audioSrc;
    audio.controls = true;
    document.body.appendChild(audio);
  }

  // 2. 加载并解析 SRT
  const res = await fetch(srtSrc);
  const srtText = await res.text();
  subtitleData = parseSRT(srtText);

  // 3. 建立词→句子映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 4. 点击事件绑定（仅一次）
  if (!document.body.dataset.audioListenerAttached) {
    document.body.addEventListener('click', handleWordClick);
    document.body.dataset.audioListenerAttached = 'true';
  }
}

function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, index) => {
    const words = tokenizeText(subtitle.text);
    words.forEach(({ word }) => {
      map.push({
        word: word.toLowerCase(),
        index,
      });
    });
  });
  return map;
}

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.classList.contains('word')) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const matches = wordToSubtitleMap.filter(w => w.word === clickedWord);
  if (!matches.length) return;

  // 方式一：如果该词在 data-sub-index 句子中
  const sentenceEl = target.closest('.sentence[data-sub-index]');
  if (sentenceEl) {
    const index = parseInt(sentenceEl.dataset.subIndex);
    if (!isNaN(index) && subtitleData[index]) {
      audio.currentTime = subtitleData[index].start;
      audio.play();
      return;
    }
  }

  // 方式二：回退查找最相近句子位置
  const bestMatch = findBestSubtitleMatch(target, matches);
  if (bestMatch !== null) {
    audio.currentTime = subtitleData[bestMatch].start;
    audio.play();
  }
}

function findBestSubtitleMatch(target, matches) {
  const targetOffset = target.getBoundingClientRect().top + window.scrollY;
  let bestIndex = null;
  let smallestDistance = Infinity;

  matches.forEach(({ index }) => {
    const node = document.querySelector(`.sentence[data-sub-index="${index}"]`);
    if (node) {
      const offset = node.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(offset - targetOffset);
      if (distance < smallestDistance) {
        bestIndex = index;
        smallestDistance = distance;
      }
    }
  });

  return bestIndex;
}