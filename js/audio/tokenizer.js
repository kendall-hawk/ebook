/**
 * 将句子分词为 { word, indexInText, length } 的数组
 * - 支持英文、数字、标点
 * - 支持中英文混排
 * - 保留 indexInText 和 length 便于高亮与匹配
 */
export function tokenizeText(sentence) {
  const words = [];
  const regex = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[.,!?;:"“”‘’…—\-]|[\p{Script=Han}]/gu;
  let match;

  while ((match = regex.exec(sentence)) !== null) {
    words.push({
      word: match[0],
      indexInText: match.index,
      length: match[0].length
    });
  }

  return words;
}