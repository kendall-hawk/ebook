/**
 * js/wordFrequency.js
 * 负责统计文本中单词的频率。
 */

// 简单英文停用词集合，方便外部扩展和复用
export const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in", "into", "is", "it",
  "no", "not", "of", "on", "or", "such", "that", "the", "their", "then", "there", "these",
  "they", "this", "to", "was", "will", "with", "he", "she", "him", "her", "his", "hers", "we", "us", "our", "ours",
  "you", "your", "yours", "i", "me", "my", "mine", "them", "their", "theirs", "what", "which", "who", "whom",
  "whose", "where", "when", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will",
  "just", "don", "should", "now", "ve", "ll", "re", "m", "has", "had", "would", "could", "did", "do", "does", "get",
  "neil", "beth" // 根据需要自定义或扩展
]);

/**
 * 统计文本中单词的频率。
 * @param {string[]|string} allParagraphTexts - 章节段落文本数组或单一字符串。
 * @param {Set<string>} [stopWords=STOP_WORDS] - 停用词集合，默认英文停用词。
 * @param {Set<string>} [protectedWords=new Set()] - 需强制保留统计的词语集合（例如 tooltip 关键词）。
 * @returns {{wordFrequenciesMap: Map<string, number>, maxFreq: number}} - 单词频率 Map 和最大频率。
 */
export const getWordFrequencies = (
  allParagraphTexts,
  stopWords = STOP_WORDS,
  protectedWords = new Set()
) => {
  const wordCounts = new Map();
  let maxFreq = 0;

  const paragraphs = Array.isArray(allParagraphTexts)
    ? allParagraphTexts.filter(p => typeof p === 'string' && p.trim().length > 0)
    : [String(allParagraphTexts)].filter(p => p.trim().length > 0);

  paragraphs.forEach(paragraph => {
    // 改进的正则：匹配连续的字母、数字、连字符或撇号，作为潜在的单词
    // 排除纯标点符号或数字的组合，只关注类似单词的结构
    const words = paragraph
      .toLowerCase()
      .match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []; // 使用 \p{L} 和 \p{N} 匹配Unicode字母和数字

    words.forEach(word => {
      // 过滤掉只包含数字的词，除非是特殊情况需要保留
      if (/^\d+$/.test(word) && !protectedWords.has(word)) {
          return;
      }
      // 统计条件：不在停用词或在 protectedWords 中
      if (!stopWords.has(word) || protectedWords.has(word)) {
        const count = (wordCounts.get(word) || 0) + 1;
        wordCounts.set(word, count);
        if (count > maxFreq) maxFreq = count;
      }
    });
  });

  return { wordFrequenciesMap: wordCounts, maxFreq };
};
