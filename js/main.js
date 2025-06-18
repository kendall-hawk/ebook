// js/main.js (更新以适应新的 audioPlayer.js)
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
// import { parseSRT } from './utils.js'; // <-- 移除：parseSRT 不再直接在 main.js 中使用

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
    // 确保清理播放器，而不是直接移除容器，因为新版 audioPlayer 会管理容器
    // 这里调用 cleanup 可能会导致问题，因为 cleanup 在 audioPlayer.js 内部，
    // 应该通过 initAudioPlayer 的内部 cleanup 来处理，或者单独导出一个 cleanup 函数
    // For now, let's just make sure the audio is paused and container is hidden/cleared if it exists.
    const playerContainer = document.getElementById('audio-player');
    if (playerContainer) {
        // 如果 audioPlayer.js 的 cleanup 负责移除容器，这里就不用 remove()
        // 否则，可以在这里隐藏或清空
        playerContainer.innerHTML = ''; // 清空内容
        // playerContainer.style.display = 'none'; // 或者隐藏它
    }
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
    const audioSrc = `data/chapters/audio/${chapterId}.mp3`;
    const srtPath = `data/chapters/srt/${chapterId}.srt`;
    // let subtitleData = []; // <-- 移除：subtitleData 不再在这里加载和解析

    // try {
    //     const srtRes = await fetch(srtPath);
    //     if (srtRes.ok) {
    //         const srtText = await srtRes.text();
    //         subtitleData = parseSRT(srtText); // <-- 移除：由 audioPlayer.js 内部处理
    //     }
    // } catch (err) {
    //     console.warn('SRT 文件加载/解析失败:', err);
    // }

    if (chapterContent) {
        updateActiveChapterTooltips(currentChapterTooltips);

        // 核心步骤：将解析好的字幕数据传递给渲染函数
        // 注意：subtitleData 不再从这里直接传递，renderSingleChapterContent 需要渲染字幕段的 HTML
        // 而字幕数据本身在 audioPlayer.js 中被管理
        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
            // subtitleData // <-- 移除：不再直接传递 subtitleData
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // 调用新的 initAudioPlayer 方式
        // 无论 SRT 是否加载成功，都尝试初始化播放器，但只有当 audioSrc 和 srtPath 有效时才传递
        // audioPlayer.js 内部会处理 srtPath 是否有效
        initAudioPlayer({
            audioSrc: audioSrc,
            srtSrc: srtPath // <-- 新增：传递 SRT 路径
        });

        // 确保渲染完成后，重新绑定字幕段点击事件
        // 这一步非常重要，因为 `bindSubtitleSegmentClicks()` 在 `audioPlayer.js` 中
        // 需要等待 `chapterRenderer.js` 渲染出 `.subtitle-segment` 元素后才能绑定
        // 可以考虑在 renderSingleChapterContent 内部或其回调中触发
        // 或者简单地在 initAudioPlayer 内部 `bindSubtitleSegmentClicks` 之后，
        // 再调用一个函数，确保DOM元素存在，这里先简单调用一下，如果依然有问题，需要更精细的时序控制
        // 例如，一个延迟或监听chapters容器DOM变化
        // 目前 audioPlayer.js 里的 bindSubtitleSegmentClicks 会查询 DOM，
        // 如果DOM未更新，可能无法绑定到新渲染的元素。
        // 一个简单的办法是在 renderSingleChapterContent 渲染完成之后，
        // 在 main.js 中调用 audioPlayer.js 导出的某个函数来触发重新绑定
        // 考虑到您提供的 audioPlayer.js 代码，它会在 initAudioPlayer 内部调用 bindSubtitleSegmentClicks。
        // 但如果 chapterRenderer.js 是异步渲染的，那么 bindSubtitleSegmentClicks 可能会在元素出现之前运行。
        // 更安全的做法是：让 chapterRenderer.js 渲染完成并通知，或者让 audioPlayer 延迟绑定。
        // 暂时先假定 renderSingleChapterContent 是同步的，或者其异步部分不会影响 bindSubtitleSegmentClicks 的元素查找。

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
