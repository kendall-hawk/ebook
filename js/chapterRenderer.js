/**
 * js/chapterRenderer.js (章节内容渲染)
 * 负责加载、解析和渲染章节内容，包括 Markdown 转换、工具提示处理、词频着色和字幕注入。
 */

import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import { tokenizeText, parseSRT } from './utils.js'; // 用于词频统计和SRT解析

// 初始化 Marked.js 实例
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
        // BASE_URL 在 main.js 中定义并处理
        const response = await fetch(`${BASE_URL}/data/chapter-index.json`);
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
        // BASE_URL 在 main.js 中定义并处理
        const response = await fetch(`${BASE_URL}/data/${filePath}`);
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
 * 优化后的字幕注入函数：
 * 将 SRT 字幕动态注入到 Markdown 渲染后的 HTML 文本中。
 * 这个函数现在在 renderSingleChapterContent 内部被调用，处理 Marked.js 转换后的 HTML。
 *
 * 采用 DOM 操作而非字符串替换，以避免 Markdown/HTML 结构被破坏。
 *
 * @param {HTMLElement} chapterContentElement - 章节内容的 DOM 容器元素（通常是 #chapter-content）。
 * @param {Array<Object>} srtData - 解析后的 SRT 字幕数据。
 * @returns {void} - 直接修改 DOM。
 */
function injectSubtitlesIntoDom(chapterContentElement, srtData) {
    if (!srtData || srtData.length === 0) {
        return; // 如果没有字幕数据，直接返回
    }

    const transcriptHeading = chapterContentElement.querySelector('#transcript, h2#transcript');
    if (!transcriptHeading) {
        console.warn("No 'TRANSCRIPT' heading found in the chapter content for subtitle injection.");
        return;
    }

    let currentSrtIndex = 0;
    // 从 TRANSCRIPT 标题后的第一个同级元素开始处理
    let currentHtmlNode = transcriptHeading.nextElementSibling;

    while (currentHtmlNode && currentSrtIndex < srtData.length) {
        // 只处理我们认为可能包含字幕的文本块，例如 <p>
        if (currentHtmlNode.nodeType === Node.ELEMENT_NODE && (
            currentHtmlNode.tagName === 'P' ||
            currentHtmlNode.tagName === 'DIV' ||
            currentHtmlNode.tagName === 'LI'
        )) {
            let originalInnerHtml = currentHtmlNode.innerHTML;
            let tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalInnerHtml; // 将现有 HTML 放入一个临时 div

            // 递归函数来遍历节点并插入字幕
            function processNode(node) {
                if (currentSrtIndex >= srtData.length) {
                    return; // 所有字幕都已处理
                }

                if (node.nodeType === Node.TEXT_NODE) {
                    let text = node.nodeValue;
                    let newParts = [];
                    let lastIndex = 0;

                    let srtEntry = srtData[currentSrtIndex];
                    let srtTextNormalized = srtEntry.text.replace(/\s+/g, ' ').trim();

                    // 尝试在当前文本节点中找到 SRT 文本
                    let matchIndex = text.indexOf(srtTextNormalized);

                    // 如果 SRT 文本过长，可能需要分段匹配或更复杂的算法
                    // 这里我们尝试匹配 SRT 文本，如果找不到，可能是由于 Markdown 转换或文本差异
                    // 采取更宽松的匹配，例如只匹配 SRT 文本的开头部分
                    if (matchIndex === -1) {
                         // 尝试匹配 SRT 文本的第一个词或前几个字符
                         const firstWords = srtTextNormalized.split(' ').slice(0, Math.min(3, srtTextNormalized.split(' ').length)).join(' ');
                         matchIndex = text.indexOf(firstWords);
                         if (matchIndex !== -1) {
                             // 如果找到了第一个词，但整个句子不匹配，则只标记第一个词或者根据需要调整
                             // 为了简单和健壮性，如果无法精确匹配，我们选择不插入标签，避免错误高亮。
                             // 除非您需要更高级的模糊匹配算法。
                             matchIndex = -1; // 强制不匹配，除非精确匹配
                         }
                    }

                    if (matchIndex !== -1) {
                        // 匹配前的文本
                        newParts.push(text.substring(lastIndex, matchIndex));
                        // 插入高亮 span
                        newParts.push(`<span class="subtitle-segment" data-subtitle-id="${srtEntry.id}">${srtTextNormalized}</span>`);
                        lastIndex = matchIndex + srtTextNormalized.length;
                        // 匹配后的剩余文本
                        newParts.push(text.substring(lastIndex));

                        // 用新生成的 HTML 替换原始文本节点
                        const spanTemp = document.createElement('span'); // 用 span 包裹，方便插入
                        spanTemp.innerHTML = newParts.join('');
                        
                        while (spanTemp.firstChild) {
                            node.parentNode.insertBefore(spanTemp.firstChild, node);
                        }
                        node.parentNode.removeChild(node);
                        currentSrtIndex++; // 字幕已处理，移动到下一个
                        return true; // 表示在这个节点中找到了并处理了字幕
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'SCRIPT' && node.tagName !== 'STYLE' && !node.classList.contains('tooltip-link')) {
                    // 递归处理子节点
                    for (let i = 0; i < node.childNodes.length; i++) {
                        // 如果子节点处理后，字幕索引向前移动了，则不需要处理下一个同级字幕
                        if (processNode(node.childNodes[i])) {
                            // 找到了一个字幕并处理了，可以尝试在这个节点继续找下一个字幕
                            // 但为了避免一个 HTML 段落中包含多个 SRT 字幕行导致复杂性，
                            // 我们目前假设一个 HTML 段落（或文本节点）对应一个或少数几个 SRT 行。
                            // 更安全的做法是，处理完一个 SRT 行后，继续查找下一个 SRT 行，但在当前 HTML 节点内。
                            // 为了简化，如果处理了一个子节点，就继续检查下一个子节点
                            i--; // 重新检查当前索引，因为可能在当前节点内找到多个连续字幕
                            // 实际应该是在找到一个字幕后，检查剩余文本是否还能匹配下一个字幕，
                            // 这是一个递归的、更复杂的文本对齐问题。
                            // 简化处理：如果一个字幕匹配了，我们假设这个HTML节点可能包含后续字幕，继续循环
                        }
                    }
                }
                return false; // 没有处理字幕
            }

            // 从当前 HTML 节点开始处理
            for(let i = 0; i < tempDiv.childNodes.length; i++) {
                // Keep trying to process subtitles within the same HTML node
                while(currentSrtIndex < srtData.length && processNode(tempDiv.childNodes[i])) {
                    // If processNode returns true, a subtitle was inserted, try to process again
                    // in case there are multiple subtitles in sequence within the same HTML text node.
                    // This is a rough way to handle it, perfect text alignment needs advanced algorithms.
                }
            }

            currentHtmlNode.innerHTML = tempDiv.innerHTML; // 将修改后的 HTML 放回原始元素
        }
        currentHtmlNode = currentHtmlNode.nextElementSibling; // 移动到下一个同级 HTML 元素
    }
    console.log("Subtitles injected into DOM.");
}


/**
 * 渲染单个章节内容到页面。
 * @param {Object} chapterContent - 章节内容对象。
 * @param {Object} chapterTooltips - 当前章节的工具提示数据。
 * @param {Map<string, number>} globalWordFrequenciesMap - 全局词频映射。
 * @param {number} globalMaxFreq - 全局最大词频。
 * @param {string} rawSrtText - 原始 SRT 字幕文本。
 */
export function renderSingleChapterContent(chapterContent, chapterTooltips, globalWordFrequenciesMap, globalMaxFreq, rawSrtText) {
    const chaptersContainer = document.getElementById('chapters');
    if (!chaptersContainer) {
        console.error('Chapters container not found.');
        return;
    }

    chaptersContainer.innerHTML = ''; // 清空现有内容

    // 添加章节标题 (保持原来的 ID 命名方式)
    const chapterTitleHtml = `<h2 id="${chapterContent.id}">${chapterContent.title}</h2>`;
    chaptersContainer.insertAdjacentHTML('beforeend', chapterTitleHtml);

    // 用于构建完整的 Markdown 字符串，然后一次性渲染
    let fullMarkdownContent = '';
    chapterContent.paragraphs.forEach(p => {
        if (typeof p === 'string') {
            fullMarkdownContent += p + '\n\n'; // 段落之间用两个换行符分隔
        } else if (p.video) {
            // 如果是视频对象，在 Markdown 中插入一个 HTML 占位符
            // 注意：这里的 URL 格式，确保是标准的 YouTube 嵌入 URL
            const videoId = p.video.split('/').pop(); // 从 URL 获取视频 ID
            fullMarkdownContent += `<div class="video-container"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>\n\n`;
        }
    });

    // 将整个 Markdown 内容渲染成 HTML
    let renderedHtml = marked.parse(fullMarkdownContent);

    // 将渲染后的 HTML 插入到 DOM 中
    // 注意：我们将内容插入到 chapter-content 元素内，而不是直接修改 chaptersContainer
    const chapterContentDiv = document.createElement('div');
    chapterContentDiv.id = 'chapter-content-body'; // 给它一个ID，方便后续操作
    chapterContentDiv.innerHTML = renderedHtml;
    chaptersContainer.appendChild(chapterContentDiv);


    // 在 HTML 插入 DOM 之后，再进行字幕注入
    // 在这里解析 SRT，确保每次渲染章节时都使用最新的数据
    const srtData = parseSRT(rawSrtText);
    injectSubtitlesIntoDom(chapterContentDiv, srtData);


    // 应用词频热度
    // 词频着色应该在字幕注入之后进行，并且需要遍历新生成的 DOM 结构
    chapterContentDiv.querySelectorAll('p, li').forEach(pElement => { // 同时处理 <p> 和 <li>
        // 我们需要遍历文本节点，而不是直接修改 innerHTML，以避免破坏字幕或工具提示标签
        const walker = document.createTreeWalker(
            pElement,
            NodeFilter.SHOW_TEXT,
            { acceptNode: function(node) {
                // 只接受非高亮、非工具提示、非视频内部的文本节点
                if (node.parentNode.classList.contains('subtitle-segment') || node.parentNode.classList.contains('tooltip-link') || node.parentNode.closest('.video-container')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }}
        );

        let currentNode;
        const textNodesToProcess = [];
        while (currentNode = walker.nextNode()) {
            if (currentNode.nodeValue.trim().length > 0) {
                textNodesToProcess.push(currentNode);
            }
        }

        textNodesToProcess.forEach(textNode => {
            let originalText = textNode.nodeValue;
            let newHtmlParts = [];
            let lastIndex = 0;
            const words = tokenizeText(originalText);

            words.forEach(token => {
                const wordLower = token.word.toLowerCase();
                const freq = globalWordFrequenciesMap.get(wordLower) || 0;

                if (freq > 1) { // 只有出现多次的词才着色
                    const normalizedFreq = freq / globalMaxFreq;
                    const hue = 120 - (normalizedFreq * 100); // 从绿色到黄色/橙色
                    const saturation = 100;
                    const lightness = 40 + (normalizedFreq * 20); // 增加亮度
                    const color = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

                    const startIndex = originalText.indexOf(token.word, lastIndex);
                    if (startIndex !== -1) {
                         newHtmlParts.push(originalText.substring(lastIndex, startIndex));
                         newHtmlParts.push(`<span class="word-frequency" style="color:${color}">${token.word}</span>`);
                         lastIndex = startIndex + token.word.length;
                    } else {
                         // 如果找不到，直接添加原文本，防止循环卡住或丢失文本
                         newHtmlParts.push(originalText.substring(lastIndex));
                         lastIndex = originalText.length;
                    }
                } else {
                    // 如果不着色，直接添加原始文本
                    const startIndex = originalText.indexOf(token.word, lastIndex);
                    if (startIndex !== -1) {
                        newHtmlParts.push(originalText.substring(lastIndex, startIndex + token.word.length));
                        lastIndex = startIndex + token.word.length;
                    } else {
                        newHtmlParts.push(originalText.substring(lastIndex));
                        lastIndex = originalText.length;
                    }
                }
            });
            newHtmlParts.push(originalText.substring(lastIndex)); // 添加剩余文本

            // 创建一个临时的 div 来解析 HTML 字符串为 DOM 节点
            const tempSpanContainer = document.createElement('span');
            tempSpanContainer.innerHTML = newHtmlParts.join('');

            // 用新节点替换原始文本节点
            while (tempSpanContainer.firstChild) {
                textNode.parentNode.insertBefore(tempSpanContainer.firstChild, textNode);
            }
            textNode.parentNode.removeChild(textNode);
        });
    });

    console.log(`Chapter ${chapterContent.id} content rendered and subtitles/frequencies processed.`);
}
