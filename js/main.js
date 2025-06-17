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
// 导入 audioPlayer 模块的 initAudioPlayer 函数。
// 由于 audioPlayer.js 已经将自身挂载到 window.audioPlayer，这里可以不再显式导入所有函数。
// 但为了代码的清晰性和未来的模块化，我们保留 initAudioPlayer 的导入。
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

    // --- 全局词频计算开始 ---
    // 收集所有章节的所有段落，用于计算全局词频
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
    await Promise.all(chapterContentsPromises); // 等待所有章节内容加载完毕

    // 收集所有 Tooltip 中的单词，将它们标记为受保护词，不计入词频统计
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
                        // 将 Tooltip 单词添加到保护列表中，确保它们不会被词频统计所影响
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

    // 计算全局词频
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);
    // --- 全局词频计算结束 ---


    // 渲染分类导航
    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // 设置 Tooltip 事件监听
    setupTooltips();

    // 根据 URL hash 加载初始章节或显示目录
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            // 如果 hash 指向的章节不存在，则显示目录
            showTocPage();
        }
    } else {
        // 如果没有 hash，则显示目录
        showTocPage();
    }
});

/**
 * 渲染分类导航按钮。
 * @param {string[]} categories - 所有章节的分类数组。
 */
function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

    categoryNav.innerHTML = ''; // 清空现有按钮

    // 添加“所有文章”按钮
    const newAllButton = document.createElement('button');
    newAllButton.classList.add('category-button');
    newAllButton.dataset.category = 'all';
    newAllButton.textContent = 'All Articles';
    categoryNav.appendChild(newAllButton);

    // 添加其他分类按钮，并按字母排序
    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        categoryNav.appendChild(button);
    });

    // 设置当前激活的分类按钮样式
    categoryNav.querySelectorAll('.category-button').forEach(btn => {
        if (btn.dataset.category === currentFilterCategory) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 为分类按钮添加点击事件监听器
    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            currentFilterCategory = button.dataset.category; // 更新当前过滤器
            // 移除所有按钮的 active 样式，然后给当前点击的按钮添加 active 样式
            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            // 重新渲染章节目录，并显示目录页
            renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
            showTocPage();
            window.location.hash = ''; // 清除 URL hash
        });
    });
}

/**
 * 显示章节目录页面并隐藏章节内容及音频播放器。
 */
function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid'; // 假设 toc 是 grid 布局
    document.getElementById('category-nav').style.display = 'flex'; // 假设分类导航是 flex 布局

    // 隐藏并暂停音频播放器
    const audioPlayerElement = document.querySelector('audio');
    if (audioPlayerElement) {
        audioPlayerElement.style.display = 'none';
        audioPlayerElement.pause();
    }
    // 确保章节目录显示的是当前过滤状态下的内容
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
}

/**
 * 处理章节点击事件，加载并渲染章节内容。
 * @param {string} chapterId - 被点击章节的 ID。
 * @param {string} filePath - 被点击章节内容 JSON 文件的路径。
 */
async function handleChapterClick(chapterId, filePath) {
    // 如果没有 chapterId，表示返回目录页
    if (!chapterId) {
        showTocPage();
        window.location.hash = '';
        return;
    }

    // 隐藏目录和分类导航，显示章节内容容器
    document.getElementById('toc').style.display = 'none';
    document.getElementById('category-nav').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';

    const chapterContent = await loadSingleChapterContent(filePath);
    let currentChapterTooltips = {};
    const chapterTooltipFilePath = `chapters/${chapterId}-tooltips.json`;

    // 尝试加载当前章节的 Tooltip 数据
    try {
        const res = await fetch(`data/${chapterTooltipFilePath}`);
        if (res.ok) {
            currentChapterTooltips = await res.json();
            console.log(`加载 Tooltip 成功: ${chapterId}`, currentChapterTooltips);
        } else {
            // 如果 Tooltip 文件不存在，通常是 404，这表示没有为该章节定义 Tooltip
            console.warn(`Tooltip 文件不存在或加载失败: ${chapterTooltipFilePath} (状态: ${res.status})`);
        }
    } catch (error) {
        console.error(`加载 Tooltip 失败 (网络错误或其他): ${chapterId}`, error);
    }

    if (chapterContent) {
        // 更新 tooltip 模块中的 Tooltip 数据
        updateActiveChapterTooltips(currentChapterTooltips);

        // 渲染章节内容
        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick // 传递给章节导航链接的回调
        );

        // 更新 URL hash
        window.location.hash = chapterId;
        // 滚动到章节顶部
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // === 音频加载和播放器初始化逻辑 ===
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        const googleDriveId = chapterMeta?.googleDriveAudioId; // 从章节元数据获取 Google Drive ID
        const localAudioPath = `data/chapters/audio/${chapterId}.mp3`; // 本地音频路径
        const srtPath = `data/chapters/srt/${chapterId}.srt`; // SRT 字幕路径

        let finalAudioUrl = null; // 最终用于播放的音频 URL
        let srtExists = false; // 标记 SRT 文件是否存在

        // 尝试检查 Google Drive 音频是否可用
        if (googleDriveId) {
            const networkAudioUrl = `https://docs.google.com/uc?export=download&id=${googleDriveId}`;
            try {
                // 使用 HEAD 请求检查音频文件是否存在且可访问
                const headRes = await fetch(networkAudioUrl, { method: 'HEAD' });
                if (headRes.ok && headRes.status < 400) {
                    finalAudioUrl = networkAudioUrl;
                    console.log(`使用 Google Drive 音频: ${finalAudioUrl}`);
                } else {
                    console.warn(`Google Drive 音频不可用或状态异常 (${headRes.status})，尝试本地备份。`);
                }
            } catch (err) {
                console.error('Google Drive 音频检测失败:', err);
            }
        }

        // 如果 Google Drive 音频不可用，则尝试本地音频
        if (!finalAudioUrl) {
            try {
                const localAudioRes = await fetch(localAudioPath, { method: 'HEAD' });
                if (localAudioRes.ok && localAudioRes.status < 400) {
                    finalAudioUrl = localAudioPath;
                    console.log(`使用本地音频: ${finalAudioUrl}`);
                } else {
                    console.warn(`本地音频不可用或状态异常 (${localAudioRes.status}): ${localAudioPath}`);
                }
            } catch (err) {
                console.error('本地音频检测失败:', err);
            }
        }

        // 检查 SRT 文件是否存在
        try {
            const srtRes = await fetch(srtPath, { method: 'HEAD' });
            if (srtRes.ok && srtRes.status < 400) {
                srtExists = true;
                console.log(`SRT 文件存在: ${srtPath}`);
            } else {
                console.warn(`SRT 文件不存在或状态异常 (${srtRes.status}): ${srtPath}`);
            }
        } catch (err) {
            console.error('SRT 文件检测失败:', err);
        }

        const audioPlayerElement = document.querySelector('audio');

        // 只有当音频和 SRT 文件都存在时才初始化并显示音频播放器
        if (finalAudioUrl && srtExists) {
            // initAudioPlayer 现在负责设置 src 并添加事件监听器
            await initAudioPlayer({
                audioSrc: finalAudioUrl,
                srtSrc: srtPath
            });
            // 确保音频播放器可见
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'block';
            }
        } else {
            // 如果没有可用的音频或 SRT 文件，则隐藏播放器并暂停
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'none';
                audioPlayerElement.pause(); // 暂停播放，释放资源
            }
            console.warn(`章节 ${chapterId} 没有可用的音频或 SRT 文件，因此不显示音频播放器。`);
        }

    } else {
        // 如果章节内容加载失败
        alert('无法加载章节内容！请检查章节数据文件。');
        showTocPage(); // 返回目录页
        window.location.hash = ''; // 清除 hash
    }
}

// 监听 URL hash 变化事件
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    // 获取当前章节容器和当前已渲染的章节 ID
    const currentChapterElement = document.getElementById('chapters');
    const currentTitleId = currentChapterElement?.querySelector('h2')?.id;

    // 只有当章节容器被隐藏（即当前在目录页）或者当前渲染的章节与 hash 不符时才重新加载
    if (chapterId) {
        // 在 allChapterIndexData 中查找对应的章节元数据
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (currentChapterElement.style.display === 'none' || currentTitleId !== chapterId) {
            if (chapterMeta) {
                await handleChapterClick(chapterMeta.id, chapterMeta.file);
            } else {
                // 如果 hash 指向的章节在索引中不存在，回到目录页
                showTocPage();
            }
        }
    } else {
        // 如果 hash 为空，显示目录页
        showTocPage();
    }
});
