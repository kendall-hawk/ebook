// js/audio/audioPlayer.js

import { parseSRT } from './srtParser.js';
// import { tokenizeText } from './tokenizer.js'; // 不再直接在此文件中调用 tokenizeText

let audio;
let subtitleData = []; // 存储所有字幕数据，现在包含单词信息
let currentHighlightedSentenceElement = null; // 用于跟踪当前高亮的句子元素
let currentHighlightedWordElement = null; // 用于跟踪当前高亮的单词元素
let lastHighlightedSubtitleId = null; // 跟踪上一个高亮的字幕ID
let lastHighlightedWordId = null; // 跟踪上一个高亮的单词ID

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

    // 监听时间更新事件，这是高亮的核心
    audio.addEventListener('timeupdate', handleTimeUpdate);
    // 监听暂停和结束事件，用于清除高亮
    audio.addEventListener('pause', clearAllHighlights);
    audio.addEventListener('ended', clearAllHighlights);

    // 监听全局点击事件，用于单词点击跳转播放
    // 注意：这里的点击事件现在直接在 .word-highlightable 上监听，而不是 document.body
    document.addEventListener('click', handleWordClick);
  }

  audio.src = audioSrc;
  audio.load();

  // 加载并解析字幕
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText); // srtParser.js 现在会返回包含单词信息的数据
    console.log('字幕加载并解析成功:', subtitleData);
  } catch (err) {
    console.error('字幕加载失败:', err);
    subtitleData = [];
  }
}

// 建立单词到字幕索引的映射 (此函数可能不再需要，因为我们现在通过 DOM ID 直接查找)
// 但如果您仍需要通过文本内容进行匹配（例如点击的不是特定高亮元素），可以保留或修改
// function buildWordToSubtitleMap(subs) { ... }


// 点击词时播放对应句子音频
function handleWordClick(e) {
  const target = e.target;
  // 确保点击的是一个可高亮的单词元素
  if (!target || !target.classList.contains('word-highlightable') || !target.textContent || !subtitleData.length) {
    return;
  }

  // 从点击的单词元素上获取其所属的句子ID (data-sentence-id)
  const sentenceElement = target.closest('.sentence-container');
  if (!sentenceElement) return;

  const clickedSentenceId = sentenceElement.dataset.sentenceId;
  const clickedWordText = target.textContent.trim().toLowerCase();

  // 找到对应的字幕数据
  const matchedSubtitle = subtitleData.find(sub => sub.id === clickedSentenceId);

  if (matchedSubtitle) {
    // 尝试找到点击的单词在 matchedSubtitle.words 数组中的对应项
    // 可以通过文本匹配和原始索引（如果需要更精确）
    const clickedWordData = matchedSubtitle.words.find(word => word.word.toLowerCase() === clickedWordText);

    if (clickedWordData) {
      // 将音频当前时间设置为字幕开始时间 + 单词的相对偏移
      audio.currentTime = matchedSubtitle.start + clickedWordData.startOffset;
      audio.play();
    } else {
        // 如果找不到精确的单词，退回到播放整个句子
        audio.currentTime = matchedSubtitle.start;
        audio.play();
    }
  }
}


// --- 新增高亮逻辑 ---

function handleTimeUpdate() {
  const currentTime = audio.currentTime;
  let currentSubtitle = null;
  let currentWordInSubtitle = null;

  // 1. 找到当前时间点对应的字幕 (句子)
  for (let i = 0; i < subtitleData.length; i++) {
    const sub = subtitleData[i];
    if (currentTime >= sub.start && currentTime < sub.end) {
      currentSubtitle = sub;

      // 2. 找到当前句子中对应的单词
      if (sub.words) {
        // 计算当前时间相对于字幕开始时间的偏移
        const timeOffsetInSubtitle = currentTime - sub.start;
        for (const word of sub.words) {
          if (timeOffsetInSubtitle >= word.startOffset && timeOffsetInSubtitle < word.endOffset) {
            currentWordInSubtitle = word;
            break; // 找到单词就退出循环
          }
        }
      }
      break; // 找到字幕就退出循环
    }
  }

  // 3. 更新句子高亮
  if (currentSubtitle && currentSubtitle.id !== lastHighlightedSubtitleId) {
    highlightSentence(currentSubtitle.id);
    lastHighlightedSubtitleId = currentSubtitle.id;
  } else if (!currentSubtitle && lastHighlightedSubtitleId) {
    // 如果当前没有字幕在播放，且之前有高亮的字幕，则清除句子高亮
    clearSentenceHighlight();
    lastHighlightedSubtitleId = null;
  }

  // 4. 更新单词高亮 (只在高亮的句子内部进行)
  if (currentWordInSubtitle && currentWordInSubtitle.id !== lastHighlightedWordId) {
    highlightWord(currentWordInSubtitle.id);
    lastHighlightedWordId = currentWordInSubtitle.id;
  } else if (!currentWordInSubtitle && lastHighlightedWordId) {
    // 如果当前没有单词高亮，且之前有高亮的单词，则清除单词高亮
    clearWordHighlight();
    lastHighlightedWordId = null;
  }
}

function clearAllHighlights() {
  clearSentenceHighlight();
  clearWordHighlight();
  lastHighlightedSubtitleId = null;
  lastHighlightedWordId = null;
}

function clearSentenceHighlight() {
  if (currentHighlightedSentenceElement) {
    currentHighlightedSentenceElement.classList.remove('highlight-sentence');
    currentHighlightedSentenceElement = null;
  }
}

function clearWordHighlight() {
  if (currentHighlightedWordElement) {
    currentHighlightedWordElement.classList.remove('highlight-word');
    currentHighlightedWordElement = null;
  }
}


function highlightSentence(sentenceId) {
  clearSentenceHighlight(); // 先清除之前的句子高亮

  // 通过 data-sentence-id 查找 DOM 元素
  const sentenceElement = document.querySelector(`[data-sentence-id="${sentenceId}"]`);

  if (sentenceElement) {
    sentenceElement.classList.add('highlight-sentence');
    currentHighlightedSentenceElement = sentenceElement;
    // 滚动到视图中，平滑滚动
    sentenceElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}


function highlightWord(wordId) {
  clearWordHighlight(); // 先清除之前的单词高亮

  // 通过 data-word-id 查找 DOM 元素
  const wordElement = document.querySelector(`[data-word-id="${wordId}"]`);

  if (wordElement) {
    wordElement.classList.add('highlight-word');
    currentHighlightedWordElement = wordElement;
  }
}
