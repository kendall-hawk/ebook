// js/wordFrequency.js

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
 * 统计文本中单词的频率
 * @param {string[]|string} allParagraphTexts - 章节段落文本数组或单一字符串
 * @param {Set<string>} [stopWords=STOP_WORDS] - 停用词集合，默认英文停用词
 * @param {Set<string>} [protectedWords=new Set()] - 需强制保留统计的词语集合（例如 tooltip 关键词）
 * @returns {{wordFrequenciesMap: Map<string, number>, maxFreq: number}} - 单词频率 Map 和最大频率
 */
export const getWordFrequencies = (
  allParagraphTexts,
  stopWords = STOP_WORDS,
  protectedWords = new Set()
) => {
  const wordCounts = new Map();
  let maxFreq = 0;

  // 确保 allParagraphTexts 为字符串数组
  const paragraphs = Array.isArray(allParagraphTexts) 
    ? allParagraphTexts.filter(p => typeof p === 'string') 
    : [String(allParagraphTexts)];

  paragraphs.forEach(paragraph => {
    // 转小写，替换除字母、数字、连字符、撇号外的所有字符为空格
    const words = paragraph
      .toLowerCase()
      .replace(/[^a-z0-9'-]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    words.forEach(word => {
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