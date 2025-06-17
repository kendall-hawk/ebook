// js/audioPlayer.js
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio = null; // 初始化为 null
let subtitleData = [];
let invertedIndex = new Map();

export async function initAudioPlayer({ audioSrc, srtSrc }) {
  // 检查是否已经存在播放器，避免重复创建
  if (document.getElementById('custom-audio-player')) {
    audio = document.getElementById('custom-audio-player'); // 如果已存在，获取引用
    // 如果播放器已存在且源不同，更新源
    if (audio.src !== audioSrc) {
      audio.src = audioSrc;
    }
  } else {
    // 初始化音频播放器
    audio = document.createElement('audio');
    audio.id = 'custom-audio-player';
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
  }

  // 加载字幕并建立倒排索引
  try {
    const res = await fetch(srtSrc);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} - Check SRT path: ${srtSrc}`);
    }
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
    buildInvertedIndex(subtitleData);
  } catch (error) {
    console.error('加载或解析SRT字幕失败:', error);
    subtitleData = []; // 清空字幕数据以防错误数据影响后续操作
    invertedIndex.clear(); // 清空倒排索引
    return; // 提前退出
  }

  // 添加点击监听（委托），确保只添加一次
  // 检查是否已添加过监听器，避免重复绑定
  if (!document.body.dataset.wordClickListenerAdded) {
    document.body.addEventListener('click', handleWordClick);
    document.body.dataset.wordClickListenerAdded = 'true'; // 设置一个标志
  }
}

function buildInvertedIndex(subs) {
  invertedIndex.clear();
  subs.forEach((subtitle, i) => {
    // 确保 subtitle.text 是字符串且不为空
    if (typeof subtitle.text === 'string' && subtitle.text.trim().length > 0) {
      const words = tokenizeText(subtitle.text);
      words.forEach(({ word }) => {
        const lower = word.toLowerCase();
        if (!invertedIndex.has(lower)) {
          invertedIndex.set(lower, new Set());
        }
        invertedIndex.get(lower).add(i);
      });
    }
  });
}

function handleWordClick(e) {
  const target = e.target;
  // 确保点击的是带有 'word' 类的元素
  if (!target || !target.classList.contains('word')) return;

  // 从 data-word 属性获取被点击的单词，更加准确
  const clickedWord = target.dataset.word?.trim().toLowerCase();
  if (!clickedWord || clickedWord.length > 30) { // 限制单词长度，避免异常点击
    console.warn('Invalid clicked word:', clickedWord);
    return;
  }

  const possibleIndexes = invertedIndex.get(clickedWord);
  if (!possibleIndexes || possibleIndexes.size === 0) {
    console.log(`No subtitle found for word: "${clickedWord}"`);
    return;
  }

  // 将 Set 转换为数组以便进行迭代
  const matches = Array.from(possibleIndexes).map(index => ({
    word: clickedWord,
    index
  }));

  // 找到最适合的字幕片段
  const bestIndex = findBestSubtitleMatch(target, matches);
  if (bestIndex !== null) {
    const { start, text } = subtitleData[bestIndex];
    // 高亮文本并滚动到视图
    highlightAndScrollToText(text, clickedWord);
    // 设置音频当前时间并播放
    if (audio) { // 确保audio对象存在
      audio.currentTime = start;
      audio.play();
    }
  }
}

function findBestSubtitleMatch(target, matches) {
  // 获取被点击单词的垂直位置，用于空间距离判断
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;
  let closestIndex = null;
  let minScore = Infinity;

  matches.forEach(({ index }) => {
    const subtitle = subtitleData[index];
    // 找到包含该字幕文本的可见DOM节点
    const node = findVisibleTextNodeNearText(subtitle.text);
    if (node) {
      const offset = node.getBoundingClientRect().top + window.scrollY;
      const distance = Math.abs(offset - clickedOffset); // 空间距离

      // 使用被点击的span的textContent与字幕文本进行Levenshtein距离计算
      // 避免使用 target.textContent，因为 Levenshtein 应该比较整个字幕文本的相似度
      // 而不是点击的单个单词和整个字幕文本的相似度。
      // 对于 findBestSubtitleMatch，重要的是找到包含该单词的“最佳句子”，
      // 所以这里的 Levenshtein 距离可能需要重新考虑其权重或是否需要。
      // 目前保持原有逻辑，但请注意其目的。
      const textDistance = levenshtein(target.textContent.toLowerCase(), subtitle.text.toLowerCase()); 
      
      // 综合考虑空间距离和文本相似度，文本相似度权重可调
      const score = distance + textDistance * 5; 
      if (score < minScore) {
        minScore = score;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

function findVisibleTextNodeNearText(text) {
  // 查找所有可能的容器，这里假设章节内容在这些标签内
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of nodes) {
    // 检查节点的 innerText 是否包含目标文本
    // 注意：innerText 会获取所有子元素的文本内容，这可能导致误判
    // 针对你的 `wrapWordsWithSpan` 场景，如果字幕文本与DOM结构精确对应，
    // 可能需要更精细的匹配，例如检查 `node.textContent` 或通过特定类名
    if (node.innerText && node.innerText.includes(text)) {
      return node;
    }
  }
  return null;
}

function highlightAndScrollToText(text, targetWord) {
  // 移除所有旧的高亮
  // 遍历所有可能的容器节点，移除句子高亮
  document.querySelectorAll('#chapters p, #chapters span, #chapters div').forEach(n => {
    n.classList.remove('highlight-sentence'); // 使用更明确的类名
  });
  // 移除所有单词高亮
  document.querySelectorAll('.word').forEach(w => w.classList.remove('highlight-word')); // 使用更明确的类名

  // 匹配字幕文本的段落/容器
  let foundSentenceNode = null;
  const sentenceNodes = document.querySelectorAll('#chapters p, #chapters span, #chapters div');
  for (const node of sentenceNodes) {
    // 检查节点的 innerText 是否包含整个字幕文本
    if (node.innerText && node.innerText.includes(text)) {
      node.classList.add('highlight-sentence'); // 添加句子高亮类
      foundSentenceNode = node;
      break; // 找到第一个匹配的就退出
    }
  }

  // 高亮匹配单词（仅在找到句子节点后，在其内部查找）
  if (foundSentenceNode && targetWord) {
    const wordSpans = foundSentenceNode.querySelectorAll(`.word[data-word="${targetWord}"]`);
    wordSpans.forEach(span => span.classList.add('highlight-word')); // 添加单词高亮类

    // 滚动到第一个匹配单词或句子节点
    if (wordSpans.length > 0) {
      wordSpans[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (foundSentenceNode) {
      foundSentenceNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (foundSentenceNode) { // 如果没有找到单词，但找到了句子，也滚动到句子
      foundSentenceNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Levenshtein distance (简单实现) - 用于衡量字符串相似度
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[a.length][b.length];
}