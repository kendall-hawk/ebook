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

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    allChapterIndexData = await loadChapterIndex();

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    const allParagraphs = [];
    const chapterContentsPromises = allChapterIndexData.map(async (chMeta) => {
        const chapterData = await loadSingleChapterContent(chMeta.file);
        if (chapterData?.paragraphs) {
            chapterData.paragraphs.forEach(p => {
                if (typeof p === 'string') allParagraphs.push(p);
            });
        }
    });
    await Promise.all(chapterContentsPromises);

    const protectedWordsForFrequency = new Set();
    for (const chapterMeta of allChapterIndexData) {
        const chapterId = chapterMeta.id;
        const tooltipFilePath = `chapters/${chapterId}-tooltips.json`;

        try {
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const chapterTooltips = await res.json();
                for (const tooltipId in chapterTooltips) {
                    if (chapterTooltips[tooltipId]?.word) {
                        protectedWordsForFrequency.add(chapterTooltips[tooltipId].word.toLowerCase());
                    }
                }
            } else {
                console.warn(`无法加载 Tooltip 数据: ${tooltipFilePath}`);
            }
        } catch (err) {
            console.error(`Tooltip 加载错误: ${tooltipFilePath}`, err);
        }
    }

    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) ch.categories.forEach(cat => categories.add(cat));
    });
    renderCategoryNavigation(Array.from(categories));

    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
    setupTooltips();

    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        chapterMeta ? handleChapterClick(chapterMeta.id, chapterMeta.file) : showTocPage();
    } else {
        showTocPage();
    }
});

function renderCategoryNavigation(categories) {
    const nav = document.getElementById('category-nav');
    if (!nav) return;

    nav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.classList.add('category-button');
    allBtn.dataset.category = 'all';
    allBtn.textContent = 'All Articles';
    nav.appendChild(allBtn);

    categories.sort().forEach(category => {
        const btn = document.createElement('button');
        btn.classList.add('category-button');
        btn.dataset.category = category;
        btn.textContent = category;
        nav.appendChild(btn);
    });

    nav.querySelectorAll('.category-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === currentFilterCategory);
        btn.addEventListener('click', () => {
            currentFilterCategory = btn.dataset.category;
            nav.querySelectorAll('.category-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
            showTocPage();
            window.location.hash = '';
        });
    });
}

function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid';
    document.getElementById('category-nav').style.display = 'flex';

    const audio = document.querySelector('audio');
    if (audio) {
        audio.pause();
        audio.style.display = 'none';
    }

    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
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

    let currentTooltips = {};
    const tooltipFile = `chapters/${chapterId}-tooltips.json`;
    try {
        const res = await fetch(`data/${tooltipFile}`);
        if (res.ok) currentTooltips = await res.json();
        else console.warn(`未找到 Tooltip 数据: ${tooltipFile}`);
    } catch (err) {
        console.error(`加载 Tooltip 错误: ${tooltipFile}`, err);
    }

    if (chapterContent) {
        updateActiveChapterTooltips(currentTooltips);

        renderSingleChapterContent(
            chapterContent,
            currentTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        const driveId = allChapterIndexData.find(ch => ch.id === chapterId)?.googleDriveAudioId;
        const driveUrl = `https://docs.google.com/uc?export=download&id=${driveId}`;
        const localAudio = `data/chapters/audio/${chapterId}.mp3`;
        const srtFile = `data/chapters/srt/${chapterId}.srt`;

        try {
            const testRes = await fetch(driveUrl, { method: 'HEAD' });
            if (testRes.ok) {
                initAudioPlayer({ audioSrc: driveUrl, srtSrc: srtFile });
            } else {
                console.warn(`Google Drive 音频不可用，使用本地备份: ${localAudio}`);
                initAudioPlayer({ audioSrc: localAudio, srtSrc: srtFile });
            }
        } catch (err) {
            console.error(`Google Drive 音频加载失败，使用本地备份: ${localAudio}`, err);
            initAudioPlayer({ audioSrc: localAudio, srtSrc: srtFile });
        }

        const audioEl = document.querySelector('audio');
        if (audioEl) audioEl.style.display = 'block';

    } else {
        alert('章节加载失败！');
        showTocPage();
    }
}

window.addEventListener('hashchange', () => {
    const chapterId = window.location.hash.substring(1);
    if (!chapterId) return showTocPage();

    const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
    if (!chapterMeta) return showTocPage();

    const currentChapterEl = document.getElementById('chapters');
    const currentTitleEl = currentChapterEl.querySelector('h2');
    const displayedId = currentTitleEl?.id;

    if (currentChapterEl.style.display === 'none' || displayedId !== chapterId) {
        handleChapterClick(chapterMeta.id, chapterMeta.file);
    }
});