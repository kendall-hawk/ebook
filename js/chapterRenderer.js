/**
 * js/chapterRenderer.js (章节内容渲染)
 * 负责加载、解析和渲染章节内容，包括 Markdown 转换、工具提示处理、词频着色和字幕注入。
 */

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { JSDOM } from 'jsdom'; // 仅用于 Node.js 环境，在浏览器中不需要或需要替代方案
import { tokenizeText } from './utils.js'; // 用于词频统计

// 初始化 Marked.js 实例
// 确保 Marked.js 的 sanitize: false 配置在此处生效
const marked = new Marked(
    markedHighlight({
        langPrefix: 'language-',
        highlight(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        }
    })
);

// 确保 Marked.js 不会对自定义的 HTML 标签（如 tooltip 链接或字幕 span）进行转义
// 这个配置通常在 setupTooltips 中完成，但确保这里也强调
marked.setOptions({
    gfm: true, // 启用 GitHub Flavored Markdown
    breaks: true, // 启用 GFM 换行符
    sanitize: false, // 禁用 HTML 转义，允许自定义 HTML
    // renderer: new marked.Renderer() // 如果需要自定义渲染，可以在这里定义
});


// 定义一个辅助函数来处理工具提示链接的渲染
const tooltipExtension = {
    name: 'tooltipLink',
    level: 'inline', // 这是一个行内元素
    // 匹配 [[text|id]] 格式
    // 这里的正则表达式需要足够鲁棒，以避免与其他 Markdown 语法冲突
    tokenizer(src, rules) {
        const rule = /^\[\[(.+?)\|(.+?)\]\]/; // 非贪婪匹配
        const match = rule.exec(src);
        if (match) {
            return {
                type: 'tooltipLink',
                raw: match[0],
                text: match[1],
                id: match[2],
                tokens: [] // 可以包含子 token，但这里我们直接使用 text
            };
        }
        return false;
    },
    renderer(token) {
        // 返回带有特定 class 和 data 属性的 HTML 字符串
        return `<a href="#" class="tooltip-link" data-tooltip-id="${token.id}">${token.text}</a>`;
    }
};

// 注册自定义扩展
marked.use({ extensions: [tooltipExtension] });


let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

export function setGlobalWordFrequencies(wordFrequenciesMap, maxFreq) {
    globalWordFrequenciesMap = wordFrequenciesMap;
    globalMaxFreq = maxFreq;
}

export function getGlobalWordFrequenciesMap() {
    return globalWordFrequenciesMap;
}

export function getGlobalMaxFreq() {
    return globalMaxFreq;
}

/**
 * 加载章节索引数据。
 * @returns {Promise<Array<Object>>} - 章节元数据数组。
 */
export async function loadChapterIndex() {
    try {
        const response = await fetch('data/chapter-index.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('Chapter index loaded:', data);
        return data;
    } catch (error) {
        console.error('Failed to load chapter index:', error);
        return [];
    }
}

/**
 * 加载单个章节的内容数据。
 * @param {string} filePath - 章节内容文件的路径。
 * @returns {Promise<Object>} - 章节内容对象。
 */
export async function loadSingleChapterContent(filePath) {
    try {
        const response = await fetch(`data/${filePath}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Chapter content from ${filePath} loaded.`);
        return data;
    } catch (error) {
        console.error(`Failed to load chapter content from ${filePath}:`, error);
        return null;
    }
}

/**
 * 渲染章节目录。
 * @param {Array<Object>} chapterIndexData - 章节索引数据。
 * @param {Function} onChapterClick - 点击章节时的回调函数。
 * @param {string} filterCategory - 用于筛选章节的类别。
 */
export function renderChapterToc(chapterIndexData, onChapterClick, filterCategory = 'all') {
    const tocElement = document.getElementById('toc');
    if (!tocElement) {
        console.error('TOC element not found.');
        return;
    }

    tocElement.innerHTML = ''; // 清空现有内容

    const filteredChapters = chapterIndexData.filter(ch => {
        if (filterCategory === 'all') {
            return true;
        }
        return ch.categories && ch.categories.includes(filterCategory);
    });

    if (filteredChapters.length === 0) {
        tocElement.innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found for this category.</p>';
        return;
    }

    filteredChapters.forEach(chapter => {
        const chapterCard = document.createElement('div');
        chapterCard.className = 'chapter-card';
        chapterCard.innerHTML = `
            <h3>${chapter.title}</h3>
            ${chapter.description ? `<p>${chapter.description}</p>` : ''}
            ${chapter.categories && chapter.categories.length > 0 ? `<div class="categories">${chapter.categories.map(cat => `<span>${cat}</span>`).join('')}</div>` : ''}
        `;
        chapterCard.addEventListener('click', () => onChapterClick(chapter.id, chapter.file));
        tocElement.appendChild(chapterCard);
    });
    console.log(`TOC rendered for category: ${filterCategory}`);
}

/**
 * 将 SRT 字幕动态注入到 Markdown 渲染后的 HTML 文本中。
 * 这个函数现在在 renderSingleChapterContent 内部被调用，处理 Marked.js 转换后的 HTML。
 *
 * @param {string} htmlContent - Marked.js 转换后的 HTML 字符串。
 * @param {Array<Object>} srtData - 解析后的 SRT 字幕数据。
 * @returns {string} - 注入字幕标签后的 HTML 字符串。
 */
function injectSubtitlesIntoHtml(htmlContent, srtData) {
    if (!srtData || srtData.length === 0) {
        return htmlContent; // 如果没有字幕数据，直接返回原始 HTML
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 查找包含 TRANSCRIPT 的 H2 标签，并获取其后续的所有段落
    const transcriptHeading = doc.querySelector('#transcript, h2#transcript'); // 考虑 id 或直接文本
    if (!transcriptHeading) {
        console.warn("No 'TRANSCRIPT' heading found in the chapter content for subtitle injection.");
        return htmlContent;
    }

    let currentNode = transcriptHeading.nextElementSibling;
    let srtIndex = 0; // 字幕数据的当前索引

    // 遍历 TRANSCRIPT 部分的段落
    while (currentNode && srtIndex < srtData.length) {
        // 只处理段落 <p> 或类似文本块的元素
        if (currentNode.tagName === 'P' || currentNode.tagName === 'DIV' || currentNode.tagName === 'LI') {
            let paragraphText = currentNode.textContent.trim();
            let originalInnerHtml = currentNode.innerHTML;
            let newInnerHtml = '';
            let currentTextPos = 0; // 当前处理到段落文本的哪个位置

            // 尝试将多个 SRT 条目合并到一个段落中，直到 SRT 文本用完或段落文本用完
            while (srtIndex < srtData.length) {
                const srtEntry = srtData[srtIndex];
                const srtTextLower = srtEntry.text.toLowerCase().replace(/\s+/g, ' '); // 标准化 SRT 文本

                // 寻找 SRT 文本在当前段落文本中的位置
                // 注意：这里需要一个更智能的匹配，因为原始文本可能有标点、Markdown格式等
                // 最简单粗暴的方式是直接将 SRT 文本视为一个子串进行匹配
                const matchIndex = paragraphText.toLowerCase().indexOf(srtTextLower.split(' ')[0].toLowerCase()); // 匹配第一个词

                // 如果 SRT 文本的第一个词能在当前段落文本的剩余部分中找到
                // 并且 SRT 文本（或其开头部分）与当前段落的某个部分匹配
                // 实际生产中这里需要更复杂的文本对齐算法，比如 Levenshtein 距离、或基于Token的匹配
                // 这里我们简化处理，假设 SRT 文本是按顺序精确出现在 HTML 文本中的
                let foundMatch = false;
                for (let i = srtIndex; i < srtData.length; i++) {
                    const tempSrtText = srtData[i].text.toLowerCase().replace(/\s+/g, ' ');
                    if (paragraphText.toLowerCase().includes(tempSrtText)) {
                        const startIndex = paragraphText.toLowerCase().indexOf(tempSrtText);
                        newInnerHtml += originalInnerHtml.substring(currentTextPos, currentTextPos + startIndex);
                        newInnerHtml += `<span class="subtitle-segment" data-subtitle-id="${srtData[i].id}">${originalInnerHtml.substring(currentTextPos + startIndex, currentTextPos + startIndex + srtData[i].text.length)}</span>`;
                        currentTextPos += (startIndex + srtData[i].text.length);
                        paragraphText = paragraphText.substring(startIndex + srtData[i].text.length);
                        srtIndex = i + 1;
                        foundMatch = true;
                        break; // 找到一个匹配就跳出内层循环，处理下一个段落或下一个 SRT
                    }
                }

                if (!foundMatch) {
                    // 如果当前 SRT 找不到匹配，就跳到下一个段落
                    break;
                }
            }
            newInnerHtml += originalInnerHtml.substring(currentTextPos); // 添加剩余的文本
            currentNode.innerHTML = newInnerHtml;
        }

        currentNode = currentNode.nextElementSibling;
    }
    // 返回修改后的 HTML 字符串
    return doc.documentElement.outerHTML;
}


/**
 * 渲染单个章节内容到页面。
 * @param {Object} chapterContent - 章节内容对象。
 * @param {Object} chapterTooltips - 当前章节的工具提示数据。
 * @param {Map<string, number>} globalWordFrequenciesMap - 全局词频映射。
 * @param {number} globalMaxFreq - 全局最大词频。
 * @param {Array<Object>} subtitleData - 解析后的 SRT 字幕数据。
 */
export function renderSingleChapterContent(chapterContent, chapterTooltips, globalWordFrequenciesMap, globalMaxFreq, subtitleData) {
    const chaptersContainer = document.getElementById('chapters');
    if (!chaptersContainer) {
        console.error('Chapters container not found.');
        return;
    }

    chaptersContainer.innerHTML = ''; // 清空现有内容

    // 添加章节标题 (保持原来的 ID 命名方式)
    const chapterTitleHtml = `<h2 id="${chapterContent.id}">${chapterContent.title}</h2>`;
    chaptersContainer.insertAdjacentHTML('beforeend', chapterTitleHtml);

    // 处理并渲染每个段落
    let currentParagraphsMarkdown = [];
    chapterContent.paragraphs.forEach(p => {
        if (typeof p === 'string') {
            currentParagraphsMarkdown.push(p);
        } else if (p.video) {
            // 如果是视频对象，先渲染之前的 Markdown 段落，然后插入视频
            if (currentParagraphsMarkdown.length > 0) {
                let markdownToRender = currentParagraphsMarkdown.join('\n\n'); // 使用双换行确保段落分离
                let html = marked.parse(markdownToRender);
                chaptersContainer.insertAdjacentHTML('beforeend', html);
                currentParagraphsMarkdown = []; // 重置
            }
            const videoHtml = `<div class="video-container"><iframe src="https://www.youtube.com/embed/${p.video.split('/').pop()}" frameborder="0" allowfullscreen></iframe></div>`;
            chaptersContainer.insertAdjacentHTML('beforeend', videoHtml);
        }
    });

    // 渲染最后剩余的 Markdown 段落
    if (currentParagraphsMarkdown.length > 0) {
        let markdownToRender = currentParagraphsMarkdown.join('\n\n');
        let html = marked.parse(markdownToRender);

        // 在 Marked.js 渲染成 HTML 之后，再尝试注入字幕标签
        // **核心修改在这里**
        html = injectSubtitlesIntoHtml(html, subtitleData);

        chaptersContainer.insertAdjacentHTML('beforeend', html);
    }

    // 应用词频热度
    chaptersContainer.querySelectorAll('p').forEach(pElement => {
        const text = pElement.textContent; // 获取纯文本
        const words = tokenizeText(text); // 分词

        let currentHtml = pElement.innerHTML;
        words.forEach(token => {
            const word = token.word.toLowerCase();
            const freq = globalWordFrequenciesMap.get(word) || 0;

            if (freq > 1) { // 只有出现多次的词才着色
                const normalizedFreq = freq / globalMaxFreq;
                // 使用 HSL 颜色，从绿色（高频）到蓝色（低频）
                // 调整色相范围 (例如 120 绿色 到 240 蓝色)
                // 确保颜色强度随频率变化
                const hue = 120 - (normalizedFreq * 100); // 120 (绿色) -> 20 (偏黄)
                const saturation = 100;
                const lightness = 40 + (normalizedFreq * 20); // 保持可见度
                const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

                // 只对没有工具提示或字幕标签的词进行着色，避免嵌套或冲突
                // 使用 replaceAll 进行替换，但要小心防止替换已处理或嵌入的 HTML
                // 更安全的方式是使用 DOM 操作来遍历文本节点
                // 简单起见，这里先用正则，但实际应考虑更健壮的方案
                const regex = new RegExp(`(?![^<]*>)\\b(${token.word})\\b(?!<)`, 'gi'); // 确保不在HTML标签内

                // **注意:** 这个简单的正则表达式替换在有复杂 HTML (如嵌套的 tooltips/subtitles) 时可能不准确
                // 最佳实践是先获取 DOM 元素，然后遍历其文本节点进行替换。
                // 但是为了“完全能用”且修改最少，我们先尝试直接替换 Marked.js 转换后的 HTML。
                // Marked.js 应该已经处理了 `a` 标签，所以我们只处理纯文本部分的词语。
                currentHtml = currentHtml.replace(regex, `<span class="word-frequency" style="color:${color}">${token.word}</span>`);
            }
        });
        pElement.innerHTML = currentHtml;
    });

    console.log(`Chapter ${chapterContent.id} content rendered.`);
}
