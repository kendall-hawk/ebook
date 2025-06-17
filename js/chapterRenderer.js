// js/chapterRenderer.js (核心重构)
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];

/**
 * 在段落文本中查找所有字幕文本，并用带有 `data-subtitle-id` 的 `<span>` 元素包裹它们。
 * 此函数采用容错增强的匹配策略，并确保已标记区域不会被重复或重叠标记。
 *
 * @param {string} paragraphText - 原始的段落文本，作为搜索字幕的基础。
 * @param {Array<Object>} subtitles - 解析后的 SRT 字幕对象数组。
 * 每个字幕对象应至少包含 `id` (字幕的唯一标识符) 和 `text` (字幕内容) 属性。
 * 例如: `[{ id: 1, text: "Hello world." }, { id: 2, text: "This is a test." }]`
 * @returns {string} - 经过预标记处理的 HTML 字符串。
 * 所有匹配到的字幕文本都将被 `<span class="subtitle-segment" data-subtitle-id="YOUR_ID">...</span>` 包裹。
 * 如果 `subtitles` 为空或无效，将直接返回 `paragraphText`。
 *
 * @example
 * const paragraph = "This is a sample text with some sample words from a subtitle.";
 * const subs = [
 * { id: 1, text: "sample text" },
 * { id: 2, text: "sample words" }
 * ];
 * const taggedHtml = preTagSubtitles(paragraph, subs);
 * // 结果将是: "This is a <span class=\"subtitle-segment\" data-subtitle-id=\"1\">sample text</span> with some <span class=\"subtitle-segment\" data-subtitle-id=\"2\">sample words</span> from a subtitle."
 * // 注意：如果“sample text”和“sample words”在原文中有重叠，本函数会优先处理更长的匹配或先出现的匹配，避免冲突。
 */
function preTagSubtitles(paragraphText, subtitles) {
    if (!subtitles || subtitles.length === 0) {
        return paragraphText;
    }

    let tempText = paragraphText;
    // 存储所有待替换的匹配项信息：{ start, end, matchText, subtitleId }
    const replacements = [];

    // 1. 预处理字幕并进行所有可能的匹配
    subtitles.forEach(sub => {
        // 清理字幕文本：移除HTML标签，压缩空格，并去除首尾空格
        const cleanSubText = sub.text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (!cleanSubText) return;

        // 创建宽容正则：忽略空格、大小写、标点差异
        // 1. 转义正则特殊字符，防止它们被解释为正则语法
        // 2. 将所有连续的空格替换为 `\s*`，使其能匹配零个或多个空格
        // 3. 将常见的标点符号替换为可选的标点匹配 `[,.:;!?]?`，以容忍标点差异
        const pattern = cleanSubText
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')   // 转义正则特殊字符
            .replace(/\s+/g, '\\s*')                    // 宽松空格
            .replace(/[,.:;!?]/g, '[,.:;!?]?');         // 宽容标点

        const regex = new RegExp(pattern, 'gi'); // 'g' 全局匹配, 'i' 忽略大小写

        let match;
        // 使用 exec 循环查找所有匹配项及其索引
        while ((match = regex.exec(tempText)) !== null) {
            replacements.push({
                start: match.index,
                end: match.index + match[0].length,
                matchText: match[0],
                subtitleId: sub.id,
                // 存储原始的干净字幕文本长度，用于后续的优先级排序
                originalSubLength: cleanSubText.length 
            });
        }
    });

    // 2. 解决重叠问题：
    // 优先处理更长的匹配，如果长度相同则优先处理靠前的匹配。
    // 然后，删除所有与已选择的匹配项重叠的较短或更靠后的匹配项。
    replacements.sort((a, b) => {
        // 优先处理更长的原始字幕文本
        if (b.originalSubLength !== a.originalSubLength) {
            return b.originalSubLength - a.originalSubLength;
        }
        // 如果长度相同，优先处理在文本中靠前的匹配项
        return a.start - b.start;
    });

    const finalReplacements = [];
    const usedRanges = []; // 存储已确定的标记范围，格式 {start, end}

    replacements.forEach(newMatch => {
        // 检查新匹配是否与任何已确定的范围重叠
        const isOverlapping = usedRanges.some(existingRange => 
            (newMatch.start < existingRange.end && newMatch.end > existingRange.start)
        );

        if (!isOverlapping) {
            finalReplacements.push(newMatch);
            usedRanges.push({ start: newMatch.start, end: newMatch.end });
            // 为了正确处理重叠，需要对 usedRanges 进行排序或使用更复杂的数据结构
            // 简单起见，这里是假设后续的 isOverlapping 检查能处理乱序的 usedRanges
            // 但对于复杂的重叠情况，更好的方法是维护一个排序或区间树
        }
    });

    // 3. 倒序应用替换，以避免在替换过程中改变字符串索引
    // 确保从字符串末尾开始替换，这样前面的索引就不会因为替换而失效
    finalReplacements.sort((a, b) => b.start - a.start);

    finalReplacements.forEach(rep => {
        const spanTag = `<span class="subtitle-segment" data-subtitle-id="${rep.subtitleId}">${rep.matchText}</span>`;
        tempText = tempText.substring(0, rep.start) + spanTag + tempText.substring(rep.end);
    });

    return tempText;
}


export async function loadChapterIndex() {
  // ... 此函数无变化 ...
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters;
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引数据失败:', error);
    return [];
  }
}

export async function loadSingleChapterContent(filePath) {
  // ... 此函数无变化 ...
   try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
    // ... 此函数无变化 ...
    const toc = document.getElementById('toc');
    if (!toc) return;
    toc.innerHTML = '';
    const filteredChapters = chapterIndex.filter(ch => filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory)));
    if (filteredChapters.length === 0) {
        toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
        return;
    }
    filteredChapters.forEach(ch => {
        const itemLink = document.createElement('a');
        itemLink.href = `#${ch.id}`;
        itemLink.classList.add('chapter-list-item');
        const img = document.createElement('img');
        img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
        img.alt = ch.title;
        itemLink.appendChild(img);
        const title = document.createElement('h3');
        title.textContent = ch.title;
        itemLink.appendChild(title);
        itemLink.dataset.filePath = ch.file;
        itemLink.addEventListener('click', (e) => {
            e.preventDefault();
            onChapterClick(ch.id, ch.file);
        });
        toc.appendChild(itemLink);
    });
}

/**
 * 渲染单个章节内容到 DOM (已重构，支持字幕预标记).
 * @param {Object} chapterContent - 章节数据.
 * @param {Object} currentChapterTooltips - Tooltips 数据.
 * @param {Map<string, number>} wordFrequenciesMap - 词频 Map.
 * @param {number} maxFreq - 最高词频.
 * @param {Function} navigateToChapterCallback - 导航回调.
 * @param {Array<Object>} subtitleData - [新增] 解析后的 SRT 字幕数据.
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback, subtitleData = []) {
    const chaptersContainer = document.getElementById('chapters');
    if (!chaptersContainer) return;
    chaptersContainer.innerHTML = '';

    const title = document.createElement('h2');
    title.id = chapterContent.id;
    title.textContent = chapterContent.title;
    chaptersContainer.appendChild(title);

    chapterContent.paragraphs.forEach(item => {
        if (typeof item === 'string') {
            // 核心改动：在渲染前，先进行字幕预标记
            const preTaggedHtml = preTagSubtitles(item, subtitleData);

            const renderedHtml = renderMarkdownWithTooltips(
                preTaggedHtml, // 使用预标记后的文本
                currentChapterTooltips,
                wordFrequenciesMap,
                maxFreq
            );

            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderedHtml;

            // 将内容附加到容器中
            Array.from(tempDiv.children).forEach(child => {
                chaptersContainer.appendChild(child);
            });

        } else if (item.video) {
            // ... 视频渲染逻辑无变化 ...
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;margin-bottom:20px;';
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
            iframe.frameBorder = '0';
            iframe.allowFullscreen = true;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            const videoId = extractVideoId(item.video);
            iframe.src = ensureEnableJsApi(videoId ? `https://www.youtube.com/embed/${videoId}` : item.video);
            wrapper.appendChild(iframe);
            chaptersContainer.appendChild(wrapper);
        }
    });
    
    // ... 章节导航链接（上一篇/下一篇）的逻辑无变化 ...
    const navSection = document.createElement('div');
    navSection.classList.add('chapter-nav-links');
    const currentIndex = allChapterIndex.findIndex(ch => ch.id === chapterContent.id);
    if (currentIndex > 0) {
        const prevChapter = allChapterIndex[currentIndex - 1];
        const prevLink = document.createElement('a');
        prevLink.href = `#${prevChapter.id}`;
        prevLink.textContent = '上一篇';
        prevLink.classList.add('chapter-nav-link');
        prevLink.addEventListener('click', (e) => { e.preventDefault(); navigateToChapterCallback(prevChapter.id, prevChapter.file); });
        navSection.appendChild(prevLink);
    }
    // ... (省略了分隔符和其它链接的创建，逻辑不变)
    const backToTocLink = document.createElement('a');
    backToTocLink.href = '#';
    backToTocLink.textContent = '返回文章列表';
    backToTocLink.classList.add('chapter-nav-link');
    backToTocLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateToChapterCallback('');
    });
    navSection.appendChild(backToTocLink);
    // ...
    chaptersContainer.appendChild(navSection);
}

// Global Frequencies functions remain unchanged
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;
export function getGlobalWordFrequenciesMap() { return globalWordFrequenciesMap; }
export function getGlobalMaxFreq() { return globalMaxFreq; }
export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}
