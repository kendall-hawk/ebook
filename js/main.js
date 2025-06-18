// js/main.js (重构版 - 更新以适应所有重构文件)

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
// 重新导入 parseSRT，因为 main.js 现在需要它来为 chapterRenderer 提供字幕数据
import { parseSRT } from './utils.js';
// 导入 youtube 模块的 setup 函数
import { setupFloatingYouTube, setupVideoAutoPause } from './youtube.js';


let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化 YouTube 视频功能（自动暂停和浮动视频）
    setupVideoAutoPause();
    setupFloatingYouTube();

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
            const res = await fetch(`data/chapters/${tooltipFilePath}`);
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

    setupTooltips(); // 确保在章节内容渲染前，工具提示的事件监听器已准备好

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
    const playerContainer = document.getElementById('audio-player');
    if (playerContainer) {
        playerContainer.innerHTML = ''; // 清空内容
        // playerContainer.style.display = 'none'; // 或者根据需要隐藏
    }
    document.getElementById('toc').style.display = 'grid';
    document.getElementById('category-nav').style.display = 'flex';
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
    window.location.hash = '';
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
        const res = await fetch(`data/chapters/${chapterTooltipFilePath}`);
        if (res.ok) currentChapterTooltips = await res.json();
    } catch (error) {
        console.error(`加载 Tooltip 失败: ${chapterId}`, error);
    }

    // === 音频和 SRT 逻辑 ===
    const audioSrc = `data/audio/chapters/${chapterId}.mp3`; // 修正路径
    const srtPath = `data/srt/chapters/${chapterId}.srt`;     // 修正路径
    let subtitleDataForRenderer = []; // 为 chapterRenderer 准备字幕数据

    try {
        const srtRes = await fetch(srtPath);
        if (srtRes.ok) {
            const srtText = await srtRes.text();
            subtitleDataForRenderer = parseSRT(srtText); // 使用从 utils.js 导入的 parseSRT
        }
    } catch (err) {
        console.warn('SRT 文件加载/解析失败，但音频播放器仍将尝试加载:', err);
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
            subtitleDataForRenderer // 传递字幕数据给 chapterRenderer
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // 调用新的 initAudioPlayer 方式
        initAudioPlayer({
            audioSrc: audioSrc,
            srtSrc: srtPath
        });

    } else {
        alert('无法加载章节内容！');
        showTocPage();
    }
}

window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    const currentChapterH2 = document.querySelector('#chapters h2');
    const currentChapterId = currentChapterH2 ? currentChapterH2.id : null;

    if (chapterId) {
        if (chapterId !== currentChapterId) {
            const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
            if (chapterMeta) {
                await handleChapterClick(chapterMeta.id, chapterMeta.file);
            } else {
                showTocPage();
            }
        }
    } else {
        if (currentChapterId) {
            showTocPage();
        }
    }
});
