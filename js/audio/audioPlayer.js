// js/audio/audioPlayer.js
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitles = [];
let wordToSubtitleMap = new Map();
let currentIndex = -1;

export function initAudioPlayer({ audioSrc, initialSubtitleData }) {
  if (!audioSrc || !initialSubtitleData) return;

  subtitles = initialSubtitleData;
  wordToSubtitleMap = buildWordToSubtitleMap(subtitles);
  currentIndex = -1;

  setupAudio(audioSrc);
  bindWordClickEvents();
}

function setupAudio(src) {
  document.getElementById('audio-player-container')?.remove();

  audio = document.createElement('audio');
  audio.id = 'audio-player';
  audio.src = src;
  audio.controls = true;

  const container = document.createElement('div');
  container.id = 'audio-player-container';
  container.appendChild(audio);
  document.body.appendChild(container);

  audio.addEventListener('timeupdate', onTimeUpdate);
}

function onTimeUpdate() {
  const t = audio.currentTime;
  for (let i = 0; i < subtitles.length; i++) {
    const s = subtitles[i];
    if (t >= s.start && t <= s.end) {
      if (i !== currentIndex) {
        highlightSubtitle(i);
        currentIndex = i;
      }
      return;
    }
  }
}

function highlightSubtitle(i) {
  document.querySelectorAll('.highlighted').forEach(el =>
    el.classList.remove('highlighted')
  );

  const els = document.querySelectorAll(`[data-subtitle-index="${i}"]`);
  els.forEach(el => {
    el.classList.add('highlighted');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function bindWordClickEvents() {
  document.querySelectorAll('.word').forEach(el => {
    el.addEventListener('click', () => {
      const word = el.textContent.trim().toLowerCase();
      const indices = wordToSubtitleMap.get(word);
      if (!indices || indices.size === 0) return;

      const best = chooseNearestSubtitle(indices, el);
      if (best === -1) return;

      highlightSubtitle(best);
      if (audio) {
        audio.currentTime = subtitles[best].start + 0.05;
        audio.play(); // ❗❗❗ 确保播放调用
      }
    });
  });
}

function buildWordToSubtitleMap(subs) {
  const map = new Map();
  subs.forEach((sub, i) => {
    const tokens = tokenizeText(sub.text);
    tokens.forEach(({ word }) => {
      const key = word.toLowerCase();
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(i);
    });
  });
  return map;
}

function chooseNearestSubtitle(indices, clickedEl) {
  const rect = clickedEl.getBoundingClientRect();
  let minDist = Infinity, best = -1;
  for (const i of indices) {
    const els = document.querySelectorAll(`[data-subtitle-index="${i}"]`);
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top - rect.top);
      if (d < minDist) {
        minDist = d;
        best = i;
      }
    });
  }
  return best;
}