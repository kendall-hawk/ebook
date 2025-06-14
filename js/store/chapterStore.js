//管理全局状态
let allChapterIndex = [];
let wordFreqMap = new Map();
let maxFreq = 1;

export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const json = await res.json();
    allChapterIndex = json.chapters || [];
    return allChapterIndex;
  } catch (err) {
    console.error('加载章节索引失败:', err);
    return [];
  }
}

export async function loadChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`加载章节失败 (${filePath})`, err);
    return null;
  }
}

export function getChapterIndex() {
  return allChapterIndex;
}

export function getWordFreq() {
  return { wordFreqMap, maxFreq };
}

export function setWordFreq(map, max) {
  wordFreqMap = map;
  maxFreq = max;
}
