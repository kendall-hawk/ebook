// js/audio/audioPlayer.js

import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = [];

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 如果已有播放器，更新源即可
  if (!audio) {
    audio = document.createElement('audio');
    audio.controls = true;
    audio.style.position = 'fixed';
    audio.style.bottom = '20px';
    audio.style.left = '50%';
    audio.style.transform = 'translateX(-50%)';
    audio.style.zIndex = 9999;
    audio.style.width = '90%';
    audio.style.maxWidth = '600px';
    document.body.appendChild(audio);

    document.body.addEventListener('click', handleWordClick);
  }

  audio.src = audioSrc;
  audio.load();

  // 加载并解析字幕
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
    wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  } catch (err) {
    console.error('字幕加载失败:', err);
    subtitleData = [];
    wordToSubtitleMap = [];
  }
}

// 建立单词到字幕索引的映射
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    const words = tokenizeText(subtitle.text);
    words.forEach(({ word }) => {
      const lower = word.toLowerCase();
      if (lower.length >= 2 && lower.length <= 25) {
        map.push({
          word: lower,
          index: i,
        });
      }
    });
  });
  return map;
}

// 点击词时播放对应句子音频
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent || !subtitleData.length) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (clickedWord.length < 2 || clickedWord.length > 25) return;

  const possibleMatches = wordToSubtitleMap.filter(entry => entry.word === clickedWord);
  if (possibleMatches.length === 0) return;

  const bestMatchIndex = findBestSubtitleMatch(target, possibleMatches);
  if (bestMatchIndex !== null) {
    const { start } = subtitleData[bestMatchIndex];
    audio.currentTime = start;
    audio.play();
  }
}

// 通过页面位置判断最贴近的字幕句子
function findBestSubtitleMatch(target, matches) {
  const clickedTop = target.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity;

  matches.forEach(({ index }) => {
    const subtitleText = subtitleData[index].text;
    const matchNode = findVisibleNodeContaining(subtitleText);
    if (matchNode) {
      const nodeTop = matchNode.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(clickedTop - nodeTop);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

// 页面中找到包含字幕文本的最接近 DOM 元素
function findVisibleNodeContaining(text) {
  const candidates = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of candidates) {
    const nodeText = node.innerText || '';
    if (nodeText.includes(text)) return node;
  }
  return null;
}