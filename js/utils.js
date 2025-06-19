/**
 * js/utils.js (通用工具函数)
 * 包含通用的辅助函数，如文本分词、SRT解析等。
 */

/**
 * 将句子分词为 { word, indexInText, length } 的数组。
 * - 支持英文、数字、标点
 * - 支持中英文混排
 * - 保留 indexInText 和 length 便于高亮与匹配
 * - 不包含空格作为独立的 token，空格是分隔符
 * @param {string} text - 输入的文本字符串。
 * @returns {Array<{word: string, indexInText: number, length: number}>} - 词语数组。
 */
export function tokenizeText(text) {
  const tokens = [];
  if (!text) return tokens;

  // 匹配：单词（包含连字符、撇号）、中文、数字、标点符号、单个非空白字符
  // \p{L} 匹配任何字母，\p{N} 匹配任何数字 (Unicode属性)
  // \p{Script=Han} 匹配汉字
  // [\u2010-\u2015\u2026] 匹配一些特殊连字符和省略号
  const regex = /[\p{L}\p{N}]+(?:['’\-\u2010-\u2015][\p{L}\p{N}]+)*|[\p{Script=Han}]|[.,!?;:"“”‘’…—\(\)\[\]\{\}]|\S/gu;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 过滤掉纯空白字符的匹配，regex通常不会生成，但保险起见
    if (match[0].trim().length > 0) {
      tokens.push({
        word: match[0],
        indexInText: match.index,
        length: match[0].length
      });
    }
  }
  return tokens;
}

/**
 * 解析 SRT 字幕文本为 JavaScript 对象数组。
 * @param {string} srtText - SRT 格式的字幕文本。
 * @returns {Array<Object>} - 包含 id, start, end, text 属性的字幕对象数组。
 */
export function parseSRT(srtText) {
    const subtitles = [];
    if (!srtText) return subtitles;

    const blocks = srtText.trim().split(/\r?\n\s*\r?\n/);

    blocks.forEach(block => {
        const lines = block.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        if (lines.length >= 2) { // 至少有ID和时间戳
            const id = parseInt(lines[0], 10);
            if (isNaN(id)) return; // 跳过无效的块

            const timecodes = lines[1];
            const text = lines.slice(2).join('\n'); // 剩余所有行都是文本

            const [startStr, endStr] = timecodes.split(' --> ');

            const parseTime = (timeStr) => {
                try {
                    // 00:00:00,000 格式
                    const [h, m, sMs] = timeStr.split(':');
                    const [s, ms] = sMs.split(',');
                    return parseInt(h) * 3600 +
                           parseInt(m) * 60 +
                           parseInt(s) +
                           parseInt(ms) / 1000;
                } catch (e) {
                    console.warn("无效的时间戳格式:", timeStr, e);
                    return 0;
                }
            };

            const start = parseTime(startStr);
            const end = parseTime(endStr);

            if (!isNaN(start) && !isNaN(end)) {
                 subtitles.push({
                    id: id,
                    start: start,
                    end: end,
                    text: text
                });
            }
        }
    });
    return subtitles;
}
