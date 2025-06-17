// js/audio/audioPlayer.js (修正版)
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];
let allContentTextNodes = []; // 存储所有可搜索的文本节点

/**
 * 初始化音频播放器，创建音频元素并加载字幕。
 * @param {string} audioSrc - 音频文件路径。
 * @param {string} srtSrc - SRT 字幕文件路径。
 * @param {Array<Object>} [initialSubtitleData] - 可选：如果字幕数据已经加载，可以直接传入。
 */
export async function initAudioPlayer({ audioSrc, srtSrc, initialSubtitleData = null }) {
  // 移除旧的音频播放器（如果有的话），防止重复创建
  const existingAudio = document.querySelector('audio');
  if (existingAudio) {
    existingAudio.remove();
  }

  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;width:90%;max-width:600px;',
  });
  document.body.appendChild(audio);

  // 如果字幕数据已经通过参数传入，则直接使用，否则加载并解析
  if (initialSubtitleData && initialSubtitleData.length > 0) {
    subtitleData = initialSubtitleData;
  } else {
    try {
      const res = await fetch(srtSrc);
      const srtText = await res.text();
      subtitleData = parseSRT(srtText);
    } catch (error) {
      console.error('加载或解析SRT失败:', error);
      return;
    }
  }


  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  
  // 将事件监听器绑定到 body 上，并只处理带有 data-subtitle-id 的元素的点击
  // 这会利用事件冒泡
  document.body.addEventListener('click', handleWordClick);

  // 在初始化时获取所有章节内容中的文本节点，用于高亮
  allContentTextNodes = [];
  const chapterContainer = document.getElementById('chapters');
  if (chapterContainer) {
    const walker = document.createTreeWalker(chapterContainer, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      allContentTextNodes.push(node);
    }
  }


  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    const index = subtitleData.findIndex(
      (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );
    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      clearAllHighlights();
      const { text } = subtitleData[index];
      // 调用 findAndHighlightTextInChapterContent 函数进行高亮
      const highlightedElement = findAndHighlightTextInChapterContent(text);
      if (highlightedElement) {
        requestAnimationFrame(() => highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
    }
  });

  console.log('音频播放器初始化完成。');
}

function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    const words = tokenizeText(subtitle.text.toLowerCase());
    words.forEach(({ word }) => {
      map.push({ word, index: i });
    });
  });
  return map;
}

function handleWordClick(e) {
  // 只处理点击带有 data-subtitle-id 属性的元素
  const targetElement = e.target.closest('[data-subtitle-id]');

  if (targetElement && targetElement.dataset.subtitleId) {
    const subtitleIndex = parseInt(targetElement.dataset.subtitleId, 10);
    
    // 确保点击的 ID 在 subtitleData 范围内
    if (subtitleIndex >= 0 && subtitleIndex < subtitleData.length) {
        const { start, text } = subtitleData[subtitleIndex];
        audio.currentTime = start;
        audio.play();

        clearAllHighlights();
        // 重新高亮点击的文本对应的字幕文本
        const highlightedElement = findAndHighlightTextInChapterContent(text);
        if (highlightedElement) {
            highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
  }
  // 如果没有点击到带有 data-subtitle-id 的元素，则不做任何操作
}


function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      // 检查 el.firstChild 是否存在，以防万一元素已经被清空
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      // parent.normalize() 合并相邻的文本节点，这对于高亮清除很重要
      parent.normalize();
    }
  });
}

/**
 * 在整个章节内容中查找并高亮指定的文本。
 * 返回被高亮的最外层元素（通常是 <p> 或 <div>）。
 * @param {string} targetText - 要查找和高亮的字幕文本。
 * @returns {HTMLElement|null} - 包含高亮文本的最近祖先元素，如果找到并高亮，否则为 null。
 */
function findAndHighlightTextInChapterContent(targetText) {
  const targetLower = targetText.trim().toLowerCase();

  // 遍历所有可搜索的文本节点
  for (const textNode of allContentTextNodes) {
    const text = textNode.nodeValue;
    // 避免高亮已经高亮过的区域或其内部
    if (textNode.parentNode?.classList.contains('highlighted')) {
      continue;
    }

    const index = text.toLowerCase().indexOf(targetLower);
    if (index !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNode, index);
        range.setEnd(textNode, index + targetLower.length);
        const span = document.createElement('span');
        span.className = 'highlighted'; // 这里的 'highlighted' 用于音频播放时的高亮
        range.surroundContents(span);

        // 返回包含高亮span的最接近的父级章节内容元素 (例如 <p>, <div> 等)
        // 向上查找最近的非 'subtitle-click-segment' 或 'highlighted' 的父元素，
        // 确保滚动到的是段落级别而不是内部的小 span
        let currentParent = span.parentNode;
        while (currentParent && !currentParent.id && !currentParent.classList.contains('chapter-content-block')) { 
            // 假设章节的主要内容块有 'chapter-content-block' 类或者是一个 p 标签
            // 或者你需要根据你的章节结构调整这里的条件，例如：
            // currentParent.tagName.toLowerCase() !== 'body' && !['p', 'div', 'h1', 'h2', 'h3'].includes(currentParent.tagName.toLowerCase())
            // 简单起见，可以考虑回到最初的逻辑：找到第一个非 Span 的父元素
            if (currentParent.tagName.toLowerCase() === 'p' || currentParent.tagName.toLowerCase() === 'div' || currentParent.tagName.toLowerCase() === 'h1' || currentParent.tagName.toLowerCase() === 'h2' || currentParent.tagName.toLowerCase() === 'h3') {
                return currentParent;
            }
            currentParent = currentParent.parentNode;
        }
        return currentParent; // 最终返回找到的父元素，如果没找到合适的，可能是 body 或 null
      } catch (e) {
        // console.warn('高亮失败:', e, '文本:', targetText, '节点:', textNode);
        return null;
      }
    }
  }
  return null; // 未找到匹配的文本
}


function computeLevenshteinSimilarity(a, b) {
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}
