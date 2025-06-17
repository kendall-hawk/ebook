// js/audio/audioPlayer.js

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
  // 1. 初始化播放器元素
  audio = document.createElement('audio');
  audio.src = audioSrc;
  audio.controls = true; // 显示播放器控制
  audio.style.position = 'fixed';
  audio.style.bottom = '20px';
  audio.style.left = '50%';
  audio.style.transform = 'translateX(-50%)'; // 水平居中
  audio.style.zIndex = 9999; // 确保在最上层
  audio.style.width = '90%';
  audio.style.maxWidth = '600px';
  document.body.appendChild(audio);

  // 2. 解析 .srt 文件
  try {
    const res = await fetch(srtSrc);
    const srtText = await res.text();
    subtitleData = parseSRT(srtText);
  } catch (error) {
    console.error('加载或解析SRT文件失败:', error);
    return; // 如果失败则停止初始化
  }


  // 3. 建立词→句子的映射
  wordToSubtitleMap = buildWordToSubtitleMap(subtitleData);

  // 4. 监听页面中点击事件
  document.body.addEventListener('click', handleWordClick);

  console.log('音频播放器初始化完成。');
}

/**
 * 根据字幕数据构建单词到字幕索引的映射。
 * @param {Array<object>} subs - 解析后的字幕数据数组。
 * @returns {Array<object>} 单词到字幕索引的映射数组。
 */
function buildWordToSubtitleMap(subs) {
  const map = [];
  subs.forEach((subtitle, i) => {
    // 确保 subtitle.text 存在且是字符串
    if (typeof subtitle.text === 'string') {
      const words = tokenizeText(subtitle.text);
      words.forEach(({ word }) => {
        const lower = word.toLowerCase();
        map.push({
          word: lower,
          index: i, // 存储字幕在 subtitleData 数组中的索引
        });
      });
    }
  });
  return map;
}

/**
 * 处理页面中单词的点击事件。
 * @param {MouseEvent} e - 点击事件对象。
 */
function handleWordClick(e) {
  const target = e.target;
  // 检查点击目标是否存在且有文本内容
  if (!target || !target.textContent) return;

  const clickedWord = target.textContent.trim().toLowerCase();
  // 过滤掉空字符串或过长的文本（避免不必要的处理）
  if (!clickedWord || clickedWord.length > 30) return;

  // 筛选出所有包含被点击单词的字幕匹配项
  const possibleMatches = wordToSubtitleMap
    .filter(entry => entry.word === clickedWord);

  if (possibleMatches.length === 0) {
    // console.log(`未找到与 "${clickedWord}" 匹配的字幕。`);
    return;
  }

  // 精确比对是哪一句话中的该单词（通过 offsetTop 寻找最近的字幕）
  const closestIndex = findBestSubtitleMatch(target, possibleMatches);

  if (closestIndex !== null) {
    const { start, text } = subtitleData[closestIndex]; // 获取完整的字幕信息，包括开始时间
    audio.currentTime = start; // 设置音频当前时间
    audio.play(); // 播放音频

    // --- 页面平滑滚动逻辑 ---
    // 找到当前字幕文本在页面上对应的 DOM 元素
    const subtitleElement = findVisibleTextNodeNearText(text);
    if (subtitleElement) {
      subtitleElement.scrollIntoView({
        behavior: 'smooth', // 启用平滑滚动动画
        block: 'center'    // 将元素滚动到视口的中心位置
      });
    }
    // --- 平滑滚动逻辑结束 ---

  } else {
    // console.log(`未能精确定位 "${clickedWord}" 对应的字幕。`);
  }
}

/**
 * 在多个匹配项中，通过比较DOM元素的垂直位置，找到最接近点击位置的字幕。
 * @param {HTMLElement} target - 被点击的DOM元素。
 * @param {Array<object>} matches - 包含可能匹配字幕索引的数组。
 * @returns {number|null} 最佳匹配字幕的索引，如果没有找到则返回 null。
 */
function findBestSubtitleMatch(target, matches) {
  // 获取被点击元素的相对于文档顶部的垂直偏移量
  const clickedOffset = target.getBoundingClientRect().top + window.scrollY;

  let closestIndex = null;
  let minDistance = Infinity; // 用于记录最小距离，初始设为无限大

  matches.forEach(({ index }) => {
    const sText = subtitleData[index].text;
    // 查找页面中包含该字幕文本的可见DOM节点
    const foundNode = findVisibleTextNodeNearText(sText);
    if (foundNode) {
      // 获取找到的节点的相对于文档顶部的垂直偏移量
      const offset = foundNode.getBoundingClientRect().top + window.scrollY;
      // 计算点击位置与字幕节点位置之间的绝对距离
      const dist = Math.abs(offset - clickedOffset);

      // 如果当前距离小于已知的最小距离，则更新最佳匹配
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = index;
      }
    }
  });

  return closestIndex;
}

/**
 * 在预定义的DOM区域内查找包含指定文本的可见文本节点。
 * 该函数旨在找到页面上实际渲染的字幕文本元素。
 * @param {string} text - 要查找的文本内容。
 * @returns {HTMLElement|null} 包含指定文本的DOM元素，如果没有找到则返回 null。
 */
function findVisibleTextNodeNearText(text) {
  // 查询 #chapters 元素下的所有 <p>, <span>, <div> 标签
  const nodes = Array.from(document.querySelectorAll('#chapters p, #chapters span, #chapters div'));
  for (const node of nodes) {
    // 使用 node.textContent 更准确地获取元素的纯文本内容，并检查是否包含目标文本
    if (node.textContent && node.textContent.includes(text)) {
      return node;
    }
  }
  return null;
}
