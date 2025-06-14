// js/wordFrequency.js

// 简单的英文停用词列表 (小写)
const STOP_WORDS_DEFAULT = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in", "into", "is", "it",
  "no", "not", "of", "on", "or", "such", "that", "the", "their", "then", "there", "these",
  "they", "this", "to", "was", "will", "with", "he", "she", "him", "her", "his", "hers", "we", "us", "our", "ours",
  "you", "your", "yours", "i", "me", "my", "mine", "them", "their", "theirs", "what", "which", "who", "whom",
  "whose", "where", "when", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "nor", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will",
  "just", "don", "should", "now", "ve", "ll", "re", "m", "has", "had", "would", "could", "did", "do", "does", "get",
  "neil", "beth" // 根据你的需求，这里可以添加其他停用词
]);


/**
 * 统计文本中单词的频率。
 * @param {Array<string>} allParagraphTexts - 包含所有章节段落文本的数组。
 * @param {Set<string>} [stopWords=STOP_WORDS_DEFAULT] - 可选的停用词Set。
 * @param {Set<string>} [protectedWords=new Set()] - 无论如何都不能被过滤的词语集合（例如tooltip关键词）。
 * @returns {{wordFrequenciesMap: Map<string, number>, maxFreq: number}} - 包含单词频率Map和最高频率。
 */
export function getWordFrequencies(allParagraphTexts, stopWords = STOP_WORDS_DEFAULT, protectedWords = new Set()) {
  const wordCounts = new Map();
  let maxFreq = 0; // 初始化最高频率

  // 确保 allParagraphTexts 是数组，且其元素是字符串
  if (!Array.isArray(allParagraphTexts)) {
      console.warn("getWordFrequencies: Input allParagraphTexts is not an array. Attempting to process as a single string or converting to array.");
      allParagraphTexts = [String(allParagraphTexts || '')];
  }

  allParagraphTexts.forEach(paragraph => {
    // 确保是字符串，如果不是，尝试转换为字符串。如果转换后仍为空，则跳过
    const text = String(paragraph || '');
    if (text.trim().length === 0) { // 检查是否是空字符串或只含空白符
        return; // 跳过空或无效的段落
    }

    const words = text
      .toLowerCase()
      // 优化：一次性替换掉所有非字母、非数字、非连字符、非撇号的字符为空格
      .replace(/[^a-z0-9'-]+/g, ' ')
      .split(/\s+/) // 使用一个或多个空格作为分隔符
      .filter(word => word.length > 0); // 过滤掉空字符串

    words.forEach(word => {
      // 只有当词语不在停用词列表，或者它在受保护的关键词列表时，才进行统计
      // 这里的逻辑已经确保了 protectedWords 优先级更高
      if (!stopWords.has(word) || protectedWords.has(word)) {
        const currentCount = (wordCounts.get(word) || 0) + 1;
        wordCounts.set(word, currentCount);
        if (currentCount > maxFreq) {
          maxFreq = currentCount; // 更新最高频率
        }
      }
    });
  });

  return { wordFrequenciesMap: wordCounts, maxFreq: maxFreq };
}
