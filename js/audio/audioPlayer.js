// js/audio/audioPlayer.js

import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js'; // 保留此导入，尽管在本文件中不直接用于 DOM 词分

let audio; // 存储 audio 元素实例
let subtitleData = []; // 存储所有 SRT 句子数据
let currentSentenceIndex = -1; // 当前正在播放的句子索引
let currentHighlightAnimationFrameId = null; // 用于存储 requestAnimationFrame 的 ID，以便取消
let currentSentenceElement = null; // 当前高亮的句子 DOM 元素

/**
 * 辅助函数：将 SRT 时间格式（00:00:07,760）转换为秒。
 * @param {string} timeString - SRT 格式的时间字符串。
 * @returns {number} 转换后的秒数。
 */
function parseTimeToSeconds(timeString) {
    const parts = timeString.split(/[:,]/);
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    const milliseconds = parseInt(parts[3], 10);
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}


/**
 * 初始化音频播放器。如果播放器已存在，则更新音频和字幕源。
 * @param {Object} options - 配置选项。
 * @param {string} options.audioSrc - 音频文件路径。
 * @param {string} options.srtSrc - SRT 字幕文件路径。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 如果 audio 元素不存在，则创建并添加到 DOM
  // **修正：移除硬编码的 style 属性，这些应该通过 CSS 控制**
  if (!audio) {
    audio = document.createElement('audio');
    audio.controls = true;
    audio.id = 'myAudioPlayer'; // 为 audio 元素添加一个 ID，方便 CSS 选中和全局访问
    // 初始样式，可以通过 CSS 覆盖或在此处设置一个基础类名
    audio.style.width = '90%';
    audio.style.maxWidth = '600px';
    audio.style.display = 'none'; // 默认隐藏，由 showAudioPlayer 控制显示
    document.body.appendChild(audio);

    // 绑定事件监听器 (只绑定一次)
    document.body.addEventListener('click', handleWordClick); // 监听全局点击以便处理单词点击
    audio.addEventListener('timeupdate', handleAudioTimeUpdate);
    audio.addEventListener('pause', clearHighlights);
    audio.addEventListener('ended', clearHighlights);
    audio.addEventListener('seeking', clearHighlights); // 用户拖动进度条时清除高亮
  }

  // 设置新的音频源和加载
  audio.src = audioSrc;
  audio.load(); // 加载新的音频资源

  // 加载并解析字幕
  try {
    const res = await fetch(srtSrc);
    if (!res.ok) {
        throw new Error(`Failed to load SRT: ${res.statusText}`);
    }
    const srtText = await res.text();
    // **修正：parseSRT 假定返回的时间已经是秒数，如果不是，则需要在 parseSRT 内部处理或在这里映射**
    // 假设 parseSRT 返回的每个 entry 都有 { id, start, end, text }，其中 start 和 end 已经是秒数。
    // 如果 parseSRT 返回的时间是字符串格式，则需要在这里手动转换：
    subtitleData = parseSRT(srtText).map(entry => ({
        ...entry,
        start: typeof entry.start === 'string' ? parseTimeToSeconds(entry.start) : entry.start,
        end: typeof entry.end === 'string' ? parseTimeToSeconds(entry.end) : entry.end
    }));
  } catch (err) {
    console.error('SRT 字幕加载或解析失败:', err);
    subtitleData = [];
  }

  // 播放器初始化后，确保立即处理一次高亮（例如，如果页面加载时音频已经在播放某个位置）
  // 确保在音频加载完成后才执行 timeupdate，避免在 src 切换时立即触发
  audio.oncanplaythrough = () => {
    handleAudioTimeUpdate();
    audio.oncanplaythrough = null; // 确保只执行一次
  };
}

/**
 * 显示音频播放器。
 */
export function showAudioPlayer() {
    if (audio) {
        audio.style.display = 'block';
    }
}

/**
 * 隐藏音频播放器并暂停播放。
 */
export function hideAudioPlayer() {
    if (audio) {
        audio.style.display = 'none';
        audio.pause(); // 隐藏时自动暂停
        clearHighlights(); // 隐藏时清除所有高亮
    }
}

/**
 * 处理音频播放时间更新事件，负责同步句子和单词高亮。
 */
function handleAudioTimeUpdate() {
    const currentTime = audio.currentTime;

    // 查找当前时间对应的句子
    let newSentenceIndex = -1;
    for (let i = 0; i < subtitleData.length; i++) {
        const { start, end } = subtitleData[i];
        if (currentTime >= start && currentTime < end) {
            newSentenceIndex = i;
            break;
        }
    }

    // 如果当前句子索引没有变化，且正在高亮，则继续逐词高亮，不做整句切换
    if (newSentenceIndex === currentSentenceIndex && currentHighlightAnimationFrameId !== null) {
        // 修正：即使句子没变，如果音频时间前进，也需要让 highlightWordsInSentence 内部更新单词高亮
        // 因此，我们在这里不再直接返回，而是让 highlightWordsInSentence 内部的 requestAnimationFrame 循环负责持续更新
        if (currentSentenceElement) { // 确保当前句子元素存在才继续高亮逻辑
            highlightWordsInSentence(
                currentSentenceElement,
                subtitleData[currentSentenceIndex].start,
                subtitleData[currentSentenceIndex].end,
                audio
            );
        }
        return; // 不再重复执行下面的句子切换逻辑
    }

    // 如果句子切换了，或者之前没有句子被高亮
    clearHighlights(); // 清除旧的句子高亮和逐词高亮动画

    if (newSentenceIndex !== -1) {
        currentSentenceIndex = newSentenceIndex;
        // 获取当前句子的 DOM 元素
        // **重要：这里假设 chapterRenderer.js 设置的 data-sub-index 与 SRT 的 ID 保持一致，即 SRT ID - 1**
        const sentenceEl = document.querySelector(`.sentence[data-sub-index="${currentSentenceIndex}"]`);

        if (sentenceEl) {
            currentSentenceElement = sentenceEl;
            sentenceEl.classList.add('active-sentence'); // 可选：高亮整个句子

            // 滚动到当前句子视图
            // **修正：只在句子真正切换时才滚动，避免过于频繁的滚动**
            // 注意：因为上面已经判断了 newSentenceIndex !== currentSentenceIndex，这里无需再次判断
            sentenceEl.scrollIntoView({ behavior: 'smooth', block: 'center' });


            // 启动逐词高亮
            highlightWordsInSentence(
                sentenceEl,
                subtitleData[currentSentenceIndex].start,
                subtitleData[currentSentenceIndex].end,
                audio
            );
        }
    } else {
        currentSentenceIndex = -1; // 当前时间不在任何句子范围内
    }
}

/**
 * 清除所有高亮效果。
 */
function clearHighlights() {
    // 清除逐词高亮动画
    if (currentHighlightAnimationFrameId) {
        cancelAnimationFrame(currentHighlightAnimationFrameId);
        currentHighlightAnimationFrameId = null;
    }

    // 移除所有单词的高亮类
    // **修正：只移除当前 sentenceElement 中的单词高亮，更高效**
    if (currentSentenceElement) {
        Array.from(currentSentenceElement.querySelectorAll('.word')).forEach(wordEl => {
            wordEl.classList.remove('highlight');
        });
    } else {
        // Fallback for cases where currentSentenceElement might be null but some words are highlighted
        document.querySelectorAll('.word.highlight').forEach(wordEl => {
            wordEl.classList.remove('highlight');
        });
    }


    // 移除所有句子的高亮类
    document.querySelectorAll('.sentence.active-sentence').forEach(sentenceEl => {
        sentenceEl.classList.remove('active-sentence');
    });

    currentSentenceElement = null; // 清除当前句子元素引用
}

/**
 * 处理单词点击事件：跳转到对应的句子并播放。
 * @param {Event} e - 点击事件对象。
 */
function handleWordClick(e) {
  const target = e.target;
  // 确保点击的是带有 'word' 类的元素
  if (target && target.classList.contains('word')) {
    const parentSentence = target.closest('.sentence');
    if (parentSentence) {
      // **修正：data-sub-index 在 chapterRenderer 中是基于 0 的索引，对应 SRT 的 id - 1**
      const subIndex = parseInt(parentSentence.dataset.subIndex, 10);
      // **重要：确保 chapterRenderer.js 为 .sentence 元素设置了 data-start-time 属性**
      const startTime = parseFloat(parentSentence.dataset.startTime);

      if (!isNaN(startTime) && subtitleData[subIndex]) {
        audio.currentTime = startTime;
        audio.play();
        // 确保高亮立即更新
        handleAudioTimeUpdate();
      } else {
        console.warn('点击的单词或句子缺少有效的跳转时间或字幕数据:', target, parentSentence);
      }
    }
  }
}

/**
 * 逐词高亮函数：根据单词长度加权分配高亮时长。
 * @param {HTMLElement} sentenceEl - 当前高亮的句子 DOM 元素。
 * @param {number} sentenceStartTime - 句子的开始时间（秒）。
 * @param {number} sentenceEndTime - 句子的结束时间（秒）。
 * @param {HTMLAudioElement} audioEl - 音频元素。
 */
function highlightWordsInSentence(sentenceEl, sentenceStartTime, sentenceEndTime, audioEl) {
    // 确保每次启动新的高亮时，都清除之前的动画
    if (currentHighlightAnimationFrameId) {
        cancelAnimationFrame(currentHighlightAnimationFrameId);
        currentHighlightAnimationFrameId = null;
    }

    // **修正：先清除当前句子的所有单词高亮，避免残留**
    Array.from(sentenceEl.querySelectorAll('.word')).forEach(w => w.classList.remove('highlight'));


    const words = Array.from(sentenceEl.querySelectorAll('.word'));
    const totalSentenceDuration = sentenceEndTime - sentenceStartTime;

    // 如果句子没有单词或持续时间为零，则不进行逐词高亮
    if (words.length === 0 || totalSentenceDuration <= 0) {
        return;
    }

    // 1. 计算每个单词的字符长度，并累加得到总字符长度
    let totalChars = 0;
    const wordLengths = words.map(wordEl => {
        const text = wordEl.textContent.trim();
        // 进一步优化：可以去除单词中的非字母数字字符（如标点）再计算长度
        // 修正：更宽泛地匹配字母和数字，避免中文等字符被过滤
        const cleanText = text.replace(/[\W_]/g, ''); // 移除所有非单词字符 (包括标点和下划线)
        totalChars += cleanText.length;
        return cleanText.length;
    });

    // 定义 wordStartTimes 变量，它将在两种情况下被赋值
    const wordStartTimes = [];
    let currentWordHighlightIndex = -1; // 记录当前高亮的单词索引

    if (totalChars === 0) {
        // 如果所有单词的“有效”字符长度为零（例如，全是标点），则平均分配时间
        const averageDuration = totalSentenceDuration / words.length;
        const minDurationPerWord = Math.max(0.05, averageDuration); // 至少50ms，防止过短
        let cumulativeTimeAvg = sentenceStartTime;
        for (let i = 0; i < words.length; i++) {
            wordStartTimes.push(cumulativeTimeAvg);
            cumulativeTimeAvg += minDurationPerWord;
        }
        wordStartTimes.push(sentenceEndTime); // 确保最后一个时间点是句子结束时间
    } else {
        // 2. 计算每个单词的起始高亮时间点（基于字符长度加权）
        let cumulativeTime = sentenceStartTime;
        for (let i = 0; i < words.length; i++) {
            wordStartTimes.push(cumulativeTime);
            const wordDuration = (wordLengths[i] / totalChars) * totalSentenceDuration;
            cumulativeTime += wordDuration;
        }
        // 最后一个单词的结束时间，用于判断是否结束。注意：这里的最后一个时间点是句子结束时间。
        wordStartTimes.push(sentenceEndTime);
    }


    const animateHighlight = () => {
        const currentTime = audioEl.currentTime;

        // 如果音频时间超出当前句子范围，或音频已暂停/结束，停止动画
        if (
            !audioEl || audioEl.paused || audioEl.ended ||
            currentTime < sentenceStartTime || currentTime >= sentenceEndTime
        ) {
            clearHighlights(); // 清除所有高亮
            return;
        }

        // 找到当前时间对应的单词索引
        let nextWordIndex = -1;
        // 修正：wordStartTimes 的长度比 words 多 1，循环条件是 words.length
        for (let i = 0; i < words.length; i++) {
            if (currentTime >= wordStartTimes[i] && currentTime < wordStartTimes[i + 1]) {
                nextWordIndex = i;
                break;
            }
        }

        // 如果当前高亮的单词发生变化，则更新高亮状态
        if (nextWordIndex !== -1 && nextWordIndex !== currentWordHighlightIndex) {
            // 移除旧的高亮
            if (currentWordHighlightIndex !== -1 && words[currentWordHighlightIndex]) {
                words[currentWordHighlightIndex].classList.remove('highlight');
            }
            // 添加新的高亮
            if (words[nextWordIndex]) {
                words[nextWordIndex].classList.add('highlight');
            }
            currentWordHighlightIndex = nextWordIndex;
        }

        currentHighlightAnimationFrameId = requestAnimationFrame(animateHighlight);
    };

    // 启动动画循环
    currentHighlightAnimationFrameId = requestAnimationFrame(animateHighlight);
}
