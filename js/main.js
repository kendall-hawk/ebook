/**
 * js/main.js (主应用逻辑)
 * 协调所有模块，处理页面加载、导航、数据初始化等。
 */

import { loadChapterIndex, loadSingleChapterContent, renderChapterToc, renderSingleChapterContent, setGlobalWordFrequencies, getGlobalWordFrequenciesMap, getGlobalMaxFreq } from './chapterRenderer.js';
import { setupTooltips, updateActiveChapterTooltips } from './tooltip.js';
import { initAudioPlayer, cleanupAudioPlayer } from './audio/audioPlayer.js';
import { setupFloatingYouTube, setupVideoAutoPause } from './youtube.js';
import { tokenizeText } from './utils.js';

// 定义一个基础URL，用于在不同部署环境下调整资源路径
// 重要：这里已根据您的 GitHub Pages URL 'https://kendall-hawk.github.io/ebook/' 进行设置。
// 如果您的 GitHub Pages 部署在 'username.github.io/your-repo-name/' 这样的子目录下，
// 则将 '/your-repo-name' 替换为您的实际仓库名称。
// 如果您的 GitHub Pages 部署在根域名 'username.github.io/' (用户或组织页面) 下，
// 则 BASE_URL 应该留空字符串 '' 或设置为 '/'。
const BASE_URL = window.location.hostname.includes('github.io') && window.location.pathname.startsWith('/ebook/')
    ? '/ebook' // ✨ 已设置为您的仓库名 '/ebook'
    : ''; // 在本地开发环境或根域名部署时，通常为空

// DOM 元素
const tocSection = document.getElementById('toc');
const chaptersSection = document.getElementById('chapters');
const backToTocBtn = document.getElementById('back-to-toc');
const categoryNav = document.getElementById('category-nav');

let chapterIndex = []; // 存储所有章节的元数据
let allChapterTooltips = {}; // 存储所有章节的工具提示数据
let allChapterSrtData = {}; // 存储所有章节的 SRT 字幕数据

/**
 * 初始化应用。
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content Loaded. Initializing app...');
    chapterIndex = await loadChapterIndex();
    if (chapterIndex.length > 0) {
        await preloadAllTooltipsAndSRT();
        await calculateGlobalWordFrequencies();
        renderCategories(chapterIndex);
        renderChapterToc(chapterIndex, handleChapterClick);
    }

    setupTooltips(); // 初始化工具提示监听器
    setupVideoAutoPause(); // 初始化视频自动暂停（简化版）

    backToTocBtn.addEventListener('click', () => {
        showToc();
        cleanupAudioPlayer(); // 返回目录时清理音频播放器
        // 隐藏浮动 YouTube 播放器 (如果存在)
        document.getElementById('floating-youtube-player').style.display = 'none';
    });

    console.log('App initialization complete.');
});

/**
 * 预加载所有章节的工具提示和SRT数据。
 */
async function preloadAllTooltipsAndSRT() {
    console.log('Preloading all tooltips and SRT data...');
    const tooltipPromises = [];
    const srtPromises = [];

    chapterIndex.forEach(chMeta => {
        // 加载工具提示
        const tooltipFilePath = `chapters/${chMeta.id}-tooltips.json`;
        tooltipPromises.push(
            fetch(`${BASE_URL}/data/${tooltipFilePath}`) // 使用 BASE_URL
                .then(res => {
                    if (!res.ok) {
                        // console.warn(`Tooltips for ${chMeta.id} not found or failed to load.`, res.statusText);
                        return {}; // 如果找不到文件，返回空对象
                    }
                    return res.json();
                })
                .then(data => {
                    allChapterTooltips[chMeta.id] = data;
                })
                .catch(error => {
                    console.error(`Error loading tooltips for ${chMeta.id}:`, error);
                    allChapterTooltips[chMeta.id] = {};
                })
        );

        // 加载 SRT 数据
        const srtFilePath = `chapters/srt/${chMeta.id}.srt`;
        srtPromises.push(
            fetch(`${BASE_URL}/data/${srtFilePath}`) // 使用 BASE_URL
                .then(res => {
                    if (!res.ok) {
                        // console.warn(`SRT for ${chMeta.id} not found or failed to load.`, res.statusText);
                        return ''; // 如果找不到文件，返回空字符串
                    }
                    return res.text();
                })
                .then(srtText => {
                    // 使用 parseSRT 函数处理 SRT 文本
                    allChapterSrtData[chMeta.id] = srtText; // 存储原始 SRT 文本
                })
                .catch(error => {
                    console.error(`Error loading SRT for ${chMeta.id}:`, error);
                    allChapterSrtData[chMeta.id] = '';
                })
        );
    });

    await Promise.all(tooltipPromises);
    await Promise.all(srtPromises);
    console.log('All tooltips and SRT data preloaded.');
}


/**
 * 计算所有章节的全局词频。
 * 这应该在所有章节内容预加载完成后执行。
 */
async function calculateGlobalWordFrequencies() {
    console.log('Calculating global word frequencies...');
    const globalWordCounts = new Map();
    let maxFreq = 0;

    for (const chMeta of chapterIndex) {
        const chapterContent = await loadSingleChapterContent(chMeta.file);
        if (chapterContent && chapterContent.paragraphs) {
            chapterContent.paragraphs.forEach(p => {
                if (typeof p === 'string') {
                    const words = tokenizeText(p); // 使用 tokenizeText 分词
                    words.forEach(token => {
                        const wordLower = token.word.toLowerCase();
                        if (wordLower.length > 1) { // 过滤掉单字母词
                            const currentCount = globalWordCounts.get(wordLower) || 0;
                            globalWordCounts.set(wordLower, currentCount + 1);
                            if (currentCount + 1 > maxFreq) {
                                maxFreq = currentCount + 1;
                            }
                        }
                    });
                }
            });
        }
    }
    setGlobalWordFrequencies(globalWordCounts, maxFreq);
    console.log('Global word frequencies calculated. Max frequency:', maxFreq);
}


/**
 * 渲染类别导航按钮。
 * @param {Array<Object>} chapters - 章节索引数据。
 */
function renderCategories(chapters) {
    const uniqueCategories = new Set();
    chapters.forEach(ch => {
        if (ch.categories) {
            ch.categories.forEach(cat => uniqueCategories.add(cat));
        }
    });

    categoryNav.innerHTML = ''; // 清空现有内容

    // 添加“All”按钮
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    allBtn.classList.add('category-button', 'active');
    allBtn.addEventListener('click', () => {
        setActiveCategoryButton(allBtn);
        renderChapterToc(chapterIndex, handleChapterClick, 'all');
    });
    categoryNav.appendChild(allBtn);

    Array.from(uniqueCategories).sort().forEach(category => {
        const button = document.createElement('button');
        button.textContent = category;
        button.classList.add('category-button');
        button.addEventListener('click', () => {
            setActiveCategoryButton(button);
            renderChapterToc(chapterIndex, handleChapterClick, category);
        });
        categoryNav.appendChild(button);
    });
}

/**
 * 设置当前激活的类别按钮样式。
 * @param {HTMLElement} activeButton - 当前被点击的按钮。
 */
function setActiveCategoryButton(activeButton) {
    document.querySelectorAll('.category-button').forEach(btn => {
        btn.classList.remove('active');
    });
    activeButton.classList.add('active');
}

/**
 * 处理章节卡片点击事件。
 * @param {string} chapterId - 章节的 ID。
 * @param {string} chapterFile - 章节内容文件的路径。
 */
async function handleChapterClick(chapterId, chapterFile) {
    console.log(`Loading chapter: ${chapterId}`);
    // loadSingleChapterContent 内部已经使用了 BASE_URL
    const chapterContent = await loadSingleChapterContent(chapterFile);

    if (chapterContent) {
        // 获取当前章节的工具提示数据
        const currentChapterTooltips = allChapterTooltips[chapterId] || {};
        updateActiveChapterTooltips(currentChapterTooltips); // 更新 tooltip.js 中的工具提示数据

        // 获取当前章节的SRT数据
        const srtTextForRenderer = allChapterSrtData[chapterId];

        // 渲染章节内容
        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            srtTextForRenderer // 将原始SRT文本传递给渲染器，由渲染器内部解析
        );

        // 初始化音频播放器
        if (chapterContent.audio) {
            const audioPath = `${BASE_URL}/data/chapters/audio/${chapterContent.audio}`; // 使用 BASE_URL
            const srtPath = `${BASE_URL}/data/chapters/srt/${chapterId}.srt`; // 使用 BASE_URL
            console.log(`Initializing audio player with: Audio - ${audioPath}, SRT - ${srtPath}`);
            await initAudioPlayer({ audioSrc: audioPath, srtSrc: srtPath });
        } else {
            console.log("No audio file specified for this chapter.");
            cleanupAudioPlayer(); // 如果没有音频，确保播放器被清理
        }

        // 设置 YouTube 浮动播放器（在章节内容加载后调用，以便找到 iframe）
        setupFloatingYouTube();

        showChapters(); // 显示章节内容区
    } else {
        console.error(`Failed to load content for chapter: ${chapterId}`);
        alert('Failed to load chapter content. Please try again.');
    }
}

/**
 * 显示章节目录区。
 */
function showToc() {
    tocSection.style.display = 'grid'; // TOC 是 grid
    chaptersSection.style.display = 'none';
}

/**
 * 显示章节内容区。
 */
function showChapters() {
    tocSection.style.display = 'none';
    chaptersSection.style.display = 'block'; // Chapters 是 block
    chaptersSection.scrollTop = 0; // 滚动到顶部
}
