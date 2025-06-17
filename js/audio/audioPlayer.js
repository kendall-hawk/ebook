// js/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio = null;
let subtitleData = [];
let invertedIndex = new Map();

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  if (document.getElementById('custom-audio-player')) {
    audio = document.getElementById('custom-audio-player');
    if (audio.src !== audioSrc) {
      audio.src = audioSrc;
    }
  } else {
    audio = document.createElement('audio');
    audio.id = 'custom-audio-player';
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
  }

  try {
    const res = await fetch(srtSrc);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
    buildInvertedIndex(subtitleData);
  } catch (err) {
    console.error('加载字幕失败:', err);
    subtitleData = [];
    invertedIndex.clear();
    return;
  }

  if (!document.body.dataset.wordClickListenerAdded) {
    document.body.addEventListener('click', handleWordClick);
    document.body.dataset.wordClickListenerAdded = 'true';
  }
}

function buildInvertedIndex(subs) {
  invertedIndex.clear();
  subs.forEach((subtitle, i) => {
    if (typeof subtitle.text === 'string') {
      const words = tokenizeText(subtitle.text);
      words.forEach(({ word }) => {
        const lower = word.toLowerCase();
        if (!invertedIndex.has(lower)) {
          invertedIndex.set(lower, new Set());
        }
        invertedIndex.get(lower).add(i);
      });
    }
  });
}

function handleWordClick(e) {
  const target = e.target;
  if (!target.classList.contains('word')) return;

  const clickedWord = target.dataset.word?.toLowerCase();
  if (!clickedWord || clickedWord.length > 30) return;

  const possibleIndexes = invertedIndex.get(clickedWord);
  if (!possibleIndexes || possibleIndexes.size === 0) return;

  const matches = Array.from(possibleIndexes).map(index => ({ word: clickedWord, index }));
  const bestIndex = findBestSubtitleMatch(target, matches);
  if (bestIndex !== null) {
    const { start } = subtitleData[bestIndex];
    highlightAndScrollToText(bestIndex, clickedWord);
    if (audio) {
      audio.currentTime = start;
      audio.play();
    }
  }
}

function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;
  let bestIndex = null;
  let minScore = Infinity;

  for (const { index } of matches) {
    const node = document.querySelector(`.subtitle-sentence[data-sub-index="${index}"]`);
    if (!node) continue;

    const offset = node.getBoundingClientRect().top + window.scrollY;
    const distance = Math.abs(offset - clickedOffset);
    const textDistance = levenshtein(target.textContent.toLowerCase(), subtitleData[index].text.toLowerCase());
    const score = distance + textDistance * 5;

    if (score < minScore) {
      minScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function highlightAndScrollToText(index, targetWord) {
  document.querySelectorAll('.subtitle-sentence').forEach(n => n.classList.remove('highlight-sentence'));
  document.querySelectorAll('.word').forEach(w => w.classList.remove('highlight-word'));

  const sentenceNode = document.querySelector(`.subtitle-sentence[data-sub-index="${index}"]`);
  if (!sentenceNode) return;

  sentenceNode.classList.add('highlight-sentence');

  const wordSpans = sentenceNode.querySelectorAll(`.word[data-word="${targetWord}"]`);
  wordSpans.forEach(span => span.classList.add('highlight-word'));

  if (wordSpans.length > 0) {
    wordSpans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    sentenceNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}