// js/main.js
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
                if (typeof p === 'string') {
                    allParagraphs.push(p);
                }
            });
        }
    });
    await Promise.all(chapterContentsPromises);

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
            } else {
                console.warn(`无法加载 Tooltip 数据: ${tooltipFilePath}`);
            }
        } catch (error) {
            console.error(`Tooltip 数据加载失败 (${tooltipFilePath}):`, error);
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
            showTocPage();
        }
    } else {
        showTocPage();
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
    categoryNav.appendChild(newAllButton);

    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        categoryNav.appendChild(button);
    });

    categoryNav.querySelectorAll('.category-button').forEach(btn => {
        if (btn.dataset.category === currentFilterCategory) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            currentFilterCategory = button.dataset.category;
            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
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
    const audioPlayerElement = document.querySelector('audio');
    if (audioPlayerElement) {
        audioPlayerElement.style.display = 'none';
        audioPlayerElement.pause();
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
    let currentChapterTooltips = {};
    const chapterTooltipFilePath = `chapters/${chapterId}-tooltips.json`;

    try {
        const res = await fetch(`data/${chapterTooltipFilePath}`);
        if (res.ok) {
            currentChapterTooltips = await res.json();
            console.log(`加载 Tooltip 成功: ${chapterId}`, currentChapterTooltips);
        } else {
            console.warn(`Tooltip 文件不存在: ${chapterTooltipFilePath}`);
        }
    } catch (error) {
        console.error(`加载 Tooltip 失败: ${chapterId}`, error);
    }

    if (chapterContent) {
        updateActiveChapterTooltips(currentChapterTooltips);

        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // === Google Drive 音频加载 + 本地备份逻辑 ===
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        const googleDriveId = chapterMeta?.googleDriveAudioId;
        const localAudioPath = `data/chapters/audio/${chapterId}.mp3`;
        const srtPath = `data/chapters/srt/${chapterId}.srt`;

        let finalAudioUrl = null;
        let srtExists = false; // Flag to check if SRT exists

        // Check for Google Drive audio
        if (googleDriveId) {
            const networkAudioUrl = `https://docs.google.com/uc?export=download&id=${googleDriveId}`;
            try {
                const headRes = await fetch(networkAudioUrl, { method: 'HEAD' });
                if (headRes.ok && headRes.status < 400) {
                    finalAudioUrl = networkAudioUrl;
                } else {
                    console.warn(`Google Drive 音频不可用，状态: ${headRes.status}。`);
                }
            } catch (err) {
                console.error('Google Drive 音频检测失败:', err);
            }
        }

        // If Google Drive audio not found or not available, check local audio
        if (!finalAudioUrl) {
            try {
                const localAudioRes = await fetch(localAudioPath, { method: 'HEAD' });
                if (localAudioRes.ok && localAudioRes.status < 400) {
                    finalAudioUrl = localAudioPath;
                } else {
                    console.warn(`本地音频不可用: ${localAudioPath}`);
                }
            } catch (err) {
                console.error('本地音频检测失败:', err);
            }
        }

        // Check for SRT file existence
        try {
            const srtRes = await fetch(srtPath, { method: 'HEAD' });
            if (srtRes.ok && srtRes.status < 400) {
                srtExists = true;
            } else {
                console.warn(`SRT 文件不存在: ${srtPath}`);
            }
        } catch (err) {
            console.error('SRT 文件检测失败:', err);
        }

        const audioPlayerElement = document.querySelector('audio');

        if (finalAudioUrl && srtExists) { // Only initialize and show if both audio and SRT exist
            initAudioPlayer({
                audioSrc: finalAudioUrl,
                srtSrc: srtPath
            });
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'block';
            }
        } else {
            // Hide player if no audio or no SRT
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'none';
                audioPlayerElement.pause(); // Pause if it was playing
            }
            console.warn(`章节 ${chapterId} 没有可用的音频或 SRT 文件，因此不显示音频播放器。`);
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
        const currentChapterElement = document.getElementById('chapters');
        const currentTitleId = currentChapterElement.querySelector('h2')?.id;
        if (currentChapterElement.style.display === 'none' || currentTitleId !== chapterId) {
            if (chapterMeta) {
                await handleChapterClick(chapterMeta.id, chapterMeta.file);
            }
        }
    } else {
        showTocPage();
    }
});