// js/audio/audioPlayer.js

import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 1. 初始化播放器元素
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

  // 2. 解析 .srt 文件
  const res = await fetch(srtSrc);
  const srtText = await res.text();
  subtitleData = parseSRT(srtText);

  // 3. 建立词→句子的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 4. 监听页面中点击事件
  document.body.addEventListener('click', handleWordClick);
}

function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    const words = tokenizeText(subtitle.text);
    words.forEach(({ word }) => {
      const lower = word.toLowerCase();
      map.push({
        word: lower,
        index: i,
      });
    });
  });
  return map;
}

function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleMatches = wordToSubtitleMap
    .filter(entry => entry.word === clickedWord);

  if (possibleMatches.length === 0) return;

  // 精确比对是哪一句话中的该单词（通过 offsetTop）
  const closest = findBestSubtitleMatch(target, possibleMatches);

  if (closest !== null) {
    const { start } = subtitleData[closest];
    audio.currentTime = start;
    audio.play();
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
    if (node.innerText && node.innerText.includes(text)) {
      return node;
    }
  }
  return null;
}
