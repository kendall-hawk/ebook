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
import { initAudioPlayer, cleanupAudioPlayer } from './audio/audioPlayer.js'; // 导入清理函数
import { setupFloatingYouTube, setupVideoAutoPause } from './youtube.js';


let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化 YouTube 视频功能
    setupVideoAutoPause();
    // setupFloatingYouTube() 将在加载章节内容后被调用，因为需要等待 iframe 存在

    // 2. 加载章节索引
    allChapterIndexData = await loadChapterIndex();

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // 3. 计算全局词频 (在所有章节内容加载后再计算，以确保准确性)
    const allParagraphTexts = [];
    const protectedWordsForFrequency = new Set(); // 从所有 tooltip 文件中收集保护词

    for (const chMeta of allChapterIndexData) {
        try {
            // 加载章节内容以获取段落
            const chapterData = await loadSingleChapterContent(chMeta.file);
            if (chapterData?.paragraphs) {
                chapterData.paragraphs.forEach(p => {
                    if (typeof p === 'string') {
                        allParagraphTexts.push(p);
                    }
                });
            }

            // 加载并解析对应的 tooltip 文件，收集 protectedWords
            const tooltipFilePath = `chapters/${chMeta.id}-tooltips.json`;
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const chapterTooltips = await res.json();
                for (const tooltipId in chapterTooltips) {
                    const tooltipEntry = chapterTooltips[tooltipId];
                    if (tooltipEntry && tooltipEntry.word) {
                        protectedWordsForFrequency.add(tooltipEntry.word.toLowerCase());
                    }
                }
            }
        } catch (error) {
            // 静默处理加载章节内容或 tooltip 文件失败，不中断主流程
            // console.warn(`加载或处理章节/tooltip文件失败 (${chMeta.file} / ${chMeta.id}-tooltips.json):`, error);
        }
    }

    // 实际计算词频
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphTexts, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    // 4. 渲染分类导航
    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));

    // 5. 初始化工具提示模块 (绑定全局事件监听器)
    setupTooltips();

    // 6. 处理初始路由/URL哈希
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            await handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            // 如果哈希存在但章节未找到，显示目录页
            showTocPage();
        }
    } else {
        // 没有哈希，默认显示目录页
        showTocPage();
    }

    // 7. 监听 URL 哈希变化
    window.addEventListener('hashchange', async () => {
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
                showTocPage();
            }
        } else if (!newChapterId && currentDisplayedChapterId) {
            // 如果哈希被清空，且当前有章节显示，则回到目录页
            showTocPage();
        }
        // else: 哈希没变，或者哈希为空且本来就在目录页，不做任何操作
    });

    // 确保在所有内容加载和渲染完毕后，再初始化浮动YouTube视频功能
    // setupFloatingYouTube 会查找页面上的 YouTube iframe，所以需要在它们存在后调用
    setupFloatingYouTube();
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
    allButton.classList.add('active'); // 默认激活
    categoryNav.appendChild(allButton);

    // 添加其他分类按钮
    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        categoryNav.appendChild(button);
    });

    // 绑定点击事件 (使用事件委托更好，但这里直接绑定也行)
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
    document.getElementById('chapters').style.display = 'none';
    cleanupAudioPlayer(); // 隐藏目录页时，清理并隐藏音频播放器

    document.getElementById('toc').style.display = 'grid'; // TOC使用grid布局
    document.getElementById('category-nav').style.display = 'flex'; // 分类导航显示

    // 重新渲染目录，以应用当前的筛选类别
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // 清空 URL hash，表示当前在目录页
    if (window.location.hash !== '') {
        history.pushState(null, '', window.location.pathname + window.location.search);
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

    // 隐藏目录和分类导航，显示章节内容容器
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
            // console.log(`加载 Tooltip 成功: ${chapterId}`);
        }
    } catch (error) {
        console.warn(`加载 Tooltip 失败: ${chapterId}`, error);
    }

    // 准备音频和 SRT 数据
    const audioSrc = `data/audio/chapters/${chapterId}.mp3`;
    const srtPath = `data/srt/chapters/${chapterId}.srt`;
    let subtitleDataForRenderer = []; // 用于渲染器注入字幕段

    try {
        const srtRes = await fetch(srtPath);
        if (srtRes.ok) {
            const srtText = await srtRes.text();
            subtitleDataForRenderer = parseSRT(srtText);
        }
    } catch (err) {
        console.warn('SRT 文件加载/解析失败，但音频播放器仍将尝试加载:', err);
    }

    if (chapterContent) {
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
        window.location.hash = chapterId;
        // 滚动到章节顶部
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // 初始化音频播放器
        initAudioPlayer({
            audioSrc: audioSrc,
            srtSrc: srtPath
        });

    } else {
        alert('无法加载章节内容！请检查章节文件是否存在和格式是否正确。');
        showTocPage(); // 加载失败则返回目录页
    }
}
