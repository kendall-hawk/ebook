// js/audio/audioPlayer.js (弹性匹配版)
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [];
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

  // 绑定点击事件，处理用户点击跳转
  document.body.addEventListener('click', handleWordClick);

  // 在初始化时获取所有章节内容中的文本节点，用于高亮和点击查找
  allContentTextNodes = [];
  const chapterContainer = document.getElementById('chapters');
  if (chapterContainer) {
    const walker = document.createTreeWalker(chapterContainer, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      // 过滤掉空的或只有空白的文本节点
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
          allContentTextNodes.push(node);
      }
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


function handleWordClick(e) {
    // 找到点击位置附近的文本内容
    const clickedElement = e.target;
    const { textContent: clickedTextSnippet, containerElement } = findTextElementNearCoords(e.clientX, e.clientY, clickedElement);

    if (!clickedTextSnippet || clickedTextSnippet.trim().length < 5) { // 至少5个字符以避免点击空白或单个字符
        return;
    }

    // 在 SRT 数据中找到与点击文本片段最匹配的字幕
    const bestMatchIndex = findBestSubtitleMatch(clickedTextSnippet, containerElement);

    if (bestMatchIndex !== null) {
        const { start, text: matchedSubtitleText } = subtitleData[bestMatchIndex];
        audio.currentTime = start;
        audio.play();

        clearAllHighlights();
        // 再次高亮匹配到的字幕文本，以确保用户看到跳转后的高亮
        const highlightedElement = findAndHighlightTextInChapterContent(matchedSubtitleText);
        if (highlightedElement) {
            highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        // 如果没有找到好的匹配，则不做任何操作
        // console.log("No good subtitle match found for clicked text:", clickedTextSnippet);
    }
}

/**
 * 根据坐标和点击元素，向上查找包含文本的元素，并提取其内容。
 * @param {number} clientX - 点击事件的 X 坐标。
 * @param {number} clientY - 点击事件的 Y 坐标。
 * @param {HTMLElement} clickedElement - 实际被点击的 DOM 元素。
 * @returns {{textContent: string, containerElement: HTMLElement}} - 提取的文本内容和包含该文本的元素。
 */
function findTextElementNearCoords(clientX, clientY, clickedElement) {
    // 尝试从点击的元素开始，向上查找一个合适的文本容器（例如P标签或DIV）
    let currentElement = clickedElement;
    let textToAnalyze = '';
    let container = null;

    while (currentElement && currentElement !== document.body) {
        if (currentElement.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'LI'].includes(currentElement.tagName)) {
            // 提取该元素的所有文本内容，或者限制在一个合理的长度
            textToAnalyze = currentElement.textContent || '';
            container = currentElement;
            // 如果文本够长，或者已经找到一个段落级元素，就停止向上查找
            if (textToAnalyze.length > 50 || currentElement.tagName === 'P' || currentElement.tagName === 'DIV') {
                break;
            }
        }
        currentElement = currentElement.parentNode;
    }

    // 如果没有找到合适的容器，或者文本过短，退而求其次从 body 抓取
    if (!container || textToAnalyze.length < 5) {
        // 尝试获取点击点附近的少量文本
        const range = document.caretRangeFromPoint(clientX, clientY);
        if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = range.startContainer;
            const fullText = textNode.nodeValue || '';
            const start = Math.max(0, range.startOffset - 20); // 获取点击点前20字符
            const end = Math.min(fullText.length, range.startOffset + 80); // 获取点击点后80字符
            textToAnalyze = fullText.substring(start, end);
            container = textNode.parentNode; // 文本节点的父元素
        } else {
             textToAnalyze = clickedElement.textContent || ''; // 最终 fallback 到点击元素的文本
             container = clickedElement;
        }
    }

    return { textContent: textToAnalyze.trim(), containerElement: container };
}

/**
 * 在 SRT 数据中，找到与给定文本片段最相似的字幕条目。
 * @param {string} clickedTextSnippet - 用户点击位置提取的文本片段。
 * @param {HTMLElement} clickedTextContainer - 包含点击文本的 DOM 容器元素。
 * @returns {number|null} - 最佳匹配字幕的索引，如果没有找到则为 null。
 */
function findBestSubtitleMatch(clickedTextSnippet, clickedTextContainer) {
    if (!clickedTextSnippet || subtitleData.length === 0) {
        return null;
    }

    const clickedTextLower = clickedTextSnippet.toLowerCase();
    let bestIndex = null;
    let highestScore = -Infinity;
    const clickedElementRect = clickedTextContainer ? clickedTextContainer.getBoundingClientRect() : null;
    const clickedElementTop = clickedElementRect ? clickedElementRect.top + window.scrollY : null;

    for (let i = 0; i < subtitleData.length; i++) {
        const subtitle = subtitleData[i];
        const subtitleTextLower = subtitle.text.toLowerCase();

        // 1. 文本相似度 (使用 Jaro-Winkler 更好，这里继续用 Levenshtein 作为示例)
        const textSimilarity = computeLevenshteinSimilarity(clickedTextLower, subtitleTextLower);

        // 如果相似度太低，直接跳过
        if (textSimilarity < 0.2) continue; // 阈值可以调整

        // 2. 空间接近度 (根据字幕在页面上的渲染位置)
        let proximityScore = 0;
        if (clickedElementTop !== null) {
            // 找到包含当前 SRT 字幕文本的最近 DOM 元素，用作空间接近度计算
            const subtitleDomElement = findDomElementForSubtitleText(subtitle.text);
            if (subtitleDomElement) {
                const subtitleDomRect = subtitleDomElement.getBoundingClientRect();
                const subtitleDomTop = subtitleDomRect.top + window.scrollY;
                const distance = Math.abs(subtitleDomTop - clickedElementTop);
                const maxDist = window.innerHeight * 2; // 考虑两屏的距离作为最大距离
                proximityScore = 1 - Math.min(distance / maxDist, 1);
            }
        } else {
            // 如果无法获取点击元素的offsetTop (比如点击到非文本元素)，则只依赖文本相似度
            proximityScore = 0.5; // 赋予一个中等值，表示位置未知
        }


        // 综合得分：文本相似度权重更高
        // 调整权重以满足“弹性”需求，文本相似度更重要
        const combinedScore = textSimilarity * 0.7 + proximityScore * 0.3;

        if (combinedScore > highestScore) {
            highestScore = combinedScore;
            bestIndex = i;
        }
    }
    
    // 如果最高分低于某个阈值，则认为没有好的匹配
    if (highestScore < 0.3) { // 再次调整阈值，防止低质量匹配
        return null;
    }

    return bestIndex;
}

/**
 * 在 DOM 中找到一个包含指定 SRT 文本的元素。
 * 用于计算空间接近度，这是一个相对昂贵的操作，应谨慎使用。
 * @param {string} srtText - SRT 字幕的原始文本。
 * @returns {HTMLElement|null} - 找到的包含文本的 DOM 元素。
 */
function findDomElementForSubtitleText(srtText) {
    const srtTextLower = srtText.toLowerCase();
    // 遍历所有可搜索的文本节点，找到第一个包含该 SRT 文本的父元素
    for (const textNode of allContentTextNodes) {
        if (textNode.nodeValue && textNode.nodeValue.toLowerCase().includes(srtTextLower)) {
            // 返回文本节点的父元素，通常是一个 <p>, <span> 或 <div>
            return textNode.parentNode;
        }
    }
    return null;
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

        // 向上查找最近的段落或块级元素进行滚动
        let currentParent = span.parentNode;
        while (currentParent && currentParent !== document.getElementById('chapters') && !['P', 'DIV', 'H1', 'H2', 'H3'].includes(currentParent.tagName)) {
             currentParent = currentParent.parentNode;
        }
        return currentParent;
      } catch (e) {
        console.warn('高亮失败:', e, '文本:', targetText, '节点:', textNode);
        return null;
      }
    }
  }
  return null; // 未找到匹配的文本
}


/**
 * 计算两个字符串之间的 Levenshtein 相似度。
 * 值介于 0 到 1 之间，1 表示完全相同。
 * @param {string} a - 字符串 A。
 * @param {string} b - 字符串 B。
 * @returns {number} 相似度分数。
 */
function computeLevenshteinSimilarity(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n === 0 ? 1 : 0; // 如果A为空，B也为空则相似度1，否则0
  if (n === 0) return m === 0 ? 1 : 0; // 同理

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = (a[i - 1] === b[j - 1]) ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const dist = dp[m][n];
  const maxLength = Math.max(m, n);
  return 1 - dist / maxLength; // 将距离转换为相似度
}

