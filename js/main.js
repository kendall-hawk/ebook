// js/main.js (最终修正版 - 包含 parseSRT 导入)
import {
    loadChapterIndex,
    loadSingleChapterContent,
    renderChapterToc,
    renderSingleChapterContent,
    setGlobalWordFrequencies,
    getGlobalWordFrequenciesMap,
    getGlobalMaxFreq
} from './chapterRenderer.js';
import { setupTooltips, updateActiveChapterTooltips } from './tooltip.js';
import { getWordFrequencies } from './wordFrequency.js';
import { initAudioPlayer } from './audio/audioPlayer.js';
import { parseSRT } from './utils.js'; // <-- 新增：导入 parseSRT

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    // --- 页面初始化、加载索引、计算词频等逻辑保持不变 ---
    allChapterIndexData = await loadChapterIndex();

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    const allParagraphs = [];
    const chapterContentsPromises = allChapterIndexData.map(async (chMeta) => {
        try {
            const chapterData = await loadSingleChapterContent(chMeta.file);
            if (chapterData?.paragraphs) {
                chapterData.paragraphs.forEach(p => {
                    if (typeof p === 'string') {
                        allParagraphs.push(p);
                    }
                });
            }
        } catch (error) {
            console.warn(`加载章节内容失败 (${chMeta.file}):`, error);
        }
    });
    await Promise.allSettled(chapterContentsPromises);

    const protectedWordsForFrequency = new Set();
    for (const chapterMeta of allChapterIndexData) {
        const tooltipFilePath = `chapters/${chapterMeta.id}-tooltips.json`;
        try {
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const chapterTooltips = await res.json();
                for (const tooltipId in chapterTooltips) {
                    const tooltipEntry = chapterTooltips[tooltipId];
                    if (tooltipEntry.word) {
                        protectedWordsForFrequency.add(tooltipEntry.word.toLowerCase());
                    }
                }
            }
        } catch (error) {
            // silent fail for tooltip files not found
        }
    }

    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    setupTooltips();

    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            showTocPage(); // Hash exists but chapter not found
        }
    } else {
        showTocPage(); // No hash, show TOC by default
    }
});


function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

    categoryNav.innerHTML = '';

    const newAllButton = document.createElement('button');
    newAllButton.classList.add('category-button');
    newAllButton.dataset.category = 'all';
    newAllButton.textContent = 'All Articles';
    newAllButton.classList.add('active'); // Default active
    categoryNav.appendChild(newAllButton);

    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        categoryNav.appendChild(button);
    });

    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            currentFilterCategory = button.dataset.category;
            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            showTocPage();
        });
    });
}


function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('audio-player-container')?.remove(); // 移除播放器
    document.getElementById('toc').style.display = 'grid';
    document.getElementById('category-nav').style.display = 'flex';
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
    window.location.hash = ''; // Clear hash when showing TOC
}


async function handleChapterClick(chapterId, filePath) {
    if (!chapterId) {
        showTocPage();
        return;
    }

    document.getElementById('toc').style.display = 'none';
    document.getElementById('category-nav').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';

    const chapterContent = await loadSingleChapterContent(filePath);
    let currentChapterTooltips = {};
    const chapterTooltipFilePath = `chapters/${chapterId}-tooltips.json`;

    try {
        const res = await fetch(`data/${chapterTooltipFilePath}`);
        if (res.ok) currentChapterTooltips = await res.json();
    } catch (error) {
        console.error(`加载 Tooltip 失败: ${chapterId}`, error);
    }

    // === 音频和 SRT 逻辑 ===
    const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
    const audioSrc = `data/chapters/audio/${chapterId}.mp3`;
    const srtPath = `data/chapters/srt/${chapterId}.srt`;
    let subtitleData = [];

    try {
        const srtRes = await fetch(srtPath);
        if (srtRes.ok) {
            const srtText = await srtRes.text();
            subtitleData = parseSRT(srtText); // <-- 调用从 utils.js 导入的 parseSRT
        }
    } catch (err) {
        console.warn('SRT 文件加载/解析失败:', err);
    }

    if (chapterContent) {
        updateActiveChapterTooltips(currentChapterTooltips);

        // 核心步骤：将解析好的字幕数据传递给渲染函数
        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick,
            subtitleData // <-- 传递字幕数据
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // 只有在字幕数据成功加载后才初始化播放器
        if (subtitleData.length > 0) {
            initAudioPlayer({
                audioSrc: audioSrc,
                initialSubtitleData: subtitleData // 直接传递解析好的数据
            });
        } else {
             // 如果没有字幕数据，确保移除可能存在的旧播放器
             const existingPlayer = document.getElementById('audio-player-container');
             if (existingPlayer) existingPlayer.remove();
        }

    } else {
        alert('无法加载章节内容！');
        showTocPage();
    }
}

window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    const currentChapterH2 = document.querySelector('#chapters h2');
    const currentChapterId = currentChapterH2 ? currentChapterH2.id : null;

    // Only load new content if chapterId changes or if no chapter is currently displayed and hash exists
    if (chapterId) {
        if (chapterId !== currentChapterId) {
            const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
            if (chapterMeta) {
                await handleChapterClick(chapterMeta.id, chapterMeta.file);
            } else {
                showTocPage(); // Hash refers to a non-existent chapter
            }
        }
    } else {
        if (currentChapterId) { // only hide if a chapter is currently shown
            showTocPage();
        }
    }
});
