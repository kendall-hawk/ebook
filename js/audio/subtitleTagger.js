import { tokenizeText } from './tokenizer.js';

/**
 * 尝试将字幕句子匹配到页面中的 DOM 中，并包裹 <span class="subtitle-segment" data-subtitle-id="...">
 * @param {Array<Object>} subtitleData - 包含 { id, start, end, text } 的字幕数组
 * @param {HTMLElement} container - 章节容器，通常是 document.getElementById('chapters')
 */
export function preTagSubtitles(subtitleData, container) {
  if (!container || !subtitleData || subtitleData.length === 0) return;

  const paragraphs = Array.from(container.querySelectorAll('p, li, blockquote'));

  subtitleData.forEach(({ id, text }) => {
    const cleanText = text.trim();
    if (!cleanText) return;

    const subtitleTokens = tokenizeText(cleanText.toLowerCase());
    const subtitleWords = subtitleTokens.map(w => w.word).filter(Boolean);
    if (subtitleWords.length === 0) return;

    for (const p of paragraphs) {
      if (p.dataset.hasTagged) continue;

      const html = p.innerHTML;
      const plain = p.innerText.toLowerCase();
      if (!plain.includes(subtitleWords[0])) continue;

      const matchIndex = plain.indexOf(cleanText.toLowerCase());
      if (matchIndex !== -1) {
        // 精确匹配整句
        const start = html.toLowerCase().indexOf(cleanText.toLowerCase());
        if (start !== -1) {
          const before = html.slice(0, start);
          const match = html.slice(start, start + cleanText.length);
          const after = html.slice(start + cleanText.length);
          const wrapped = `<span class="subtitle-segment" data-subtitle-id="${id}">${match}</span>`;
          p.innerHTML = before + wrapped + after;
          p.dataset.hasTagged = 'true';
          break;
        }
      }

      // 模糊匹配 fallback：基于 word tokens 在 innerText 中查找短句段
      const pTokens = tokenizeText(p.innerText.toLowerCase());
      const pWords = pTokens.map(t => t.word);
      const windowSize = subtitleWords.length;
      for (let i = 0; i <= pWords.length - windowSize; i++) {
        const window = pWords.slice(i, i + windowSize);
        const similarity = calcWordOverlap(window, subtitleWords);
        if (similarity > 0.8) {
          // 匹配度高就直接整段包裹
          p.innerHTML = `<span class="subtitle-segment" data-subtitle-id="${id}">${html}</span>`;
          p.dataset.hasTagged = 'true';
          break;
        }
      }
    }
  });
}

/**
 * 简单重叠率计算（用于模糊匹配）
 */
function calcWordOverlap(wordsA, wordsB) {
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  const intersection = new Set([...setA].filter(w => setB.has(w)));
  return intersection.size / Math.max(setA.size, setB.size);
}
