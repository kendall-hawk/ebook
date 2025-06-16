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
import { initAudioPlayer, showAudioPlayer, hideAudioPlayer } from './audio/audioPlayer.js'; // 导入新函数
import { parseSRT } from './audio/srtParser.js';

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 加载章节索引
    allChapterIndexData = await loadChapterIndex();

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // 2. 加载所有章节内容以计算词频
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

    // 3. 加载所有 Tooltip 数据以保护单词频率
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
            console.error(`Tooltip 数据加载失败 (${tooltipFilePath}):`, error);
        }
    }

    // 4. 计算全局词频
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    // 5. 渲染分类导航
    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));

    // 6. 初始渲染章节目录
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // 7. 设置 Tooltip 事件监听器
    setupTooltips();

    // 8. 根据 URL Hash 决定显示章节或目录
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            // 注意：这里需要传递完整的章节元数据，以便 handleChapterClick 获取 audio/srt 路径
            await handleChapterClick(chapterMeta.id, chapterMeta.file, chapterMeta.audio, chapterMeta.srt);
        } else {
            showTocPage(); // Hash 无效，显示目录
        }
    } else {
        showTocPage(); // 没有 Hash，显示目录
    }
});

/**
 * 渲染分类导航按钮。
 * @param {string[]} categories - 所有不重复的分类名称数组。
 */
function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

    categoryNav.innerHTML = '';

    // 添加“所有文章”按钮
    const newAllButton = document.createElement('button');
    newAllButton.classList.add('category-button');
    newAllButton.dataset.category = 'all';
    newAllButton.textContent = 'All Articles';
    categoryNav.appendChild(newAllButton);

    // 添加其他分类按钮
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

    // 为分类按钮添加点击事件
    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            currentFilterCategory = button.dataset.category;
            // 更新按钮激活状态
            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            // 重新渲染目录并显示目录页
            renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
            showTocPage();
            window.location.hash = ''; // 清空 hash
        });
    });
}

/**
 * 显示文章目录页面。
 */
function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid';
    document.getElementById('category-nav').style.display = 'flex';
    hideAudioPlayer(); // 使用 audioPlayer 模块的函数隐藏播放器
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
}

/**
 * 处理章节点击事件，加载并显示章节内容。
 * @param {string} chapterId - 章节的 ID。
 * @param {string} filePath - 章节内容的 JSON 文件路径。
 * @param {string} [audioFile] - 章节音频文件的相对路径 (例如 'chapters/audio/id.mp3')。
 * @param {string} [srtFile] - 章节 SRT 字幕文件的相对路径 (例如 'chapters/srt/id.srt')。
 */
async function handleChapterClick(chapterId, filePath, audioFile, srtFile) {
    if (!chapterId) {
        showTocPage();
        window.location.hash = '';
        return;
    }

    // 隐藏目录和分类导航，显示章节内容容器
    document.getElementById('toc').style.display = 'none';
    document.getElementById('category-nav').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';

    // 加载章节内容
    const chapterContent = await loadSingleChapterContent(filePath);
    if (!chapterContent) {
        alert('无法加载章节内容！');
        showTocPage();
        window.location.hash = '';
        return;
    }

    // 1. 加载章节专属 Tooltip 数据
    let currentChapterTooltips = {};
    const chapterTooltipFilePath = `chapters/${chapterId}-tooltips.json`;
    try {
        const res = await fetch(`data/${chapterTooltipFilePath}`);
        if (res.ok) {
            currentChapterTooltips = await res.json();
        }
    } catch (error) {
        console.error(`加载 Tooltip 失败 (${chapterTooltipFilePath}):`, error);
    }
    updateActiveChapterTooltips(currentChapterTooltips); // 更新 tooltip 模块的活跃数据

    // 2. 加载并解析 SRT 数据
    let srtEntries = [];
    const fullSrtPath = srtFile ? `data/${srtFile}` : null; // 构建完整的 SRT 路径
    if (fullSrtPath) {
        try {
            const srtRes = await fetch(fullSrtPath);
            if (srtRes.ok) {
                const srtText = await srtRes.text();
                srtEntries = parseSRT(srtText);
            }
        } catch (error) {
            console.error(`SRT 文件加载或解析失败 (${fullSrtPath}):`, error);
        }
    }

    // 3. 渲染章节内容，传入 SRT 数据
    renderSingleChapterContent(
        chapterContent,
        currentChapterTooltips,
        getGlobalWordFrequenciesMap(),
        getGlobalMaxFreq(),
        // 导航回调：确保在点击“上一篇/下一篇”时，传递音频和 SRT 路径
        (newId, newFile) => {
            const newChapterMeta = allChapterIndexData.find(ch => ch.id === newId);
            if (newChapterMeta) {
                handleChapterClick(newChapterMeta.id, newChapterMeta.file, newChapterMeta.audio, newChapterMeta.srt);
            } else {
                console.error(`未找到章节元数据: ${newId}`);
                showTocPage();
            }
        },
        srtEntries // 传入解析后的 SRT 数据
    );

    // 更新 URL Hash
    window.location.hash = chapterId;
    document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

    // === 音频加载和播放器控制 ===
    const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
    const googleDriveId = chapterMeta?.googleDriveAudioId;
    const localAudioPath = chapterMeta?.audio ? `data/${chapterMeta.audio}` : null; // 使用 chapterMeta.audio
    const srtExists = srtEntries.length > 0; // 判断 SRT 是否已成功加载

    let finalAudioUrl = null;

    // 检查 Google Drive 音频
    if (googleDriveId) {
        const networkAudioUrl = `https://docs.google.com/uc?export=download&id=${googleDriveId}`;
        try {
            const headRes = await fetch(networkAudioUrl, { method: 'HEAD' });
            if (headRes.ok && headRes.status < 400) {
                finalAudioUrl = networkAudioUrl;
            }
        } catch (err) {
            // Error during fetch, fallback to local
        }
    }

    // 如果 Google Drive 音频不可用或未设置，检查本地音频
    if (!finalAudioUrl && localAudioPath) {
        try {
            const localAudioRes = await fetch(localAudioPath, { method: 'HEAD' });
            if (localAudioRes.ok && localAudioRes.status < 400) {
                finalAudioUrl = localAudioPath;
            }
        } catch (err) {
            // Error during fetch, no local audio
        }
    }

    // 只有当找到有效音频源并且 SRT 文件存在时才初始化和显示播放器
    if (finalAudioUrl && srtExists) {
        initAudioPlayer({
            audioSrc: finalAudioUrl,
            srtSrc: fullSrtPath // 传递完整的 SRT 路径给 initAudioPlayer
        });
        showAudioPlayer(); // 使用 audioPlayer 模块的函数显示播放器
    } else {
        // 如果没有可用音频或 SRT，则隐藏播放器
        hideAudioPlayer(); // 使用 audioPlayer 模块的函数隐藏播放器
    }
}

/**
 * 监听 URL Hash 变化，加载对应章节。
 */
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        const currentChapterElement = document.getElementById('chapters');
        const currentTitleId = currentChapterElement.querySelector('h2')?.id; // 获取当前章节的 h2 元素的 ID

        // 只有当章节页未显示，或者显示的章节与 hash 不符时才重新加载
        if (currentChapterElement.style.display === 'none' || currentTitleId !== chapterId) {
            if (chapterMeta) {
                // 再次注意：传递完整的章节元数据中的 audio 和 srt 路径
                await handleChapterClick(chapterMeta.id, chapterMeta.file, chapterMeta.audio, chapterMeta.srt);
            } else {
                showTocPage(); // Hash 指向的章节不存在，显示目录
            }
        }
    } else {
        showTocPage(); // Hash 为空，显示目录
    }
});
