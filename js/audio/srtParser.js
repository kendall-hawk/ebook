// js/audio/srtParser.js

import { tokenizeText } from './tokenizer.js'; // 导入 tokenizer

export function parseSRT(srtContent) {
  const entries = [];
  // 使用更严格的分割方式，确保空行是独立的块分隔符
  const blocks = srtContent.trim().split(/\r?\n\s*\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/); // 确保按行分割
    // SRT 块至少包含序号、时间行和文本行
    if (lines.length >= 3) {
      const id = lines[0].trim(); // 获取SRT的序号作为ID
      const timeLine = lines[1];
      const textLines = lines.slice(2);
      const text = textLines.join(' ').trim();

      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
      const start = parseTimeToSeconds(startStr);
      const end = parseTimeToSeconds(endStr);

      // --- 新增：在这里处理单词级别的时间信息 ---
      const wordsData = [];
      const tokenizedWords = tokenizeText(text); // 使用 tokenizer.js 分词

      // 计算每个单词的平均持续时间
      const sentenceDuration = end - start;
      const totalWords = tokenizedWords.length;
      // 避免除以零，如果句子没有单词，则每个单词持续时间为0
      const durationPerWord = totalWords > 0 ? sentenceDuration / totalWords : 0;

      tokenizedWords.forEach((token, index) => {
        const wordStartOffset = index * durationPerWord;
        const wordEndOffset = (index + 1) * durationPerWord;

        wordsData.push({
          id: `${id}-w${index}`, // 为每个单词生成一个唯一ID (例如：SRT序号-w-单词索引)
          word: token.word,
          originalIndex: token.indexInText, // 单词在原始字幕文本中的起始位置
          length: token.length,               // 单词的长度
          startOffset: wordStartOffset,       // 单词相对于字幕开始时间的偏移 (秒)
          endOffset: wordEndOffset,           // 单词相对于字幕开始时间的偏移 (秒)
        });
      });

      entries.push({
        id: id, // SRT块的序号作为句子的ID
        start,
        end,
        text,
        words: wordsData // 存储单词数据
      });
    }
  }

  return entries;
}

function parseTimeToSeconds(timeStr) {
  // 考虑到SRT时间格式中的毫秒通常是小数点而非逗号，或者兼容两种
  const [hours, minutes, rest] = timeStr.split(':');
  const [seconds, milliseconds] = rest.split(/[,.]/); // 兼容逗号或点号分隔毫秒

  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseFloat(seconds) + // 使用parseFloat处理秒数，以防SRT本身有小数秒
    parseFloat(milliseconds) / 1000
  );
}
