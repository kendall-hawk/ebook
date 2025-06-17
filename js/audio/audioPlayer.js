import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio;
let subtitleData = [];
let wordToSubtitleMap = [];

/**
 * 初始化音频播放器，创建音频元素并加载字幕。
 * @param {object} options - 配置选项。
 * @param {string} options.audioSrc - 音频文件的 URL。
 * @param {string} options.srtSrc - SRT 字幕文件的 URL。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 创建音频播放器
  audio = document.createElement('audio');
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

  // 加载并解析 SRT 字幕
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (error) {
    console.error('加载或解析SRT文件失败:', error);
    return;
  }

  // 建立词到字幕句子的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 注册点击事件监听器
  document.body.addEventListener('click', handleWordClick);

  // 播放进度更新时自动高亮当前字幕句子
  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;

    const index = subtitleData.findIndex(
      (sub, i) =>
        currentTime >= sub.start &&
        (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );

    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;

      clearAllHighlights();

      const { text } = subtitleData[index];
      const el = findVisibleTextNodeNearText(text);
      if (el) {
        highlightTextInElement(el, text);
        requestAnimationFrame(() => {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        });
      }
    }
  });

  console.log('音频播放器初始化完成。');
}

/**
 * 构建单词到字幕句子索引的映射表
 * 返回 Array<{ word: string, index: number }>
 */
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    if (typeof subtitle.text === 'string') {
      const words = tokenizeText(subtitle.text);
      words.forEach(({ word }) => {
        map.push({ word: word.toLowerCase(), index: i });
      });
    }
  });
  return map;
}

/**
 * 清除页面上所有已高亮的span，恢复文本原状
 */
function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      parent.normalize();
    }
  });
}

/**
 * 处理点击单词事件，跳转并播放对应句子
 */
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  // 避免点击到高亮元素本身，或者内容过长的节点
  if (target.classList.contains('highlighted') || target.textContent.trim().length > 30) {
    // 可扩展处理父级文本匹配逻辑，暂不处理
    return;
  }

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord) return;

  // 找到所有包含该词的字幕句索引
  const possibleMatches = wordToSubtitleMap.filter(entry => entry.word === clickedWord);

  if (possibleMatches.length === 0) return;

  const closestIndex = findBestSubtitleMatch(target, possibleMatches);
  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex];
    audio.currentTime = start;
    audio.play();

    clearAllHighlights();

    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      highlightTextInElement(subtitleElement, clickedWord);
      subtitleElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }
}

/**
 * 选择与点击位置最接近的字幕句子
 */
function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity;

  matches.forEach(({ index }) => {
    const sText = subtitleData[index].text;
    const foundNode = findVisibleTextNodeNearText(sText);
    if (foundNode) {
      const offset = foundNode.getBoundingClientRect().top + window.scrollY;
      const dist = Math.abs(offset - clickedOffset);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

/**
 * 查找页面中包含给定字幕文本的节点（尽量是字幕对应的容器）
 */
function findVisibleTextNodeNearText(text) {
  // 优先找未高亮的容器
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of nodes) {
    if (node.textContent && node.textContent.includes(text) && !node.classList.contains('highlighted')) {
      return node;
    }
  }

  // 如果找不到，尝试找包含高亮的父级
  const highlightedSpans = Array.from(document.querySelectorAll('.highlighted'));
  for (const span of highlightedSpans) {
    if (span.parentNode && span.parentNode.textContent && span.parentNode.textContent.includes(text)) {
      return span.parentNode;
    }
  }

  return null;
}

/**
 * 高亮指定 DOM 元素中所有匹配 targetText 的部分（只变字体颜色）
 */
function highlightTextInElement(el, targetText) {
  if (!el || !targetText) return;

  const targetLower = targetText.trim().toLowerCase();

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);

  let nodesToHighlight = [];

  // 先收集所有匹配项，避免遍历时操作 DOM 影响结果
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (textNode.parentNode && textNode.parentNode.classList.contains('highlighted')) {
      continue;
    }
    const text = textNode.nodeValue.toLowerCase();

    let startIndex = 0;
    while (true) {
      const index = text.indexOf(targetLower, startIndex);
      if (index === -1) break;
      nodesToHighlight.push({ textNode, index });
      startIndex = index + targetLower.length;
    }
  }

  // 从后向前高亮，防止索引错乱
  for (let i = nodesToHighlight.length - 1; i >= 0; i--) {
    const { textNode, index } = nodesToHighlight[i];
    const range = document.createRange();
    range.setStart(textNode, index);
    range.setEnd(textNode, index + targetLower.length);

    const span = document.createElement('span');
    span.className = 'highlighted';
    span.style.color = '#d60000';
    span.style.fontWeight = 'bold';

    try {
      range.surroundContents(span);
    } catch (e) {
      console.warn('高亮文本失败:', e);
    }
  }
}