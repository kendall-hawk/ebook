// js/chapterRenderer.js

import { renderMarkdownWithTooltips } from './tooltip.js'; // 导入 Tooltip 渲染函数
import { ensureEnableJsApi, extractVideoId } from './utils.js'; // 导入 YouTube 工具函数

// 模块内部状态
let _allChapterIndex = []; // 存储所有章节的原始索引数据
let _currentChapterData = null; // 当前章节的详细内容
let _globalWordFrequenciesMap = new Map(); // 存储全局单词频率
let _globalMaxFreq = 0; // 存储全局最高频率

// 全局词频数据的 Getter 和 Setter
export function setGlobalWordFrequencies(wordFrequenciesMap, maxFreq) {
    _globalWordFrequenciesMap = wordFrequenciesMap;
    _globalMaxFreq = maxFreq;
}

export function getGlobalWordFrequenciesMap() {
    return _globalWordFrequenciesMap;
}

export function getGlobalMaxFreq() {
    return _globalMaxFreq;
}

/**
 * 从 JSON 文件加载章节索引。
 * @returns {Promise<Array<Object>>} - 章节索引数组。
 */
export async function loadChapterIndex() {
    try {
        const response = await fetch('data/chapters.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        _allChapterIndex = await response.json();
        return _allChapterIndex;
    } catch (error) {
        console.error('加载章节索引失败:', error);
        return [];
    }
}

/**
 * 加载单个章节的详细内容。
 * @param {string} filePath - 章节内容的 Markdown 文件路径。
 * @returns {Promise<Object|null>} - 章节内容对象。
 */
export async function loadSingleChapterContent(filePath) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        // 假设 Markdown 内容包含标题、分类和段落
        const lines = text.split('\n');
        let title = '';
        let categories = [];
        const paragraphs = [];
        let inParagraph = false;

        lines.forEach(line => {
            line = line.trim();
            if (line.startsWith('# ')) {
                title = line.substring(2).trim();
            } else if (line.startsWith('Categories: ')) {
                categories = line.substring('Categories: '.length).split(',').map(c => c.trim());
            } else if (line.length > 0) {
                // 将连续的非空行视为一个段落
                if (!inParagraph) {
                    paragraphs.push(line);
                    inParagraph = true;
                } else {
                    paragraphs[paragraphs.length - 1] += ' ' + line;
                }
            } else {
                inParagraph = false; // 空行表示段落结束
            }
        });

        _currentChapterData = { title, categories, paragraphs };
        return _currentChapterData;
    } catch (error) {
        console.error(`加载章节内容失败: ${filePath}`, error);
        return null;
    }
}

/**
 * 渲染章节目录（首页）。
 * @param {Array<Object>} chapterIndex - 章节索引数据。
 * @param {Function} chapterClickHandler - 点击章节时的回调函数。
 * @param {string} filterCategory - 用于过滤章节的分类。
 */
export function renderChapterToc(chapterIndex, chapterClickHandler, filterCategory = 'all') {
    const tocContainer = document.getElementById('toc');
    if (!tocContainer) {
        console.error('未找到 TOC 容器。');
        return;
    }
    tocContainer.innerHTML = ''; // 清空现有内容

    const filteredChapters = chapterIndex.filter(ch => {
        if (filterCategory === 'all') {
            return true;
        }
        return ch.categories && ch.categories.includes(filterCategory);
    });

    if (filteredChapters.length === 0) {
        tocContainer.innerHTML = '<p class="loading-message">当前分类下没有文章。</p>';
        return;
    }

    filteredChapters.forEach(chapter => {
        const chapterDiv = document.createElement('div');
        chapterDiv.classList.add('chapter-list-item');
        chapterDiv.dataset.id = chapter.id;
        chapterDiv.dataset.file = chapter.file;

        let categoriesHtml = '';
        if (chapter.categories && chapter.categories.length > 0) {
            categoriesHtml = `<span>分类: ${chapter.categories.join(', ')}</span>`;
        }

        chapterDiv.innerHTML = `
            <h2>${chapter.title}</h2>
            <p>${chapter.description}</p>
            <div class="chapter-meta">
                <span>作者: ${chapter.author}</span>
                ${categoriesHtml}
            </div>
        `;
        chapterDiv.addEventListener('click', () => chapterClickHandler(chapter.id, chapter.file));
        tocContainer.appendChild(chapterDiv);
    });
}

/**
 * 渲染单个章节的详细内容。
 * @param {Object} chapterContent - 章节内容对象。
 * @param {Map<string, number>} wordFrequenciesMap - 全局单词频率 Map。
 * @param {number} maxFreq - 全局最高频率。
 * @param {Function} navigateToChapterCallback - 用于导航的回调函数。
 */
export function renderSingleChapterContent(chapterContent, wordFrequenciesMap, maxFreq, navigateToChapterCallback) {
    const chapterArticle = document.getElementById('current-chapter-article');
    if (!chapterArticle) {
        console.error('未找到章节内容容器。');
        return;
    }
    chapterArticle.innerHTML = ''; // 清空旧内容

    if (!chapterContent) {
        chapterArticle.innerHTML = '<p class="loading-message">无法加载章节内容。</p>';
        return;
    }

    // 设置章节标题，作为文章 ID
    const titleElement = document.createElement('h2');
    titleElement.id = chapterContent.id || chapterContent.title.replace(/\s+/g, '-').toLowerCase(); // 使用章节ID或从标题生成ID
    titleElement.textContent = chapterContent.title;
    chapterArticle.appendChild(titleElement);

    chapterContent.paragraphs.forEach(paragraph => {
        if (typeof paragraph === 'string') {
            // 使用 tooltip.js 中的渲染函数来处理 Markdown 和词频高亮
            const processedHtml = renderMarkdownWithTooltips(paragraph, wordFrequenciesMap, maxFreq);
            const p = document.createElement('p');
            p.innerHTML = processedHtml;
            chapterArticle.appendChild(p);
        } else if (paragraph.type === 'video' && paragraph.src) {
            const videoContainer = document.createElement('div');
            videoContainer.classList.add('video-container');
            const videoId = extractVideoId(paragraph.src);
            if (videoId) {
                // 确保视频 URL 包含 enablejsapi=1 并转换为嵌入式格式
                const embedSrc = ensureEnableJsApi(paragraph.src);
                videoContainer.innerHTML = `<iframe src="${embedSrc}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
            } else {
                videoContainer.innerHTML = `<p style="color: red;">无法加载视频: ${paragraph.src}</p>`;
            }
            chapterArticle.appendChild(videoContainer);
        }
        // 可以根据需要添加其他内容类型（例如图片）的渲染逻辑
    });

    // 导航按钮逻辑
    const prevBtn = document.getElementById('prev-chapter-btn');
    const nextBtn = document.getElementById('next-chapter-btn');
    const backToTopBtn = document.getElementById('back-to-top-btn');
    const backToTocBtn = document.getElementById('back-to-toc-btn');

    // 移除旧的监听器以防止重复绑定
    const removeExistingListeners = (element) => {
        const newElement = element.cloneNode(true);
        element.parentNode.replaceChild(newElement, element);
        return newElement;
    };

    const currentChapterId = _currentChapterData ? (_currentChapterData.id || _currentChapterData.title.replace(/\s+/g, '-').toLowerCase()) : null;
    const currentIndex = _allChapterIndex.findIndex(ch => (ch.id === currentChapterId || ch.title.replace(/\s+/g, '-').toLowerCase() === currentChapterId));

    if (prevBtn) {
        const newPrevBtn = removeExistingListeners(prevBtn);
        if (currentIndex > 0) {
            newPrevBtn.disabled = false;
            newPrevBtn.onclick = () => {
                const prevChapter = _allChapterIndex[currentIndex - 1];
                navigateToChapterCallback(prevChapter.id, prevChapter.file);
            };
        } else {
            newPrevBtn.disabled = true;
        }
    }

    if (nextBtn) {
        const newNextBtn = removeExistingListeners(nextBtn);
        if (currentIndex < _allChapterIndex.length - 1) {
            newNextBtn.disabled = false;
            newNextBtn.onclick = () => {
                const nextChapter = _allChapterIndex[currentIndex + 1];
                navigateToChapterCallback(nextChapter.id, nextChapter.file);
            };
        } else {
            newNextBtn.disabled = true;
        }
    }

    if (backToTopBtn) {
        const newBackToTopBtn = removeExistingListeners(backToTopBtn);
        newBackToTopBtn.onclick = () => {
            // 滚动到当前章节的标题
            titleElement.scrollIntoView({ behavior: 'smooth' });
        };
    }

    if (backToTocBtn) {
        const newBackToTocBtn = removeExistingListeners(backToTocBtn);
        newBackToTocBtn.onclick = () => navigateToChapterCallback(null, null); // 返回主页
    }
}
