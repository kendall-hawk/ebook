// js/tooltip.js
// 假设你使用 Marked.js 进行 Markdown 渲染
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';

// 初始化 marked，可以添加配置，例如 GFM (GitHub Flavored Markdown)
marked.setOptions({
  gfm: true, // 启用 GitHub Flavored Markdown
  breaks: true // 启用换行符
});

/**
 * 异步加载 tooltips.json 数据。
 * @returns {Promise<Object>} - tooltips 数据对象。
 */
export async function loadTooltips() {
    try {
        const res = await fetch('data/tooltips.json');
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status} - Check 'data/tooltips.json' path and content.`);
        }
        return await res.json();
    } catch (error) {
        console.error('加载 tooltip 数据失败:', error);
        return {};
    }
}

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
    // 使用更精确的单词匹配模式，只匹配字母数字词语
    const wordPattern = /\b[a-zA-Z0-9'-]+\b/g;

    const markedWithSpan = md.replace(wordPattern, (match) => {
        const lowerMatch = match.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerMatch) || 0; // 获取词语频率
        let fontSizeStyle = '';

        // 如果该词是高频词（并且 getWordFrequencies 已过滤停用词）
        if (freq > 0 && maxFreq > 0) { // 避免除以零
            // 计算字体大小：频率越高，字体越大
            // 简单线性映射：(当前频率 / 最高频率) * 最大增加量 + 基础字体
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }

        // 判断是否是 tooltip 词，如果是，则同时应用 tooltip 样式和字体大小
        if (tooltipWords.includes(lowerMatch)) {
            // 注意：data-tooltip-id 应该是小写，因为它对应 tooltipData 的键
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

/**
 * 设置工具提示功能。
 * 这个函数需要在 DOM 渲染完成后调用，并且在每次新内容渲染后重新调用。
 * @param {Object} tooltipData - tooltips 数据。
 */
export function setupTooltips(tooltipData) {
    // 移除所有旧的事件监听器，避免重复绑定（如果之前有绑定的话）
    document.querySelectorAll('.word').forEach(span => {
        span.removeEventListener('mouseover', showTooltip);
        span.removeEventListener('mouseout', hideTooltip);
    });

    // ！！！ 关键修改 ！！！ 匹配 index.html 中的 ID "react-tooltips"
    const tooltipDiv = document.getElementById('react-tooltips');
    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }
    // tooltipDiv.style.cssText 应该被 style.css 中的类覆盖，这里仅作为 fallback 或临时调试
    // 确保 CSS 中有 #react-tooltips 的样式来控制其行为
    // tooltipDiv.style.cssText = 'position: absolute; display: none; background: #333; color: #fff; padding: 5px 10px; border-radius: 4px; z-index: 10000;';


    // 绑定新的事件监听器
    document.querySelectorAll('.word').forEach(span => {
        span.addEventListener('mouseover', showTooltip);
        span.removeEventListener('mouseout', hideTooltip); // 确保只绑定一次
    });

    // 绑定全局点击事件，点击页面其他地方隐藏tooltip
    document.addEventListener('click', (e) => {
        if (tooltipDiv.classList.contains('visible') && !e.target.closest('.word')) {
            hideTooltip();
        }
    });

    // 确保鼠标移出 tooltip 后也隐藏
    tooltipDiv.addEventListener('mouseleave', hideTooltip);

    function showTooltip(e) {
        e.stopPropagation(); // 阻止事件冒泡到 document 的点击事件

        const wordId = e.target.dataset.tooltipId;
        const data = tooltipData[wordId];

        if (data) {
            let htmlContent = '';

            // 标题
            if (data.title) {
                htmlContent += `<strong>${data.title}</strong><br>`;
            } else {
                htmlContent += `<strong>${wordId}</strong><br>`; // 如果没有title，显示id
            }

            // 词性
            if (data.partOfSpeech) {
                htmlContent += `<em>(${data.partOfSpeech})</em><br>`;
            }

            // 意思 (description)
            if (data.description) {
                htmlContent += `${data.description}<br>`;
            } else if (data.definition) { // 兼容 definition 字段
                htmlContent += `${data.definition}<br>`;
            }

            // 画面感 (Image Description) - 注意你的 JSON 字段名是 "Image Description"
            if (data["Image Description"]) {
                htmlContent += `${data["Image Description"]}<br>`;
            }

            // 例句
            if (data.example) {
                htmlContent += `${data.example}<br>`;
            }

            // 分类
            if (data.category) {
                htmlContent += `${data.category}`;
            }

            tooltipDiv.innerHTML = htmlContent;
            tooltipDiv.style.display = 'block'; // 显示 tooltipDiv
            tooltipDiv.classList.add('visible'); // 添加 visible 类，触发 CSS 动画

            // 定位 tooltip
            const spanRect = e.target.getBoundingClientRect();
            let left = spanRect.left + window.scrollX;
            let top = spanRect.top + window.scrollY - tooltipDiv.offsetHeight - 5; // 放在单词上方

            // 确保 tooltip 不会超出屏幕左边缘
            if (left < 0) {
                left = 0;
            }
            // 确保 tooltip 不会超出屏幕右边缘
            if (left + tooltipDiv.offsetWidth > window.innerWidth) {
                left = window.innerWidth - tooltipDiv.offsetWidth;
            }
             // 确保 tooltip 不会超出屏幕上边缘 (如果放在单词上方)
            if (top < window.scrollY) {
                top = spanRect.bottom + window.scrollY + 5; // 如果上方空间不足，则放在下方
            }

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;
        }
    }

    function hideTooltip() {
        tooltipDiv.style.display = 'none'; // 隐藏 tooltipDiv
        tooltipDiv.classList.remove('visible'); // 移除 visible 类
    }
}
