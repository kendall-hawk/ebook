// js/utils.js (精简版)

/**
 * 将句子分词为 { word, indexInText, length } 的数组
 * - 支持英文、数字、标点
 * - 支持中英文混排
 * - 保留 indexInText 和 length 便于高亮与匹配
 * - 包含空格作为独立的 token
 * @param {string} sentence - 输入的句子字符串
 * @returns {Array<{word: string, indexInText: number, length: number}>} - 词语数组
 */
export function tokenizeText(sentence) {
  const tokens = [];
  const regex = /\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[\p{Script=Han}]|[.,!?;:"“”‘’…—\-]/gu;
  let match;

  if (!sentence) return tokens;

  while ((match = regex.exec(sentence)) !== null) {
    if (match[0].length > 0) {
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
    const blocks = srtText.trim().split(/\r?\n\s*\r?\n/);

    blocks.forEach(block => {
        const lines = block.split(/\r?\n/);
        if (lines.length >= 3) {
            const id = parseInt(lines[0].trim(), 10);
            const timecodes = lines[1].trim();
            const text = lines.slice(2).join(' ').trim();

            const [startStr, endStr] = timecodes.split(' --> ');

            const parseTime = (timeStr) => {
                const parts = timeStr.split(':');
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const [seconds, milliseconds] = parts[2].split(',').map(Number);
                return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
            };

            subtitles.push({
                id: id,
                start: parseTime(startStr),
                end: parseTime(endStr),
                text: text
            });
        }
    });
    return subtitles;
}
