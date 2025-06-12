// js/main.js
import {
    loadChapterIndex,
    loadSingleChapterContent,
    renderChapterToc,
    renderSingleChapterContent,
    getGlobalWordFrequenciesMap,
    getGlobalMaxFreq,
    setGlobalWordFrequencies
} from './chapterRenderer.js';
import { loadTooltips, setupTooltips } from './tooltip.js';
import { getWordFrequencies } from './wordFrequency.js';

let tooltipsData = {}; // 全局存储 tooltips 数据

document.addEventListener('DOMContentLoaded', async () => {
    // 预加载所有数据
    const chapterIndex = await loadChapterIndex(); // 这会填充 chapterRenderer.js 中的 allChapterIndex
    tooltipsData = await loadTooltips(); // 加载 tooltips 数据

    if (chapterIndex.length === 0) {
        console.error('章节索引为空，无法渲染。');
        return;
    }

    // --- 为所有章节内容计算并存储全局词频 ---
    const allParagraphs = [];
    for (const chapterMeta of chapterIndex) {
        const chapterContent = await loadSingleChapterContent(chapterMeta.file);
        if (chapterContent && chapterContent.paragraphs) {
            chapterContent.paragraphs.forEach(p => {
                if (typeof p === 'string') {
                    allParagraphs.push(p);
                }
            });
        }
    }

    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs.join(' '));
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);
    // --- 词频计算结束 ---

    // 渲染主页的章节列表
    renderChapterToc(chapterIndex, handleChapterClick); // handleChapterClick 作为回调传递

    // 检查URL hash，如果存在，则直接加载对应章节
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = chapterIndex.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            // 如果初始hash无效，显示目录
            document.getElementById('toc').style.display = 'grid';
            document.getElementById('chapters').style.display = 'none';
        }
    } else {
         // 如果没有hash，默认显示目录
        document.getElementById('toc').style.display = 'grid';
        document.getElementById('chapters').style.display = 'none';
    }
});

/**
 * 处理章节点击事件的回调函数。
 * 这个函数现在作为主导航函数，由 renderChapterToc 和 renderSingleChapterContent 中的上一篇/下一篇按钮调用。
 * @param {string} chapterId - 被点击章节的 ID。
 * @param {string} filePath - 被点击章节的文件路径。
 */
async function handleChapterClick(chapterId, filePath) {
    // 隐藏章节列表，显示章节内容容器
    document.getElementById('toc').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';

    const chapterContent = await loadSingleChapterContent(filePath);
    if (chapterContent) {
        // 将 handleChapterClick 本身作为回调函数传递给 renderSingleChapterContent，
        // 这样章节内的导航按钮就可以调用它来加载其他章节。
        renderSingleChapterContent(
            chapterContent,
            tooltipsData,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick // <--- 关键：将自身作为导航回调传入
        );
        setupTooltips(tooltipsData); // 渲染新内容后，重新设置 Tooltip

        // 更新URL hash，以便直接分享或刷新
        window.location.hash = chapterId;

        // 确保滚动到章节顶部，防止从长章节的底部跳到另一个章节的中间
        document.getElementById(chapterContent.id).scrollIntoView({ behavior: 'smooth' });
    } else {
        // 如果加载失败，可以显示错误信息或返回目录
        alert('无法加载章节内容！');
        // 显示目录
        document.getElementById('toc').style.display = 'grid'; // 恢复网格显示
        document.getElementById('chapters').style.display = 'none';
        window.location.hash = ''; // 清除 hash
    }
}

// 监听 URL hash 变化，实现前进/后退按钮的导航
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    const chapterIndex = await loadChapterIndex(); // 确保章节索引已加载

    if (chapterId) {
        const chapterMeta = chapterIndex.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            // 如果 hash 变化指向一个章节，且当前未显示该章节，则加载
            const currentDisplayedChapterId = document.getElementById('chapters').querySelector('h2')?.id;
            if (document.getElementById('chapters').style.display === 'none' ||
                currentDisplayedChapterId !== chapterId) {
                handleChapterClick(chapterMeta.id, chapterMeta.file);
            }
        } else {
            // 如果 hash 指向无效章节，显示目录并清除 hash
            document.getElementById('toc').style.display = 'grid';
            document.getElementById('chapters').style.display = 'none';
            window.location.hash = '';
        }
    } else {
        // 如果 hash 为空，显示目录
        document.getElementById('toc').style.display = 'grid';
        document.getElementById('chapters').style.display = 'none';
    }
});
