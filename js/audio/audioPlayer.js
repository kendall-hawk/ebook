// js/audio/audioPlayer.js (Jaro-Winkler 弹性匹配版 - 优化后)
import { parseSRT } from './srtParser.js';
// import { tokenizeText } from './tokenizer.js'; // 暂时不需要 tokenizer.js 了，如果后续需要更细粒度的点击，可以再引入

let audio, subtitleData = [];
let allContentTextNodes = []; // 存储所有可搜索的文本节点

/**
 * Initializes the audio player, creates the audio element, and loads subtitles.
 * @param {string} audioSrc - Path to the audio file.
 * @param {string} srtSrc - Path to the SRT subtitle file.
 * @param {Array<Object>} [initialSubtitleData] - Optional: If subtitle data is already loaded, it can be passed directly.
 */
export async function initAudioPlayer({ audioSrc, srtSrc, initialSubtitleData = null }) {
  // Remove existing audio player (if any) to prevent duplication
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

  // Use provided subtitle data if available, otherwise load and parse
  if (initialSubtitleData && initialSubtitleData.length > 0) {
    subtitleData = initialSubtitleData;
  } else {
    try {
      const res = await fetch(srtSrc);
      const srtText = await res.text();
      subtitleData = parseSRT(srtText);
      console.log('SRT data loaded and parsed:', subtitleData.length, 'entries');
    } catch (error) {
      console.error('Failed to load or parse SRT:', error);
      return;
    }
  }

  // Bind click event to document.body to handle user clicks for seeking
  // 仅监听带有 data-subtitle-id 或 subtitle-click-segment 类的元素
  document.body.addEventListener('click', handleWordClick);

  // Collect all text nodes within the #chapters container for highlighting and click lookup
  // 现在不再需要收集所有文本节点，因为高亮和点击都基于 subtitleData 和预标记的元素
  // allContentTextNodes 仅用于 findAndHighlightTextInChapterContent，该函数现在只负责高亮
  allContentTextNodes = []; // 每次初始化时清空
  const chapterContainer = document.getElementById('chapters');
  if (chapterContainer) {
    const walker = document.createTreeWalker(chapterContainer, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
          allContentTextNodes.push(node);
      }
    }
    console.log('Collected allContentTextNodes:', allContentTextNodes.length);
  } else {
    console.warn('#chapters container not found. Text highlighting may not work.');
  }

  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    const index = subtitleData.findIndex(
      (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );
    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      clearAllHighlights(); // 清除所有旧高亮

      // 获取当前字幕文本，用于高亮
      const { text: currentSubtitleText } = subtitleData[index];
      // 高亮对应当前字幕的文本
      const highlightedElement = findAndHighlightTextInChapterContent(currentSubtitleText);
      if (highlightedElement) {
        requestAnimationFrame(() => highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
    }
  });

  console.log('Audio player initialized and ready.');
}

/**
 * Handles click events on the document body to seek audio.
 * Now primarily relies on pre-marked data-subtitle-id attributes.
 */
function handleWordClick(e) {
    let targetElement = e.target;
    // 向上查找最近的带有 data-subtitle-id 的元素
    while (targetElement && targetElement !== document.body) {
        if (targetElement.dataset.subtitleId) {
            const subtitleId = parseInt(targetElement.dataset.subtitleId, 10); // 获取唯一的字幕ID
            if (!isNaN(subtitleId) && subtitleId < subtitleData.length) {
                const { start, text: matchedSubtitleText } = subtitleData[subtitleId];
                audio.currentTime = start;
                audio.play();

                clearAllHighlights();
                // 重新高亮匹配到的字幕文本，确保用户看到高亮
                const highlightedElement = findAndHighlightTextInChapterContent(matchedSubtitleText);
                if (highlightedElement) {
                    highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return; // 成功处理点击，退出
            }
        }
        targetElement = targetElement.parentNode;
    }
    // 如果没有找到带有 data-subtitle-id 的元素，则不执行任何操作
    // console.log("Clicked element or its parent does not have a data-subtitle-id.");
}


/**
 * Clears all currently highlighted text elements.
 */
function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      // Check if el.firstChild exists to prevent issues if the element is already emptied
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      // parent.normalize() merges adjacent text nodes, important for clean highlight removal
      parent.normalize();
    }
  });
}

/**
 * Finds and highlights the specified text within the entire chapter content.
 * Returns the outermost element that was highlighted (typically a <p> or <div>).
 * @param {string} targetText - The subtitle text to find and highlight.
 * @returns {HTMLElement|null} - The nearest ancestor element containing the highlighted text, or null if not found and highlighted.
 */
function findAndHighlightTextInChapterContent(targetText) {
  const targetLower = targetText.trim().toLowerCase();

  // Iterate through all searchable text nodes
  for (const textNode of allContentTextNodes) {
    const text = textNode.nodeValue;
    // Avoid highlighting already highlighted areas or inside them
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
        span.className = 'highlighted'; // 'highlighted' class for audio playback highlighting
        range.surroundContents(span);

        // Find the nearest paragraph or block-level element for scrolling
        let currentParent = span.parentNode;
        while (currentParent && currentParent !== document.getElementById('chapters') && !['P', 'DIV', 'H1', 'H2', 'H3'].includes(currentParent.tagName)) {
             currentParent = currentParent.parentNode;
        }
        return currentParent;
      } catch (e) {
        console.warn('Highlighting failed (findAndHighlightTextInChapterContent):', e, 'Text:', targetText, 'Node:', textNode);
        return null;
      }
    }
  }
  return null; // Text not found
}

// Jaro-Winkler 相似度计算函数仍然保留，但现在只用于 chapterRenderer.js 的初始化标记
// 并且在 audioPlayer.js 中不再直接使用
// function computeJaroWinklerSimilarity(...) { ... }
