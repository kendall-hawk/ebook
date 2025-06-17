import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';
import { computeLevenshteinSimilarity } from './levenshtein.js'; // 确保这个文件存在并能正确导出函数

let audio, subtitleData = [], wordToSubtitleMap = [];

/**
 * 初始化音频播放器
 * @param {object} options - 配置选项。
 * @param {string} options.audioSrc - 音频文件的 URL。
 * @param {string} options.srtSrc - SRT 字幕文件的 URL。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 1. 确保样式被注入到页面中
  injectHighlightStyles();

  // 2. 创建并配置音频播放器
  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      width: 90%;
      max-width: 600px;
    `
  });
  document.body.appendChild(audio);

  // 3. 加载并解析 SRT 字幕
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
    console.log('字幕数据加载成功:', subtitleData); // 调试用
  } catch (err) {
    console.error('加载或解析SRT文件失败:', err);
    return;
  }

  // 4. 构建词到字幕的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  console.log('词到字幕映射构建完成:', wordToSubtitleMap); // 调试用

  // 5. 注册点击事件监听器
  document.body.addEventListener('click', handleWordClick);

  // 6. 监听音频播放进度，自动高亮当前字幕
  let lastIndex = -1;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    const index = subtitleData.findIndex(
      (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );

    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      console.log(`当前播放字幕索引: ${index}, 文本: "${subtitleData[index].text}"`); // 调试用

      clearHighlights(); // 清除所有旧高亮

      const currentSubtitleText = subtitleData[index].text;
      const el = findVisibleTextNodeNearText(currentSubtitleText);
      
      if (el) {
        console.log('找到匹配的DOM元素进行高亮:', el); // 调试用
        highlightTextInElement(el, currentSubtitleText);
        // 确保滚动是在高亮完成并且浏览器有时间渲染之后
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
      } else {
        console.warn('未找到DOM元素匹配当前字幕文本:', currentSubtitleText); // 调试用
      }
    }
  });

  console.log('音频播放器初始化完成。');
}

/**
 * 创建词到字幕的映射 Map
 */
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((sub, i) => {
    // 确保 subtitle.text 是字符串，并且有内容
    if (typeof sub.text === 'string' && sub.text.trim().length > 0) {
      const words = tokenizeText(sub.text);
      words.forEach(({ word }) => {
        if (word.trim().length > 0) { // 避免空词
          map.push({ word: word.toLowerCase(), index: i });
        }
      });
    }
  });
  return map;
}

/**
 * 处理点击事件，跳转并播放对应句子
 */
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  // 简化点击逻辑，直接获取点击文本
  const clickedText = target.textContent.trim();
  if (clickedText.length === 0 || clickedText.length > 50) return; // 避免过长或空文本

  const clickedWordLower = clickedText.toLowerCase();

  // 查找包含该词的所有字幕候选项
  const candidates = wordToSubtitleMap.filter(entry => entry.word.includes(clickedWordLower));
  
  if (candidates.length === 0) {
    console.log(`未找到包含"${clickedWordLower}"的字幕候选词。`); // 调试用
    return;
  }

  const bestIndex = findBestSubtitleMatch(target, candidates);
  
  if (bestIndex !== null) {
    const sub = subtitleData[bestIndex];
    audio.currentTime = sub.start;
    audio.play();
    console.log(`点击"${clickedText}"，跳转到字幕: ${sub.text}`); // 调试用

    clearHighlights(); // 清除所有旧高亮

    const el = findVisibleTextNodeNearText(sub.text);
    if (el) {
      highlightTextInElement(el, sub.text);
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    } else {
      console.warn('点击后未找到DOM元素匹配字幕文本:', sub.text); // 调试用
    }
  } else {
      console.log(`点击"${clickedText}"，未能找到最佳字幕匹配。`); // 调试用
  }
}

/**
 * 清除所有高亮
 */
function clearHighlights() {
  document.querySelectorAll('.highlighted').forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      // 将 span 内部的所有子节点移到 span 外部，然后移除 span
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      parent.normalize(); // 合并相邻的文本节点
    }
  });
}

/**
 * 查找最接近点击位置的字幕
 * @param {HTMLElement} target - 用户点击的DOM元素
 * @param {Array<object>} candidates - 包含点击词的字幕索引列表
 * @returns {number|null} 最佳匹配字幕的索引
 */
function findBestSubtitleMatch(target, candidates) {
  const targetY = target.getBoundingClientRect().top + window.scrollY;
  let minDist = Infinity;
  let bestIndex = null;

  candidates.forEach(({ index }) => {
    const node = findVisibleTextNodeNearText(subtitleData[index].text);
    if (node) {
      const y = node.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(targetY - y);
      if (dist < minDist) {
        minDist = dist;
        bestIndex = index;
      }
    }
  });
  return bestIndex;
}

/**
 * 查找与字幕文本最接近的页面节点
 * 使用 Levenshtein 相似度匹配，更鲁棒
 * @param {string} text - 字幕的原始文本
 * @returns {HTMLElement|null} 匹配到的DOM元素
 */
function findVisibleTextNodeNearText(text) {
  // 清理文本函数，去除多余空白并转小写
  const clean = s => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const targetCleaned = clean(text);

  // 查找 #chapters 下的 p, div, span 元素
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters div, #chapters span'));

  let bestMatch = null;
  let bestScore = 0;
  const similarityThreshold = 0.6; // 相似度阈值

  for (const node of nodes) {
    // 检查节点是否连接到DOM并且可见（有offsetParent表示不是display:none等隐藏的）
    if (!node.isConnected || !node.offsetParent) continue;

    const nodeContentCleaned = clean(node.textContent || '');
    if (nodeContentCleaned.length === 0) continue;

    // 计算 Levenshtein 相似度
    const score = computeLevenshteinSimilarity(nodeContentCleaned, targetCleaned);

    // 如果相似度高于当前最佳，并且高于设定的阈值
    if (score > bestScore && score >= similarityThreshold) {
      bestScore = score;
      bestMatch = node;
    }
  }
  return bestMatch;
}

/**
 * 高亮指定 DOM 元素中的目标文本（只变字体颜色）
 * 使用 TreeWalker 和 Range API 增强精确性，支持正则匹配多余空格
 * @param {HTMLElement} el - 要在其内部高亮文本的父元素
 * @param {string} targetText - 要高亮的字幕文本的原始字符串
 * @returns {boolean} 是否成功高亮
 */
function highlightTextInElement(el, targetText) {
  const originalTargetText = targetText.trim(); 
  
  // 用于构建正则表达式的安全转义函数
  const escapeRegExp = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  // 构建一个更灵活的正则表达式，允许匹配中间的多个空格
  // 使用 'gi' 标志进行全局和不区分大小写匹配
  const regex = new RegExp(escapeRegExp(originalTargetText).replace(/\s+/g, '\\s*'), 'gi');

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let highlighted = false; 

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue) continue;

    // 避免在高亮过的<span>内部的文本节点上再次高亮
    if (node.parentNode && node.parentNode.classList.contains('highlighted')) {
      continue;
    }

    const rawTextNodeValue = node.nodeValue; // 获取原始文本节点内容

    // 在原始文本节点内容上使用正则表达式进行匹配
    const match = rawTextNodeValue.match(regex);

    if (match) {
      const startIndex = match.index;
      const endIndex = match.index + match[0].length;

      const range = document.createRange();
      range.setStart(node, startIndex);
      range.setEnd(node, endIndex);

      const span = document.createElement('span');
      span.className = 'highlighted';
      // 注意：这里不再设置内联样式，因为 injectHighlightStyles 已经处理

      try {
        range.surroundContents(span);
        highlighted = true;
        break; // 成功高亮一个匹配后就停止
      } catch (err) {
        console.warn('高亮文本失败 (Range API Error):', err, '文本:', originalTargetText, '节点值:', rawTextNodeValue);
        continue; 
      }
    }
  }
  return highlighted; 
}

/**
 * 注入高亮样式到文档头部
 */
function injectHighlightStyles() {
  // 检查是否已经注入过样式，避免重复
  if (document.getElementById('audio-player-highlight-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'audio-player-highlight-styles'; // 添加ID方便检查
  style.textContent = `
    .highlighted {
      color: #d60000 !important;
      font-weight: bold !important;
    }
    /* 你也可以在这里添加音频播放器的基本样式，或者保持在JS中 */
    audio {
      /* 这里的样式与JS中设置的保持一致，或者只在这里设置 */
    }
  `;
  document.head.appendChild(style);
}
