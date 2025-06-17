// js/audio/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = new Map();

/**
 * 初始化音频播放器：加载音频和字幕，建立索引映射。
 * @param {Object} options
 * @param {string} options.audioSrc - 音频文件路径
 * @param {string} options.srtSrc - 字幕文件路径
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  audio = new Audio(audioSrc);

  const srtText = await fetch(srtSrc).then(res => res.text());
  subtitleData = parseSRT(srtText);

  buildInvertedIndex();

  document.getElementById('chapters')?.addEventListener('click', handleWordClick);

  // 播放进度监听高亮当前句子
  audio.addEventListener('timeupdate', handleTimeUpdate);
}

function buildInvertedIndex() {
  wordToSubtitleMap.clear();
  subtitleData.forEach((sub, index) => {
    const words = tokenizeText(sub.text);
    for (const { word } of words) {
      const lower = word.toLowerCase();
      if (!wordToSubtitleMap.has(lower)) {
        wordToSubtitleMap.set(lower, new Set());
      }
      wordToSubtitleMap.get(lower).add(index);
    }
  });
}

function handleWordClick(event) {
  const wordEl = event.target.closest('.word');
  if (!wordEl) return;

  const word = wordEl.textContent.trim().toLowerCase();
  const subtitleIndexSet = wordToSubtitleMap.get(word);
  if (!subtitleIndexSet || subtitleIndexSet.size === 0) return;

  const allSubtitleIndices = Array.from(subtitleIndexSet);

  // 在页面中查找所有包含该字幕的 `.subtitle-segment`，计算哪句最接近点击的 word
  const segments = Array.from(document.querySelectorAll('.subtitle-segment'));
  const bestMatch = allSubtitleIndices
    .map(idx => {
      const sub = subtitleData[idx];
      const segmentEl = segments.find(el => el.dataset.subtitleId === String(sub.id));
      if (!segmentEl) return null;

      const rect = segmentEl.getBoundingClientRect();
      const wordRect = wordEl.getBoundingClientRect();
      const distance = Math.abs(rect.top - wordRect.top);

      return { idx, distance, segmentEl };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance)[0];

  if (!bestMatch) return;

  const sub = subtitleData[bestMatch.idx];
  playSubtitle(sub);
  highlightSubtitle(sub.id);
  scrollToSubtitle(sub.id);
}

function playSubtitle(sub) {
  if (!audio) return;
  audio.currentTime = sub.start;
  audio.play();
}

function highlightSubtitle(subId) {
  document.querySelectorAll('.subtitle-segment').forEach(el => {
    el.classList.toggle('subtitle-active', el.dataset.subtitleId === String(subId));
  });
}

function scrollToSubtitle(subId) {
  const el = document.querySelector(`.subtitle-segment[data-subtitle-id="${subId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function handleTimeUpdate() {
  const currentTime = audio.currentTime;
  const currentSub = subtitleData.find(sub => currentTime >= sub.start && currentTime <= sub.end);
  if (!currentSub) return;

  highlightSubtitle(currentSub.id);
}