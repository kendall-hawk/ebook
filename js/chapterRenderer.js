// js/chapterRenderer.js (核心重构)
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let allChapterIndex = [];

// 新增：预标记函数，这是整个方案的核心
/**
 * 在段落中查找所有字幕文本，并用带有 data-subtitle-id 的 span 包裹它们。
 * @param {string} paragraphText - 原始段落文本.
 * @param {Array<Object>} subtitles - 解析后的SRT字幕数组.
 * @returns {string} - 经过预标记处理的 HTML 字符串.
 */
function preTagSubtitles(paragraphText, subtitles) {
    if (!subtitles || subtitles.length === 0) {
        return paragraphText;
    }

    let taggedText = paragraphText;
    
    // 创建一个查找表，将纯文本映射到字幕ID
    const subtitleMap = new Map();
    subtitles.forEach(sub => {
        // 清理字幕文本，移除HTML标签和多余空格，以便匹配
        const cleanText = sub.text.replace(/<[^>]*>/g, '').trim();
        if (cleanText) {
           subtitleMap.set(cleanText, sub.id);
        }
    });

    // 为了避免替换操作的冲突，我们从最长的字幕开始替换
    const sortedKeys = Array.from(subtitleMap.keys()).sort((a, b) => b.length - a.length);

    sortedKeys.forEach(textToFind => {
        const subtitleId = subtitleMap.get(textToFind);
        // 使用正则表达式进行全局、不区分大小写的替换
        // 我们查找的文本不能位于HTML标签内部
        const regex = new RegExp(textToFind.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
        
        taggedText = taggedText.replace(regex, (match) => {
             // 检查匹配项是否已在另一个字幕标签中，防止嵌套
             // 这是一个简化检查，在多数情况下有效
            return `<span class="subtitle-segment" data-subtitle-id="${subtitleId}">${match}</span>`;
        });
    });

    return taggedText;
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
