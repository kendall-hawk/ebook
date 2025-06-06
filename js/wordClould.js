// js/wordCloud.js
// 导入 D3 和 d3-cloud（此处通过全局变量访问，因为HTML中已引入）
// import * as d3 from 'd3'; // 如果使用npm/webpack
// import cloud from 'd3-cloud'; // 如果使用npm/webpack

import { getWordFrequencies } from './utils.js';

/**
 * 渲染词云。
 * @param {Array<string>} allParagraphTexts - 所有章节的文本内容。
 * @param {string} containerSelector - 词云将被渲染到的容器的选择器（例如 '#word-cloud-display'）。
 */
export function renderWordCloud(allParagraphTexts, containerSelector) {
  const frequencies = getWordFrequencies(allParagraphTexts);

  // 过滤掉频率非常低的词，或者只取前N个词
  const topWords = frequencies.slice(0, Math.min(frequencies.length, 100)); // 最多显示100个词

  const container = document.querySelector(containerSelector);
  if (!container) {
    console.error(`未找到词云容器: ${containerSelector}`);
    return;
  }
  // 清空旧的词云内容
  container.innerHTML = '';

  const width = container.offsetWidth;
  const height = container.offsetHeight;

  if (width === 0 || height === 0) {
    console.warn('词云容器没有有效的尺寸，可能无法正确渲染。请确保容器有明确的宽度和高度。');
    return;
  }

  // D3.js 比例尺，将词频映射到字体大小
  const fontSizeScale = d3.scaleSqrt()
    .domain([0, d3.max(topWords, d => d.count)])
    .range([10, 60]); // 最小字体10px，最大字体60px

  // 创建词云布局
  const layout = d3.layout.cloud() // d3-cloud 库通过全局的 d3.layout.cloud() 暴露
    .size([width, height])
    .words(topWords.map(d => ({ text: d.word, size: fontSizeScale(d.count) })))
    .padding(5)
    .rotate(() => ~~(Math.random() * 2) * 90) // 0度 或 90度
    .font("Impact")
    .fontSize(d => d.size)
    .on("end", draw);

  layout.start(); // 启动布局计算

  function draw(words) {
    d3.select(container)
      .append("svg")
      .attr("width", layout.size()[0])
      .attr("height", layout.size()[1])
      .attr("viewBox", `0 0 ${layout.size()[0]} ${layout.size()[1]}`) // 增加 viewBox 适应容器
      .attr("preserveAspectRatio", "xMidYMid meet") // 保持宽高比
      .append("g")
      .attr("transform", `translate(${layout.size()[0] / 2},${layout.size()[1] / 2})`)
      .selectAll("text")
      .data(words)
      .enter().append("text")
      .style("font-size", d => `${d.size}px`)
      .style("font-family", "Impact")
      // 使用 D3 的分类颜色，或者你可以自定义颜色数组
      .style("fill", (d, i) => d3.schemeCategory10[i % 10])
      .attr("text-anchor", "middle")
      .attr("transform", d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
      .text(d => d.text);
  }
}
