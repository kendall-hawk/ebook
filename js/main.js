// js/main.js (最终修正版)
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
import { parseSRT } from './audio/srtParser.js'; // 导入 parseSRT

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
    await Promise.allSettled(chapterContentsPromises); // 使用 Promise.allSettled

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

    // === 音频和 SRT 逻辑提前：先加载 SRT，再渲染章节内容 ===
    const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
    const googleDriveId = chapterMeta?.googleDriveAudioId;
    // 🚨 路径修正: 使用你确认的 `data/chapters/audio/`
    const localAudioPath = `data/chapters/audio/${chapterId}.mp3`;
    // 🚨 路径修正: 使用你确认的 `data/chapters/srt/`
    const srtPath = `data/chapters/srt/${chapterId}.srt`;

    let finalAudioUrl = null;
    let subtitleData = []; // 定义字幕数据变量
    let srtExists = false;

    // 尝试加载 SRT 文件
    try {
        const srtRes = await fetch(srtPath); // 注意：这里是直接获取内容
        if (srtRes.ok && srtRes.status < 400) {
            const srtText = await srtRes.text();
            subtitleData = parseSRT(srtText); // 解析 SRT 内容
            srtExists = true;
            console.log(`SRT 文件加载并解析成功: ${srtPath}, 条目数: ${subtitleData.length}`);
        } else {
            console.warn(`SRT 文件不存在或加载失败: ${srtPath}`);
        }
    } catch (err) {
        console.error('SRT 文件加载/解析失败:', err);
    }

    // 检查 Google Drive 音频
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

    // 如果 Google Drive 音频未找到或不可用，检查本地音频
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
    // === 音频和 SRT 逻辑结束 ===

    if (chapterContent) {
        updateActiveChapterTooltips(currentChapterTooltips);

        // 关键修正：将 subtitleData 传递给 renderSingleChapterContent
        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick,
            subtitleData // 传递字幕数据，以便在渲染时进行预标记
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        const audioPlayerElement = document.querySelector('audio');

        if (finalAudioUrl && srtExists && subtitleData.length > 0) { // 确保音频、SRT和解析后的字幕数据都存在
            // 关键修正：将已解析的 subtitleData 传递给 initAudioPlayer
            initAudioPlayer({
                audioSrc: finalAudioUrl,
                srtSrc: srtPath, // srtSrc 仍然保留用于 fallback 或调试
                initialSubtitleData: subtitleData // 传递已解析的数据，避免重复 fetch
            });
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'block';
            }
        } else {
            // 隐藏播放器如果音频、SRT 或解析后的字幕数据缺失
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'none';
                audioPlayerElement.pause(); // 暂停播放
            }
            console.warn(`章节 ${chapterId} 没有可用的音频、SRT 文件或字幕解析失败，因此不显示音频播放器。`);
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
        // 只有当章节容器隐藏或者显示的章节ID不匹配时才重新加载
        if (currentChapterElement.style.display === 'none' || currentTitleId !== chapterId) {
            if (chapterMeta) {
                await handleChapterClick(chapterMeta.id, chapterMeta.file);
            }
        }
    } else {
        showTocPage();
    }
});
