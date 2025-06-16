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
// 导入 updateActiveChapterTooltips，因为它需要被调用来更新 tooltip 模块的数据
import { setupTooltips, updateActiveChapterTooltips } from './tooltip.js'; 
import { getWordFrequencies } from './wordFrequency.js';
// ✨ 新增：导入 audioPlayer.js 模块
import { initAudioPlayer } from './audio/audioPlayer.js'; 

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    // 首次加载时隐藏音频播放器，直到章节内容加载
    // 通常 audioPlayer.js 会动态创建并添加 audio 元素，
    // 如果你希望在加载任何章节之前就让它存在于 DOM 但不显示，
    // 可以在这里或 CSS 中对其进行初始隐藏设置。
    // 不过，由于 audioPlayer.js 会在 initAudioPlayer 时动态创建，
    // 这一步并非强制，只是一个考虑。

    allChapterIndexData = await loadChapterIndex(); // 加载所有章节索引

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // --- 词频计算优化：在所有章节加载完成后一次性计算 ---
    const allParagraphs = [];
    const chapterContentsPromises = allChapterIndexData.map(async (chMeta) => {
        const chapterData = await loadSingleChapterContent(chMeta.file);
        if (chapterData && chapterData.paragraphs) {
            chapterData.paragraphs.forEach(p => {
                if (typeof p === 'string') {
                    allParagraphs.push(p);
                }
            });
        }
    });
    // 等待所有章节内容加载完毕
    await Promise.all(chapterContentsPromises);


    // --- 收集所有 Tooltip 词汇（无论是 [[word|id]] 中的 word 还是 data/chapters/N-tooltips.json 中的 word）作为受保护词 ---
    const protectedWordsForFrequency = new Set();
    for (const chapterMeta of allChapterIndexData) {
        const chapterId = chapterMeta.id; // 例如 'chap-01'
        const tooltipFilePath = `chapters/${chapterId}-tooltips.json`; // 假设约定好的路径

        try {
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const chapterTooltips = await res.json();
                for (const tooltipId in chapterTooltips) {
                    if (Object.hasOwnProperty.call(chapterTooltips, tooltipId)) {
                        const tooltipEntry = chapterTooltips[tooltipId];
                        // 将 Tooltip 数据中的 `word` 字段加入受保护词列表 (如果存在)
                        if (tooltipEntry.word) {
                            protectedWordsForFrequency.add(tooltipEntry.word.toLowerCase());
                        }
                        // 如果 tooltipId 本身是一个有意义的词，也可以考虑加入
                        // protectedWordsForFrequency.add(tooltipId.split('-')[0].toLowerCase()); // 例如 'invention-noun' -> 'invention'
                    }
                }
            } else {
                console.warn(`未找到或无法加载章节 Tooltip 数据: ${tooltipFilePath}. Status: ${res.status}`);
            }
        } catch (error) {
            console.error(`加载章节 Tooltip 数据失败 (${tooltipFilePath}):`, error);
        }
    }

    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    console.log('--- 词频计算结果 (main.js) ---');
    console.log('全局词频 Map:', getGlobalWordFrequenciesMap());
    console.log('全局最高频率:', getGlobalMaxFreq());
    console.log('受保护的 Tooltip 词 (用于词频计算):', protectedWordsForFrequency);
    console.log('--- 词频计算结束 ---');

    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));

    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // **重要：在页面首次加载时就设置 Tooltip 事件监听器**
    setupTooltips(); // Tooltip 的事件监听器只需要设置一次

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
            const selectedCategory = button.dataset.category;
            currentFilterCategory = selectedCategory;

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
    // 当返回目录页时，如果之前加载了音频播放器，可以考虑隐藏它
    const audioPlayerElement = document.querySelector('audio');
    if (audioPlayerElement) {
        audioPlayerElement.style.display = 'none';
        audioPlayerElement.pause(); // 暂停播放
    }
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
}

/**
 * 处理章节点击事件的回调函数。
 * @param {string} chapterId - 被点击章节的 ID。如果为空，表示返回主页。
 * @param {string} filePath - 被点击章节的文件路径。
 */
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

    // --- 新增：加载当前章节的 Tooltip 数据 ---
    let currentChapterTooltips = {};
    const chapterTooltipFilePath = `chapters/${chapterId}-tooltips.json`; // 根据章节ID构建 Tooltip 文件路径
    try {
        const res = await fetch(`data/${chapterTooltipFilePath}`);
        if (res.ok) {
            currentChapterTooltips = await res.json();
            console.log(`加载章节 ${chapterId} 的 Tooltip 数据成功:`, currentChapterTooltips);
        } else {
            // 如果文件不存在，可能是该章节没有自定义 Tooltip，这不是错误
            console.warn(`章节 ${chapterId} 没有专属 Tooltip 数据 (${chapterTooltipFilePath}). Status: ${res.status}`);
        }
    } catch (error) {
        console.error(`加载章节 ${chapterId} 的 Tooltip 数据失败:`, error);
    }
    // --- 新增结束 ---


    if (chapterContent) {
        // ✨ 关键修正：在渲染章节内容之前，更新 Tooltip 模块内部的当前章节数据 ✨
        // 确保当用户点击单词时，tooltip.js 能够访问到当前章节的 tooltip 详情
        updateActiveChapterTooltips(currentChapterTooltips); 

        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips, // 将章节专属 Tooltip 数据传递给渲染器
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // ✨ 关键更改：在这里初始化音频播放器 ✨
        // 获取当前章节对应的 Google Drive 文件 ID
        // **非常重要：你需要确保 chapters.json 中的每个章节都包含一个 'googleDriveAudioId' 字段。**
        const currentGoogleDriveFileId = allChapterIndexData.find(ch => ch.id === chapterId)?.googleDriveAudioId;

        if (!currentGoogleDriveFileId) {
            console.error(`未找到章节 ${chapterId} 对应的 Google Drive 音频文件 ID，无法初始化音频播放器。`);
            // 你可以选择在这里不初始化音频播放器，或者显示一个用户友好的错误信息
            // alert(`无法播放章节 ${chapterId} 的音频，缺少 Google Drive 文件 ID。`);
            // 如果缺少音频，可以考虑隐藏播放器
            const audioPlayerElement = document.querySelector('audio');
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'none';
                audioPlayerElement.pause();
            }
            return; // 停止执行，不加载音频
        }

        const networkAudioUrl = `https://docs.google.com/uc?export=download&id=${currentGoogleDriveFileId}`;
        const localSrtPath = `data/chapters/srt/${chapterId}.srt`; 

        initAudioPlayer({
            audioSrc: networkAudioUrl,
            srtSrc: localSrtPath
        });

        // 确保音频播放器在章节加载时是可见的
        const audioPlayerElement = document.querySelector('audio');
        if (audioPlayerElement) {
            audioPlayerElement.style.display = 'block';
        }

    } else {
        alert('无法加载章节内容！');
        showTocPage();
        window.location.hash = '';
    }
}

// 监听 URL hash 变化，实现前进/后退按钮的导航
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            const currentDisplayedChapterElement = document.getElementById('chapters');
            // 获取当前显示的章节标题ID，以避免重复加载相同的章节
            const currentDisplayedChapterTitleElement = currentDisplayedChapterElement.querySelector('h2');
            const currentDisplayedChapterId = currentDisplayedChapterTitleElement ? currentDisplayedChapterTitleElement.id : null;

            if (currentDisplayedChapterElement.style.display === 'none' || currentDisplayedChapterId !== chapterId) {
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
