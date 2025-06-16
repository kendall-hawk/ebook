// js/audio/tokenizer.js

/**
 * 将句子分词为 { word, indexInText, length } 的数组
 * 保留原始索引，便于匹配点击的单词位置。
 */
export function tokenizeText(sentence) {
  const words = [];
  const wordRegex = /\b\w+(?:['’]\w+)?\b/g;
  let match;

  while ((match = wordRegex.exec(sentence)) !== null) {
    words.push({
      word: match[0],
      indexInText: match.index,
      length: match[0].length,
    });
  }

  return words;
}