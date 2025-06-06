// js/tooltip.js

/**
 * 加载 tooltips 数据。
 * @returns {Promise<Object>} - tooltips 数据对象。
 */
export async function loadTooltips() {
  try {
    const res = await fetch('data/tooltips.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('加载 tooltips 数据失败:', error);
    return {};
  }
}

// js/tooltip.js

// ... (loadTooltips 保持不变) ...

/**
 * 将 Markdown 文本中的关键词包装成带有 tooltip 的 span，并渲染 Markdown。
 * @param {string} md - 原始 Markdown 文本。
 * @param {Object} tooltipData - tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map (word -> count)。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {number} baseFontSize - 基础字体大小 (px)。
 * @param {number} maxFontSizeIncrease - 最大字体增加量 (px)。
 * @returns {string} - 渲染后的 HTML 字符串。
 */
export function renderMarkdownWithTooltips(
    md,
    tooltipData,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12 // 最高频率的词增加 12px，即 16+12=28px
) {
    const tooltipWords = Object.keys(tooltipData);
    const wordPattern = /\b\w+\b/g;

    const markedWithSpan = md.replace(wordPattern, (match) => {
        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0; // 获取词语频率
        let fontSizeStyle = '';

        // 如果该词是高频词（并且不是停用词，getWordFrequencies已过滤停用词）
        if (freq > 0) {
            // 计算字体大小：频率越高，字体越大
            // 简单线性映射：(当前频率 / 最高频率) * 最大增加量 + 基础字体
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 判断是否是 tooltip 词，如果是，则同时应用 tooltip 样式和字体大小
        if (tooltipWords.includes(lowerMatch)) {
            return `<span data-tooltip-id="${lowerMatch}" class="word" style="${fontSizeStyle}">${match}</span>`;
        } else if (fontSizeStyle) {
            // 如果不是 tooltip 词，但因为高频而需要调整字体大小
            return `<span style="${fontSizeStyle}">${match}</span>`;
        }
        // 否则，不作任何改变
        return match;
    });

    return marked.parse(markedWithSpan);
}

// ... (setupTooltips 保持不变) ...


/**
 * 为所有带有 'word' class 的元素绑定点击事件，显示/隐藏 tooltip。
 * @param {Object} tooltipData - tooltips 数据。
 */
export function setupTooltips(tooltipData) {
  const tooltipContainer = document.getElementById('tooltips');
  if (!tooltipContainer) {
    console.warn('未找到 #tooltips 容器，tooltip 功能可能无法正常工作。');
    return;
  }

  document.querySelectorAll('.word').forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      let tooltip = document.getElementById(`tooltip-${id}`);
      if (!tooltip) {
        const data = tooltipData[id];
        tooltip = document.createElement('div');
        tooltip.id = `tooltip-${id}`;
        tooltip.className = 'tooltip';
        tooltip.innerHTML = `
          <strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong><br>
          ${data.partOfSpeech ? `<div><strong>Part of Speech:</strong> ${data.partOfSpeech}</div>` : ''}
          ${data.definition ? `<div><strong>Definition:</strong> ${data.definition}</div>` : ''}
          ${data["Image Description"] ? `<div><strong>Image Description:</strong> ${data["Image Description"]}</div>` : ''}
          ${data.example ? `<div><strong>Example:</strong> <em>${data.example}</em></div>` : ''}
          ${data.image ? `<img src="${data.image}" alt="${id}" style="max-width:100%; margin-top:8px;">` : ''}
        `;
        tooltip.style.position = 'absolute';
        tooltip.style.display = 'none';
        tooltipContainer.appendChild(tooltip);
      }

      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });

      if (tooltip.style.display === 'block') {
        tooltip.style.display = 'none';
      } else {
        tooltip.style.display = 'block';
        const rect = word.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = window.scrollY + rect.bottom + 6;
        let left = window.scrollX + rect.left;

        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
          top = window.scrollY + rect.top - tooltipRect.height - 6;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => (t.style.display = 'none'));
  });
}
