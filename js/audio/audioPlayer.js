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

      // --- 优化点1: 清除高亮逻辑 ---
      // 在高亮前，统一清除所有旧高亮。
      // 这个函数会找到所有高亮span，并用其内部文本替换它自身。
      clearAllHighlights(); 

      const { text } = subtitleData[index];
      const el = findVisibleTextNodeNearText(text); // 这个函数也会被优化
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
      // 确保分词结果是小写，方便后续匹配
      const words = tokenizeText(subtitle.text.toLowerCase()); 
      words.forEach(({ word }) => {
        map.push({ word: word, index: i });
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
  // 如果点击的是已高亮的元素，我们应该获取其原始文本，而不是高亮span的文本
  let clickedText = target.textContent.trim();
  if (target.classList.contains('highlighted')) {
      // 如果点击的是高亮span，我们需要找到它的父级来获取完整的句子文本
      // 并在 findBestSubtitleMatch 中处理
      // 暂时不在这里做特殊处理，让 findBestSubtitleMatch 负责找到最佳匹配
  }
  
  // 对于过长的内容，我们假设它不是一个单词点击，而是段落或句子点击，可以不做处理
  if (clickedText.length > 30) { 
      return; 
  }

  const clickedWord = clickedText.toLowerCase();
  if (!clickedWord) return;

  const possibleMatches = wordToSubtitleMap
    .filter(entry => entry.word.includes(clickedWord)); // 使用 includes 提高匹配灵活性，因为 tokenizeText 可能切割词

  if (possibleMatches.length === 0) return;

  const closestIndex = findBestSubtitleMatch(target, possibleMatches);
  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex];
    audio.currentTime = start;
    audio.play();

    // --- 优化点2: 清除高亮逻辑 ---
    // 在点击高亮前，统一清除所有旧高亮
    clearAllHighlights(); 

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
  // 获取点击元素相对于文档顶部的Y坐标
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity;

  matches.forEach(({ index }) => {
    const sText = subtitleData[index].text;
    // 查找包含当前字幕文本的可见节点
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
 * --- 优化点3: 统一清除所有高亮 ---
 * 移除所有 .highlighted span，并将其内容替换回其父级。
 */
function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      // 将 span 内部的所有子节点（通常是文本节点）移到 span 的前面
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el); // 移除空的 span 元素
      parent.normalize(); // 合并相邻的文本节点，保持DOM整洁
    }
  });
}

/**
 * --- 优化点4: 改进查找可见文本节点 ---
 * 查找页面中包含给定字幕文本的节点。
 * 优先查找未被高亮的原始文本容器，但也能处理已经被高亮过的父级容器。
 */
function findVisibleTextNodeNearText(text) {
    const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
    const targetLower = text.trim().toLowerCase();

    for (const node of nodes) {
        // 获取节点的完整文本内容，不包括高亮的<span>内部文本（因为我们清除高亮后，它就是原始文本）
        const nodeTextContent = node.textContent; 

        // 如果节点包含目标文本，且它不是一个高亮的span本身
        // 确保我们找到的是包含字幕文本的“句子”容器
        if (nodeTextContent && nodeTextContent.toLowerCase().includes(targetLower)) {
            // 如果这个节点本身就是.highlighted，或者它的父级是.highlighted，我们跳过
            // 我们希望找到的是能包裹整个字幕句子的元素
            if (!node.classList.contains('highlighted')) {
                return node;
            }
        }
    }
    return null; // 如果找不到，返回null
}

/**
 * --- 优化点5: 改进高亮逻辑 ---
 * 高亮指定 DOM 元素中的目标文本。
 * 使用 Range API 精确高亮，并处理可能的HierarchyRequestError。
 */
function highlightTextInElement(el, targetText) {
    if (!el || !targetText) return;

    const targetLower = targetText.trim().toLowerCase();

    // TreeWalker 遍历所有文本节点
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);

    let found = false;
    while (walker.nextNode() && !found) {
        const textNode = walker.currentNode;
        const text = textNode.nodeValue;

        // 确保我们不在一个已经被高亮过的span内部再次高亮
        if (textNode.parentNode && textNode.parentNode.classList.contains('highlighted')) {
            continue;
        }

        // 查找字幕文本的精确位置
        const index = text.toLowerCase().indexOf(targetLower);

        if (index !== -1) {
            const range = document.createRange();
            try {
                range.setStart(textNode, index);
                range.setEnd(textNode, index + targetLower.length);

                const span = document.createElement('span');
                span.className = 'highlighted';
                // 确保样式是通过CSS类定义，这里只是一个回退或调试
                // span.style.color = '#d60000'; 
                // span.style.fontWeight = 'bold';
                
                range.surroundContents(span);
                found = true; // 成功高亮后停止
            } catch (e) {
                // 捕获 HierarchyRequestError，通常是因为 Range 跨越了非文本节点
                console.warn('高亮文本失败 (Range API Error):', e, '文本:', targetText, '节点:', textNode);
                // 此时，当前节点无法高亮，继续寻找下一个可能的文本节点
            }
        }
    }
}
