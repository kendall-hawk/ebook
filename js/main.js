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

    // --- 全局词频计算 ---
    const allParagraphs = [];
    const protectedWordsForFrequency = new Set();

    await Promise.all(allChapterIndexData.map(async (chMeta) => {
        const chapterData = await loadSingleChapterContent(chMeta.file);
        if (chapterData?.paragraphs) {
            chapterData.paragraphs.forEach(p => {
                if (typeof p === 'string') allParagraphs.push(p);
            });
        }

        const tooltipFilePath = `chapters/${chMeta.id}-tooltips.json`;
        try {
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const tooltips = await res.json();
                for (const key in tooltips) {
                    if (tooltips[key]?.word) {
                        protectedWordsForFrequency.add(tooltips[key].word.toLowerCase());
                    }
                }
            }
        } catch (e) {
            console.warn(`无法加载 Tooltip 数据：${tooltipFilePath}`);
        }
    }));

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
            showTocPage();
        }
    } else {
        showTocPage();
    }
});

function renderCategoryNavigation(categories) {
    const nav = document.getElementById('category-nav');
    if (!nav) return;

    nav.innerHTML = '';
    const allBtn = document.createElement('button');
    allBtn.className = 'category-button';
    allBtn.dataset.category = 'all';
    allBtn.textContent = 'All Articles';
    nav.appendChild(allBtn);

    categories.sort().forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-button';
        btn.dataset.category = cat;
        btn.textContent = cat;
        nav.appendChild(btn);
    });

    nav.querySelectorAll('.category-button').forEach(btn => {
        if (btn.dataset.category === currentFilterCategory) {
            btn.classList.add('active');
        }
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
        window.location.hash = '';
        return;
    }

    document.getElementById('toc').style.display = 'none';
    document.getElementById('category-nav').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';

    const chapterContent = await loadSingleChapterContent(filePath);
    let currentTooltips = {};
    const tooltipPath = `data/chapters/${chapterId}-tooltips.json`;

    try {
        const res = await fetch(tooltipPath);
        if (res.ok) {
            currentTooltips = await res.json();
        } else {
            console.warn(`无 Tooltip 数据：${tooltipPath}`);
        }
    } catch (e) {
        console.error(`Tooltip 加载失败: ${tooltipPath}`, e);
    }

    updateActiveChapterTooltips(currentTooltips);

    if (chapterContent) {
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
        const srtPath = `data/chapters/srt/${chapterId}.srt`;
        const localAudio = `audio/${chapterId}.mp3`;
        const driveAudioUrl = driveId ? `https://docs.google.com/uc?export=download&id=${driveId}` : null;

        if (!driveAudioUrl) {
            console.warn(`章节 ${chapterId} 缺少 googleDriveAudioId，回退到本地音频`);
            initAudioPlayer({ audioSrc: localAudio, srtSrc: srtPath });
            return;
        }

        try {
            const res = await fetch(driveAudioUrl, { method: 'HEAD' });
            if (res.ok && res.headers.get('content-type')?.includes('audio')) {
                initAudioPlayer({ audioSrc: driveAudioUrl, srtSrc: srtPath });
            } else {
                console.warn(`Google Drive 音频不可用，切换本地：${localAudio}`);
                initAudioPlayer({ audioSrc: localAudio, srtSrc: srtPath });
            }
        } catch (e) {
            console.error(`加载 Google Drive 音频失败，切换本地：${localAudio}`, e);
            initAudioPlayer({ audioSrc: localAudio, srtSrc: srtPath });
        }

        const audioElement = document.querySelector('audio');
        if (audioElement) {
            audioElement.style.display = 'block';
        }

    } else {
        alert('无法加载章节内容！');
        showTocPage();
        window.location.hash = '';
    }
}

window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            const chapterEl = document.getElementById('chapters');
            const currentId = chapterEl.querySelector('h2')?.id;
            if (chapterEl.style.display === 'none' || currentId !== chapterId) {
                handleChapterClick(chapterMeta.id, chapterMeta.file);
            }
        } else {
            showTocPage();
            window.location.hash = '';
        }
    } else {
        showTocPage();
    }
});