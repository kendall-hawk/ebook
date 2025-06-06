// js/utils.js

/**
 * 确保 YouTube URL 包含 enablejsapi=1 参数，且只添加一次。
 * @param {string} videoUrl - 原始的 YouTube 视频 URL。
 * @returns {string} - 处理后的 YouTube 视频 URL。
 */
export function ensureEnableJsApi(videoUrl) {
  try {
    const url = new URL(videoUrl);
    const params = new URLSearchParams(url.search);
    if (!params.has('enablejsapi')) {
      params.append('enablejsapi', '1');
      url.search = params.toString();
    }
    return url.toString();
  } catch (e) {
    console.error('无效的视频URL:', videoUrl, e);
    return videoUrl; // 返回原始URL或进行其他错误处理
  }
}

/**
 * 从各种 YouTube URL 格式中提取视频 ID。
 * @param {string} url - YouTube 视频的 URL。
 * @returns {string} - 提取到的视频 ID，如果没有找到则返回空字符串。
 */
export function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([^&?/]+)/;
  const m = url.match(regex);
  return m ? m[1] : '';
}

// js/utils.js

// ... (ensureEnableJsApi 和 extractVideoId 保持不变) ...

// 简单的英文停用词列表，可以根据需要扩展
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "if", "in", "into", "is", "it",
  "no", "not", "of", "on", "or", "such", "that", "the", "their", "then", "there", "these",
  "they", "this", "to", "was", "will", "with", "he", "she", "him", "her", "his", "hers", "we", "us", "our", "ours",
  "you", "your", "yours", "i", "me", "my", "mine", "them", "their", "theirs", "what", "which", "who", "whom",
  "whose", "where", "when", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
  "some", "such", "no", "nor", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", “Neil”,
  "just", "don", "should", "now", "ve", "ll", "re", "m", "has", "had", "would", "could", "did", "do", "does", "get",
]);


/**
 * 统计文本中单词的频率。
 * @param {Array<string>} allParagraphTexts - 包含所有章节段落文本的数组。
 * @param {Set<string>} [stopWords=STOP_WORDS] - 可选的停用词Set。
 * @returns {Array<{word: string, count: number}>} - 按频率降序排列的单词频率列表。
 */
export function getWordFrequencies(allParagraphTexts, stopWords = STOP_WORDS) {
  const wordCounts = new Map();

  allParagraphTexts.forEach(paragraph => {
    const words = paragraph
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'“”，。？！]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 0 && !stopWords.has(word));

    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });
  });

  return Array.from(wordCounts.entries())
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

// 增加一个辅助函数，用于将词频列表转换为 Map，方便查找
export function getWordFrequenciesMap(wordFrequencies) {
  const map = new Map();
  wordFrequencies.forEach(item => {
    map.set(item.word, item.count);
  });
  return map;
}

