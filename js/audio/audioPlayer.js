import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [], wordToSubtitleMap = [];

/**
 * 初始化音频播放器，创建音频元素并加载字幕。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;width:90%;max-width:600px;',
  });
  document.body.appendChild(audio);

  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
    console.log('SRT字幕加载成功:', subtitleData.length, '条');
  } catch (error) {
    console.error('加载或解析SRT失败:', error);
    return;
  }

  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);
  console.log('词汇到字幕映射构建完成:', wordToSubtitleMap.length, '条映射');
  document.body.addEventListener('click', handleWordClick);

  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    // 查找当前时间对应的字幕索引
    const index = subtitleData.findIndex(
      (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );

    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      console.log(`当前播放字幕: ${index}, 时间: ${currentTime.toFixed(2)}s`);
      
      clearAllHighlights(); // 确保每次高亮前都清除旧高亮
      
      const { text } = subtitleData[index];
      // 优化后的查找逻辑，确保找到正确的可见文本节点
      const el = findVisibleTextNodeNearText(text); 
      if (el) {
        highlightTextInElement(el, text);
        // 使用 requestAnimationFrame 确保在浏览器下次绘制前执行滚动，提高平滑度
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          console.log('已滚动到字幕位置并尝试高亮:', text);
        });
      } else {
        console.warn('未找到匹配的可见文本节点进行高亮:', text);
      }
    }
  });

  console.log('音频播放器初始化完成。');
}

/**
 * 构建单词到字幕句子索引的映射表
 * 确保所有单词都是小写
 */
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    if (typeof subtitle.text === 'string') {
      const words = tokenizeText(subtitle.text.toLowerCase()); // 确保分词结果是小写
      words.forEach(({ word }) => {
        // 过滤掉空字符串或纯标点符号
        if (word.match(/[a-z0-9]/i)) { 
            map.push({ word: word, index: i });
        }
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
  let clickedText = target.textContent.trim();
  // 考虑到用户可能点击到高亮过的词，获取其父级的完整文本内容作为参考
  const parentTextContent = target.closest('#chapters p, #chapters span, #chapters div')?.textContent || '';

  // 如果点击的是一个非常短的、看起来像单词的元素
  // 并且这个单词在某个字幕中
  if (clickedText.length <= 30 && clickedText.match(/[a-z0-9]/i)) {
      const clickedWordLower = clickedText.toLowerCase();

      // 调整这里的匹配逻辑，查找包含点击单词的所有字幕
      const possibleMatches = wordToSubtitleMap.filter(entry => 
          entry.word.includes(clickedWordLower) || subtitleData[entry.index].text.toLowerCase().includes(clickedWordLower)
      );

      if (possibleMatches.length === 0) {
          console.log('未找到与点击单词相关的字幕:', clickedWordLower);
          return;
      }

      console.log('点击单词:', clickedWordLower, '可能的匹配数量:', possibleMatches.length);

      // 使用更智能的匹配函数来选择最佳字幕
      const closestIndex = findBestSubtitleMatch(target, possibleMatches);
      if (closestIndex !== null) {
        const { start, text } = subtitleData[closestIndex];
        audio.currentTime = start;
        audio.play();

        clearAllHighlights(); // 确保每次点击高亮前都清除旧高亮
        const subtitleElement = findVisibleTextNodeNearText(text);
        if (subtitleElement) {
          highlightTextInElement(subtitleElement, text);
          subtitleElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          console.log('点击跳转并高亮:', text);
        } else {
          console.warn('点击后未找到匹配的可见文本节点进行高亮:', text);
        }
      }
  } else {
      console.log('点击的不是有效单词或过长文本，不处理:', clickedText);
  }
}

/**
 * 选择与点击位置最接近且内容相似的字幕句子
 * 增加了内容相似度考量
 */
function findBestSubtitleMatch(target, matches) {
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;

  let bestIndex = null;
  let bestScore = -Infinity; // 使用分数来决定最佳匹配

  for (const { index } of matches) {
    const sub = subtitleData[index];
    const subtitleText = sub.text.toLowerCase(); // 字幕原始文本
    
    // 尝试找到最能代表这个字幕的页面元素
    // 优先考虑原始的文本内容，因为高亮会改变DOM
    const node = findVisibleTextNodeNearText(sub.text); 
    if (!node) continue;

    const nodeOffset = node.getBoundingClientRect().top + window.scrollY;
    const distance = Math.abs(nodeOffset - clickedOffset);
    
    // 设定一个最大距离，超出此距离的匹配得分会很低
    const maxDist = 500; // 调整这个值以适应你的布局
    const proximityScore = 1 - Math.min(distance / maxDist, 1); // 距离越近，分数越高

    // 获取节点的实际文本内容（可能已被高亮，但我们需要原始文本进行相似度比较）
    // 移除高亮span，获取纯文本内容，再进行相似度计算
    let nodePureText = node.textContent; // 先获取当前textContent
    // 如果node是包含highlighted span的父级，需要进一步提取纯文本
    if (node.querySelector('.highlighted')) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = node.innerHTML;
        tempDiv.querySelectorAll('.highlighted').forEach(s => {
            s.outerHTML = s.textContent; // 用span的内容替换span本身
        });
        nodePureText = tempDiv.textContent;
    }

    const content = nodePureText.toLowerCase();
    
    // 计算原始字幕文本与页面节点内容的Levenshtein相似度
    // 只有当页面文本包含字幕文本时，相似度才有意义
    let similarityScore = 0;
    if (content.includes(subtitleText)) {
        similarityScore = computeLevenshteinSimilarity(subtitleText, content);
    } else {
        // 如果页面文本不包含字幕文本，相似度得分会很低
        similarityScore = 0.1; // 给一个很低的基础分
    }
    

    // 综合评分：相似度权重高，距离权重低
    const finalScore = similarityScore * 0.8 + proximityScore * 0.2; 
    console.log(`匹配字幕: ${sub.text.substring(0,20)}..., 相似度: ${similarityScore.toFixed(2)}, 距离分: ${proximityScore.toFixed(2)}, 最终分: ${finalScore.toFixed(2)}`);

    if (finalScore > bestScore) {
      bestScore = finalScore;
      bestIndex = index;
    }
  }

  console.log('最佳匹配字幕索引:', bestIndex);
  return bestIndex;
}

/**
 * 统一清除所有高亮
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
  console.log('所有高亮已清除。');
}

/**
 * 改进查找可见文本节点。
 * 优先查找与字幕文本最匹配的可见元素。
 * @param {string} text 要查找的字幕文本。
 * @returns {HTMLElement|null} 找到的可见DOM元素。
 */
function findVisibleTextNodeNearText(text) {
    const targetLower = text.trim().toLowerCase();
    const chapterContainers = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
    
    let bestNode = null;
    let bestSimilarity = -1;

    for (const node of chapterContainers) {
        // 跳过空节点或纯高亮span自身
        if (!node.textContent || node.classList.contains('highlighted')) continue;

        // 获取节点的纯文本内容，排除高亮标签的影响
        let nodePureText = node.textContent; 
        if (node.querySelector('.highlighted')) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = node.innerHTML;
            tempDiv.querySelectorAll('.highlighted').forEach(s => {
                s.outerHTML = s.textContent; 
            });
            nodePureText = tempDiv.textContent;
        }

        const nodeTextLower = nodePureText.toLowerCase();

        // 只有当节点文本包含目标字幕文本时，才计算相似度
        if (nodeTextLower.includes(targetLower)) {
            const similarity = computeLevenshteinSimilarity(targetLower, nodeTextLower);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestNode = node;
            }
        }
    }
    // console.log(`为"${text.substring(0, 20)}..."找到最佳节点:`, bestNode ? bestNode.textContent.substring(0, 50) : '无');
    return bestNode;
}


/**
 * 高亮指定 DOM 元素中的目标文本。
 * 使用 TreeWalker 和 Range API 增强精确性，并更稳健地处理错误。
 */
function highlightTextInElement(el, targetText) {
  if (!el || !targetText) {
    console.warn('高亮失败: 元素或目标文本无效。', el, targetText);
    return;
  }

  const targetLower = targetText.trim().toLowerCase();
  // 使用一个临时的div来操作innerHTML，避免直接修改原始DOM的复杂性
  // 并且这种方式在高亮长文本时更稳健
  const originalHTML = el.innerHTML;
  let newHTML = originalHTML;

  // 使用正则表达式进行不区分大小写的全局替换，并确保不匹配已存在的HTML标签
  // 这个正则表达式可以匹配目标文本，但不会匹配到HTML标签内部的属性或内容
  const regex = new RegExp(`(?![^<]*>)(?![^<>]*<)(\\b${targetLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b)`, 'gi');

  // 注意：这个简单的正则替换可能会在高亮部分文本时破坏现有DOM结构
  // 例如，如果高亮文本跨越了多个子节点，或者文本中包含HTML实体等。
  // 更好的方法是继续使用Range API，但需要更精细地处理文本节点。

  // 让我们回到Range API，但对其进行一些优化
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  let found = false;

  const textNodesToProcess = [];
  while (walker.nextNode()) {
      textNodesToProcess.push(walker.currentNode);
  }

  // 从后向前处理文本节点，避免在DOM修改时影响TreeWalker的遍历
  for (let i = textNodesToProcess.length - 1; i >= 0; i--) {
      const textNode = textNodesToProcess[i];
      const text = textNode.nodeValue;

      // 避免在高亮过的span内部再次高亮
      if (textNode.parentNode && textNode.parentNode.classList.contains('highlighted')) {
          continue;
      }

      let currentPos = 0;
      let tempText = text.toLowerCase();
      while ((index = tempText.indexOf(targetLower, currentPos)) !== -1) {
          try {
              const range = document.createRange();
              range.setStart(textNode, index);
              range.setEnd(textNode, index + targetLower.length);

              const span = document.createElement('span');
              span.className = 'highlighted';
              range.surroundContents(span);
              found = true;
              currentPos = index + targetLower.length; // 继续向后查找
              // 在修改DOM后，textNode可能已经失效，需要重新获取
              // 但由于我们从后向前处理，影响较小
              tempText = textNode.nodeValue.toLowerCase(); // 更新tempText
              console.log('成功高亮片段:', targetText);
          } catch (e) {
              // 捕获 HierarchyRequestError，通常是因为 Range 跨越了非文本节点
              // 或者文本节点已经被部分修改
              console.warn('高亮文本片段失败 (Range API Error):', e, '文本:', targetText, '节点:', textNode.nodeValue.substring(index, index + targetLower.length));
              currentPos = index + 1; // 尝试从下一个字符开始查找
              // 如果错误发生，当前textNode可能已损坏，跳过此节点继续下一个
              break; // 跳出当前文本节点的循环，处理下一个textNode
          }
      }
      if (found) break; // 如果已经高亮成功，停止处理
  }

  if (!found) {
    console.warn('高亮文本失败: 未能在元素中找到完全匹配的文本或无法高亮。', targetText, el);
  }
}

/**
 * 计算两个字符串的Levenshtein相似度。
 * 返回值在 0 到 1 之间，1 表示完全相同。
 */
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
