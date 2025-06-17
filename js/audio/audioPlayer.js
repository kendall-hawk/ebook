// js/audio/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';
// 可以根据需要引入字符串相似度库，例如：
// import { compareTwoStrings } from 'https://cdn.jsdelivr.net/npm/string-similarity/dist/index.mjs';

// 音频元素、SRT 数据、文章转录稿段落DOM元素
let audio, subtitleData = [], articleParagraphs = [];
// 用于跟踪当前高亮的段落DOM元素
let currentHighlightedParagraph = null;

/**
 * 初始化音频播放器。
 * @param {{audioSrc: string, srtSrc: string}} options - 包含音频和 SRT 文件路径的选项。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 1. 初始化或获取音频播放器元素
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
  }

  audio.src = audioSrc; // 设置新的音频源

  // 2. 解析 .srt 文件
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
    console.log('SRT 数据已加载:', subtitleData.length, '条');
  } catch (error) {
    console.error('加载或解析 SRT 文件失败:', error);
    subtitleData = []; // 清空数据以防止旧数据影响
  }

  // 3. 添加 timeupdate 监听器（如果未添加过）
  // 确保只添加一次监听器
  if (!audio._hasTimeupdateListener) {
      audio.addEventListener('timeupdate', updateCurrentHighlight);
      audio.addEventListener('ended', clearHighlights); // 播放结束时清除高亮
      audio._hasTimeupdateListener = true;
  }

  // 4. 初始化时更新文章段落列表（确保 DOM 已渲染）
  // 这一步最好在 chapterRenderer 渲染内容完成后调用
  // 所以在 main.js 中，需要在 renderSingleChapterContent 之后调用 updateArticleParagraphs
}

/**
 * 更新 `articleParagraphs` 列表。
 * 在章节内容加载/渲染后，特别是当 `.transcript-paragraph` 元素被添加到 DOM 后，
 * 必须调用此函数以确保 `audioPlayer` 引用的是最新的 DOM 元素。
 */
export function updateArticleParagraphs() {
    // 获取所有带有 'transcript-paragraph' 类的 DOM 元素
    articleParagraphs = Array.from(document.querySelectorAll('.transcript-paragraph'));
    console.log('AudioPlayer: 更新了转录稿段落列表。总数:', articleParagraphs.length);
}

/**
 * 当音频播放时，更新当前高亮的文章段落。
 * 此函数作为 `audio` 元素的 `timeupdate` 事件回调。
 */
function updateCurrentHighlight() {
    if (!audio || !subtitleData.length || articleParagraphs.length === 0) {
        clearHighlights(); // 没有数据或元素时清除高亮
        return;
    }

    const currentTime = audio.currentTime;
    let newSubtitleText = null; // 当前时间对应的 SRT 字幕文本

    // 找到当前时间所在的 SRT 字幕块
    for (let i = 0; i < subtitleData.length; i++) {
        // 如果当前时间在字幕块的开始和结束时间之间
        if (currentTime >= subtitleData[i].start && currentTime <= subtitleData[i].end) {
            newSubtitleText = subtitleData[i].text;
            break;
        }
    }

    // 如果没有找到新的字幕，或者当前字幕文本未变，则不更新高亮
    // (这里可以优化为：如果 newSubtitleText 与上次匹配的字幕文本相同，则不更新)
    if (!newSubtitleText) {
        clearHighlights(); // 没有匹配的字幕时清除高亮
        return;
    }

    // 找到与当前 SRT 字幕文本最匹配的文章段落
    const bestMatchingParagraph = findBestMatchingArticleParagraph(newSubtitleText);

    // 如果找到新的匹配段落，并且它与当前高亮的段落不同
    if (bestMatchingParagraph && bestMatchingParagraph !== currentHighlightedParagraph) {
        clearHighlights(); // 清除旧高亮
        // 给整个段落添加高亮类
        bestMatchingParagraph.classList.add('highlighted-paragraph');
        // 同时高亮段落内的所有单词
        Array.from(bestMatchingParagraph.querySelectorAll('.transcript-word')).forEach(wordSpan => {
            wordSpan.classList.add('highlighted');
        });
        currentHighlightedParagraph = bestMatchingParagraph; // 更新当前高亮的段落
    } else if (!bestMatchingParagraph && currentHighlightedParagraph) {
        // 如果没有找到匹配段落，但之前有高亮，则清除高亮
        clearHighlights();
    }
}

/**
 * 清除所有当前的高亮效果。
 */
function clearHighlights() {
    if (currentHighlightedParagraph) {
        currentHighlightedParagraph.classList.remove('highlighted-paragraph'); // 移除段落高亮
        // 移除段落内所有单词的高亮
        Array.from(currentHighlightedParagraph.querySelectorAll('.transcript-word')).forEach(wordSpan => {
            wordSpan.classList.remove('highlighted');
        });
    }
    currentHighlightedParagraph = null; // 重置当前高亮段落
}

/**
 * 查找与给定 SRT 文本最匹配的文章段落 DOM 元素。
 * @param {string} srtText - 当前 SRT 字幕文本。
 * @returns {HTMLElement | null} - 最佳匹配的段落 DOM 元素，或 null 如果没有找到。
 */
function findBestMatchingArticleParagraph(srtText) {
    if (articleParagraphs.length === 0) return null;

    // 清理 SRT 文本，去除换行符并转为小写，以便匹配
    const cleanedSrtText = srtText.replace(/\n/g, ' ').trim().toLowerCase();

    // 简单匹配策略：查找包含 SRT 文本的第一个文章段落
    // 对于非逐字稿，可能需要更复杂的字符串相似度算法
    for (const paragraph of articleParagraphs) {
        const paragraphPlainText = paragraph.innerText.trim().toLowerCase();
        if (paragraphPlainText.includes(cleanedSrtText)) {
            return paragraph;
        }
        // 如果要使用字符串相似度库，可以这样：
        // const similarity = compareTwoStrings(cleanedSrtText, paragraphPlainText);
        // if (similarity > someThreshold) { return paragraph; }
    }
    return null; // 没有找到匹配段落
}

/**
 * 查找与给定文章段落文本最匹配的 SRT 字幕，并跳转到其开始时间。
 * 这是供 `chapterRenderer.js` 中单词点击事件调用的公共方法。
 * @param {string} articleParagraphText - 用户点击单词所属的整个文章段落的纯文本内容。
 */
export function findAndJumpToSubtitle(articleParagraphText) {
    if (!audio || !subtitleData.length) return;

    // 清理文章段落文本
    const cleanedArticleText = articleParagraphText.replace(/\n/g, ' ').trim().toLowerCase();
    let bestMatchSrt = null;
    // let maxSimilarity = 0; // 如果使用相似度算法

    // 遍历所有 SRT 字幕，寻找最佳匹配
    for (const subtitle of subtitleData) {
        const cleanedSrtText = subtitle.text.replace(/\n/g, ' ').trim().toLowerCase();

        // 匹配策略：
        // 1. 如果文章段落文本完整包含 SRT 字幕文本，这是一个很好的匹配。
        if (cleanedArticleText.includes(cleanedSrtText)) {
            bestMatchSrt = subtitle;
            break; // 找到第一个精确包含的就足够了
        }
        // 2. 如果 SRT 字幕文本完整包含文章段落文本，也是一个很好的匹配。
        if (cleanedSrtText.includes(cleanedArticleText)) {
            bestMatchSrt = subtitle;
            // 不立即跳出，因为它可能不是最精确的起始点，但至少是一个匹配
            // 如果追求最精准的 "包含"，这块逻辑需要设计得更复杂，比如优先最短的包含
            // 或者继续遍历，找到包含度更高的
        }

        // 3. 如果使用字符串相似度库 (string-similarity)：
        // const similarity = compareTwoStrings(cleanedArticleText, cleanedSrtText);
        // if (similarity > maxSimilarity && similarity > 0.6) { // 设置一个阈值
        //     maxSimilarity = similarity;
        //     bestMatchSrt = subtitle;
        // }
    }

    if (bestMatchSrt) {
        audio.currentTime = bestMatchSrt.start; // 跳转到匹配 SRT 的开始时间
        audio.play(); // 播放音频
        updateCurrentHighlight(); // 立即更新高亮
        console.log('AudioPlayer: 跳转到 SRT 字幕:', bestMatchSrt.text, '时间:', bestMatchSrt.start);
    } else {
        console.warn('AudioPlayer: 未找到与文章段落最匹配的 SRT 字幕进行跳转:', articleParagraphText);
    }
}

// 将 audioPlayer 的核心公共函数暴露到 window 对象，以便在其他模块中调用
// 建议在 main.js 中导入并初始化 audioPlayer，而不是直接挂载到 window
// 但为了方便你调试，这里仍挂载：
window.audioPlayer = {
    initAudioPlayer,
    updateArticleParagraphs, // 暴露给 chapterRenderer 调用以更新段落列表
    findAndJumpToSubtitle // 暴露给 chapterRenderer 调用以实现点击跳转
};

