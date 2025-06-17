import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

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

      // 清除所有旧高亮
      document.querySelectorAll('.highlighted').forEach(el => {
        // 恢复原始文本内容
        const parent = el.parentNode;
        if (parent) {
          // 将 span 内部的文本节点移到 span 外部
          while (el.firstChild) {
            parent.insertBefore(el.firstChild, el);
          }
          parent.removeChild(el); // 移除空的 span
          // 清理可能因为文本节点合并产生的多余空白节点，可选
          parent.normalize();
        }
      });

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
 * 处理点击单词事件，跳转并播放对应句子
 */
function handleWordClick(e) {
  const target = e.target;
  if (!target || !target.textContent) return;

  // 避免点击到高亮元素本身，或者过长的内容
  if (target.classList.contains('highlighted') || target.textContent.trim().length > 30) {
    // 如果点击的是已高亮的元素，尝试获取其父级的文本内容
    const parentText = target.parentNode?.textContent?.trim().toLowerCase();
    const clickedWord = target.textContent.trim().toLowerCase();
    
    // 如果父级文本中包含被点击的词，并且该父级不是body，则认为是有效点击
    if (parentText && parentText.includes(clickedWord) && target.parentNode !== document.body) {
        // 这里需要更复杂的逻辑来找到实际的字幕容器，
        // 暂时先跳过，让它在 findBestSubtitleMatch 中处理
        // 或者直接尝试从父级找到最近的字幕文本
    } else {
        return; // 否则，不处理点击
    }
  }

  const clickedWord = target.textContent.trim().toLowerCase();
  if (!clickedWord) return;

  const possibleMatches = wordToSubtitleMap
    .filter(entry => entry.word === clickedWord);

  if (possibleMatches.length === 0) return;

  const closestIndex = findBestSubtitleMatch(target, possibleMatches);
  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex];
    audio.currentTime = start;
    audio.play();

    // 清除所有旧高亮（调用前移到timeupdate或这里，并确保清理逻辑正确）
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

    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      highlightTextInElement(subtitleElement, text);
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
 * 查找页面中包含给定字幕文本的节点
 * 优化：查找时也应考虑 .highlighted 元素的父级，因为高亮会改变DOM结构
 */
function findVisibleTextNodeNearText(text) {
  // 首先尝试查找未被高亮的原始文本节点或其容器
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of nodes) {
    // 检查节点文本内容是否包含目标文本
    // 排除已经高亮的span自身，我们想要找到的是包裹高亮span的父级容器
    if (node.textContent && node.textContent.includes(text) && !node.classList.contains('highlighted')) {
      return node;
    }
  }

  // 如果直接查找不到，可能是因为文本已经被高亮过，高亮文本被包裹在 .highlighted span 中
  // 此时需要找到包含这个高亮 span 的父级
  const highlightedSpans = Array.from(document.querySelectorAll('.highlighted'));
  for (const span of highlightedSpans) {
    // 检查高亮 span 的父级是否包含目标文本
    if (span.parentNode && span.parentNode.textContent && span.parentNode.textContent.includes(text)) {
      return span.parentNode;
    }
  }

  return null;
}

/**
 * 高亮指定 DOM 元素中的目标文本（只变字体颜色）
 * 使用 TreeWalker 和 Range API 增强精确性
 */
function highlightTextInElement(el, targetText) {
  if (!el || !targetText) return;

  // 清理现有高亮，确保每次高亮是干净的。
  // 注意：这个清除逻辑应该在调用 highlightTextInElement 之前进行，
  // 否则这里清除后，下面又重新高亮，可能导致重复操作或冲突。
  // 我已经在 timeupdate 和 handleWordClick 中加入了更全面的清除逻辑。

  const targetLower = targetText.trim().toLowerCase();

  // 使用 TreeWalker 遍历所有文本节点
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const text = textNode.nodeValue;
    // 确保我们没有尝试在高亮span内部的文本节点上再次高亮
    if (textNode.parentNode && textNode.parentNode.classList.contains('highlighted')) {
        continue;
    }

    const index = text.toLowerCase().indexOf(targetLower);

    if (index !== -1) {
      const range = document.createRange();
      range.setStart(textNode, index);
      range.setEnd(textNode, index + targetLower.length);

      const span = document.createElement('span');
      span.className = 'highlighted';
      // 样式直接在 JS 中设置，确保生效，但建议放入 CSS 文件
      span.style.color = '#d60000';
      span.style.fontWeight = 'bold';
      
      try {
        range.surroundContents(span);
        // 成功高亮后停止，因为我们通常只高亮字幕的一个匹配项
        break; 
      } catch (e) {
        // 捕获可能的 HierarchyRequestError，例如当Range跨越非文本节点时
        console.warn('高亮文本失败 (Range API Error):', e, '文本:', targetText, '节点:', textNode);
        // 尝试回退到旧的innerHTML方式（如果需要，但推荐修复结构问题）
        // 或者简单地跳过当前高亮，继续寻找下一个
        continue; 
      }
    }
  }
}