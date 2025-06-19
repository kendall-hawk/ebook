/**
 * js/main.js (主应用逻辑)
 * 协调所有模块，处理页面加载、导航、数据初始化等。
 */

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
import { initAudioPlayer, cleanupAudioPlayer } from './audio/audioPlayer.js';
import { setupFloatingYouTube, setupVideoAutoPause } from './youtube.js';
import { parseSRT } from './utils.js'; // 导入 parseSRT，因为 main.js 也会直接加载和解析 SRT

let allChapterIndexData = [];
let allChapterTooltipsData = {}; // 全局存储所有章节的工具提示数据
let allChapterSrtData = {};      // 全局存储所有章节的 SRT 数据
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded fired.');

    // 1. 初始化 YouTube 视频自动暂停功能 (只设置一次全局监听器)
    setupVideoAutoPause();

    // 2. 加载章节索引
    allChapterIndexData = await loadChapterIndex();
    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // 3. 预加载所有章节的 Tooltip 和 SRT 数据，并收集 protectedWords
    // 这样做可以确保在渲染任何章节时，所有相关数据都是可用的，避免重复 fetch。
    const allParagraphTexts = [];
    const protectedWordsForFrequency = new Set(); // 从所有 tooltip 文件中收集保护词

    const dataLoadingPromises = allChapterIndexData.map(async (chMeta) => {
        // 加载章节内容以获取段落（用于词频计算）
        try {
            const chapterData = await loadSingleChapterContent(chMeta.file);
            if (chapterData?.paragraphs) {
                chapterData.paragraphs.forEach(p => {
                    if (typeof p === 'string') {
                        allParagraphTexts.push(p);
                    }
                });
            }
        } catch (error) {
            console.warn(`加载章节内容失败 (${chMeta.file}):`, error);
        }

        // 加载并解析对应的 tooltip 文件
        const tooltipFilePath = `chapters/${chMeta.id}-tooltips.json`;
        try {
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const chapterTooltips = await res.json();
                allChapterTooltipsData[chMeta.id] = chapterTooltips;
                // 收集 protectedWords
                for (const tooltipId in chapterTooltips) {
                    const tooltipEntry = chapterTooltips[tooltipId];
                    if (tooltipEntry && tooltipEntry.word && typeof tooltipEntry.word === 'string') {
                        protectedWordsForFrequency.add(tooltipEntry.word.toLowerCase());
                    }
                }
            } else {
                console.warn(`加载 Tooltip 文件失败 (${tooltipFilePath}): ${res.statusText}`);
            }
        } catch (error) {
            console.warn(`解析 Tooltip 文件失败 (${tooltipFilePath}):`, error);
        }

        // 加载并解析对应的 SRT 文件
        // 这里的路径需要与 audioPlayer.js 和 chapterRenderer.js 中的约定保持一致
        const srtFilePath = `chapters/srt/${chMeta.id}.srt`; // 修正后的路径
        try {
            const srtRes = await fetch(`data/${srtFilePath}`);
            if (srtRes.ok) {
                const srtText = await srtRes.text();
                allChapterSrtData[chMeta.id] = parseSRT(srtText);
            } else {
                console.warn(`加载 SRT 文件失败 (${srtFilePath}): ${srtRes.statusText}`);
            }
        } catch (error) {
            console.warn(`解析 SRT 文件失败 (${srtFilePath}):`, error);
        }
    });

    await Promise.all(dataLoadingPromises); // 等待所有数据加载完成
    console.log("All Tooltip and SRT data pre-loaded.");

    // 4. 计算全局词频 (在所有章节内容加载后再计算，以确保准确性)
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphTexts, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);
    console.log("Global word frequencies calculated. Max Freq:", maxFreq);

    // 5. 渲染分类导航
    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));

    // 6. 初始化工具提示模块 (绑定全局事件监听器和 Marked.js 配置)
    // 确保 Marked.js 的 sanitize: false 配置在此处生效
    setupTooltips();

    // 7. 处理初始路由/URL哈希
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            await handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            // 如果哈希存在但章节未找到，显示目录页
            console.warn(`URL hash "${initialChapterId}" does not correspond to a valid chapter. Showing TOC.`);
            showTocPage();
        }
    } else {
        // 没有哈希，默认显示目录页
        console.log('No initial hash, showing TOC.');
        showTocPage();
    }

    // 8. 监听 URL 哈希变化
    window.addEventListener('hashchange', async () => {
        console.log('Hashchange detected. New hash:', window.location.hash);
        const newChapterId = window.location.hash.substring(1);
        // 获取当前章节的ID（如果有的话）
        const currentChapterH2 = document.querySelector('#chapters h2');
        const currentDisplayedChapterId = currentChapterH2 ? currentChapterH2.id : null;

        if (newChapterId && newChapterId !== currentDisplayedChapterId) {
            // 如果哈希改变且不是当前已显示的章节
            const chapterMeta = allChapterIndexData.find(ch => ch.id === newChapterId);
            if (chapterMeta) {
                await handleChapterClick(chapterMeta.id, chapterMeta.file);
            } else {
                // 如果哈希对应的章节不存在，回到目录页
                console.warn(`Hashchange to unknown chapter "${newChapterId}". Showing TOC.`);
                showTocPage();
            }
        } else if (!newChapterId && currentDisplayedChapterId) {
            // 如果哈希被清空，且当前有章节显示，则回到目录页
            console.log('Hash cleared. Showing TOC.');
            showTocPage();
        }
        // else: 哈希没变，或者哈希为空且本来就在目录页，不做任何操作
    });
});


/**
 * 渲染分类导航按钮。
 * @param {Array<string>} categories - 分类名称数组。
 */
function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

    categoryNav.innerHTML = ''; // 清空旧按钮

    // 添加“所有文章”按钮
    const allButton = document.createElement('button');
    allButton.classList.add('category-button');
    allButton.dataset.category = 'all';
    allButton.textContent = 'All Articles';
    // 确保当前活跃类别正确高亮
    if (currentFilterCategory === 'all') {
        allButton.classList.add('active');
    }
    categoryNav.appendChild(allButton);

    // 添加其他分类按钮
    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        if (currentFilterCategory === category) {
            button.classList.add('active');
        }
        categoryNav.appendChild(button);
    });

    // 绑定点击事件
    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            currentFilterCategory = button.dataset.category;
            // 更新激活状态
            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            showTocPage(); // 重新渲染目录
        });
    });
}

/**
 * 显示章节目录页面，隐藏章节内容和音频播放器。
 */
function showTocPage() {
    console.log('Showing TOC page.');
    document.getElementById('chapters').style.display = 'none';
    cleanupAudioPlayer(); // 隐藏目录页时，清理并隐藏音频播放器

    document.getElementById('toc').style.display = 'grid'; // TOC使用grid布局
    document.getElementById('category-nav').style.display = 'flex'; // 分类导航显示

    // 重新渲染目录，以应用当前的筛选类别
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // 清空 URL hash，表示当前在目录页
    // 只有当hash存在时才pushState，避免不必要的history entry
    if (window.location.hash !== '') {
        // 使用 replaceState 避免在返回时创建新的历史记录条目，因为我们只是“清除”哈希。
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
}

/**
 * 处理章节点击事件，加载并显示章节内容。
 * @param {string} chapterId - 章节的 ID。
 * @param {string} filePath - 章节内容文件的路径。
 */
async function handleChapterClick(chapterId, filePath) {
    if (!chapterId || !filePath) {
        console.error('无效的章节ID或文件路径。');
        showTocPage();
        return;
    }
    console.log(`Loading chapter: ${chapterId} from ${filePath}`);

    // 隐藏目录和分类导航，显示章节内容容器
    document.getElementById('toc').style.display = 'none';
    document.getElementById('category-nav').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';

    const chapterContent = await loadSingleChapterContent(filePath);
    if (!chapterContent) {
        alert('无法加载章节内容！请检查章节文件是否存在和格式是否正确。');
        showTocPage(); // 加载失败则返回目录页
        return;
    }

    // 从预加载的全局数据中获取当前章节的 Tooltip 和 SRT 数据
    const currentChapterTooltips = allChapterTooltipsData[chapterId] || {};
    const subtitleDataForRenderer = allChapterSrtData[chapterId] || [];

    // 准备音频文件路径
    const audioSrc = chapterContent.audio ? `data/chapters/audio/${chapterContent.audio}` : null;

    // 更新 tooltip 模块的当前章节数据
    updateActiveChapterTooltips(currentChapterTooltips);

    // 渲染章节内容 (包含工具提示、词频样式和字幕段落)
    renderSingleChapterContent(
        chapterContent,
        currentChapterTooltips,
        getGlobalWordFrequenciesMap(),
        getGlobalMaxFreq(),
        subtitleDataForRenderer // 传递字幕数据给 chapterRenderer
    );

    // 更新 URL hash
    // 只有当hash不等于当前章节ID时才更新，避免不必要的历史记录
    if (window.location.hash.substring(1) !== chapterId) {
         window.location.hash = chapterId;
    }

    // 滚动到章节顶部
    document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

    // 初始化音频播放器
    if (audioSrc) { // 只有当有音频文件时才初始化播放器
        initAudioPlayer({
            audioSrc: audioSrc,
            srtSrc: `data/chapters/srt/${chapterId}.srt` // SRT 路径总是根据 chapterId 构造
        });
    } else {
        cleanupAudioPlayer(); // 如果没有音频，确保播放器被清理和隐藏
        console.warn(`Chapter ${chapterId} does not have an associated audio file.`);
    }

    // 每次加载章节后重新设置浮动 YouTube 播放器，以处理新加载的视频
    setupFloatingYouTube();
}
