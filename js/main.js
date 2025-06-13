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
import { loadTooltips, setupTooltips } from './tooltip.js'; // 移除了 loadPronunciations
import { getWordFrequencies } from './wordFrequency.js';

let tooltipsData = {}; // 全局存储工具提示数据
let allChapterIndexData = []; // 存储所有章节的原始索引数据，用于过滤
let currentFilterCategory = 'all'; // 当前激活的分类，默认为 'all'

document.addEventListener('DOMContentLoaded', async () => {
    // 预加载所有数据
    allChapterIndexData = await loadChapterIndex(); // 加载所有章节索引
    tooltipsData = await loadTooltips(); // 加载工具提示数据
    // 移除了 loadPronunciations，因为暂时跳过发音功能

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        // 可以显示一个用户友好的提示
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // --- 为所有章节内容计算并存储全局词频 ---
    const allParagraphs = [];
    // 为确保所有章节内容都已加载，使用 Promise.all
    const chapterContentsPromises = allChapterIndexData.map(ch => loadSingleChapterContent(ch.file));
    const allLoadedChapterContents = await Promise.all(chapterContentsPromises);

    allLoadedChapterContents.forEach(chapterContent => {
        if (chapterContent && chapterContent.paragraphs) {
            chapterContent.paragraphs.forEach(p => {
                if (typeof p === 'string') {
                    allParagraphs.push(p);
                }
            });
        }
    });

    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs.join(' '));
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);
    // --- 词频计算结束 ---

    // **新增：收集并渲染分类导航栏**
    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));

    // 初始渲染章节列表 (显示所有文章)
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // 检查URL hash，如果存在，则直接加载对应章节
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            // 如果初始hash无效，显示目录
            showTocPage();
        }
    } else {
         // 如果没有hash，默认显示目录页
        showTocPage();
    }
});


/**
 * 渲染分类导航栏。
 * @param {Array<string>} categories - 唯一的分类名称数组。
 */
function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

    // 清空除了“All Articles”按钮之外的旧按钮
    // 找到“All Articles”按钮
    const allButton = categoryNav.querySelector('.category-button[data-category="all"]');
    categoryNav.innerHTML = ''; // 先清空所有内容
    if (allButton) { // 如果原来有All按钮，再加回去
        categoryNav.appendChild(allButton);
    } else { // 如果没有，创建它
        const newAllButton = document.createElement('button');
        newAllButton.classList.add('category-button', 'active');
        newAllButton.dataset.category = 'all';
        newAllButton.textContent = 'All Articles';
        categoryNav.appendChild(newAllButton);
    }


    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        categoryNav.appendChild(button);
    });

    // 添加事件监听器
    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            const selectedCategory = button.dataset.category;
            currentFilterCategory = selectedCategory; // 更新当前过滤类别

            // 移除所有按钮的 active 类，然后给当前点击的按钮添加 active 类
            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 重新渲染章节列表，应用新的过滤
            renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
            showTocPage(); // 确保切换回主页视图
            window.location.hash = ''; // 清除 hash，因为现在在分类页
        });
    });
}


/**
 * 显示章节列表页面（主页）。
 */
function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid'; // 确保是 grid 显示
    document.getElementById('category-nav').style.display = 'flex'; // 确保分类导航显示
    // 重新渲染当前分类的列表，以防万一
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
}

/**
 * 处理章节点击事件的回调函数。
 * 这个函数现在作为主导航函数，由 renderChapterToc 和 renderSingleChapterContent 中的上一篇/下一篇按钮调用。
 * @param {string} chapterId - 被点击章节的 ID。如果为空，表示返回主页。
 * @param {string} filePath - 被点击章节的文件路径。
 */
async function handleChapterClick(chapterId, filePath) {
    if (!chapterId) { // 如果传入空 chapterId，表示返回主页
        showTocPage();
        window.location.hash = ''; // 清除 hash
        return;
    }

    // 隐藏章节列表和分类导航，显示章节内容容器
    document.getElementById('toc').style.display = 'none';
    document.getElementById('category-nav').style.display = 'none';
    document.getElementById('chapters').style.display = 'block';


    const chapterContent = await loadSingleChapterContent(filePath);
    if (chapterContent) {
        // 将 handleChapterClick 本身作为回调函数传递给 renderSingleChapterContent，
        // 这样章节内的导航按钮就可以调用它来加载其他章节。
        renderSingleChapterContent(
            chapterContent,
            tooltipsData, // 传入 tooltipsData
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick // <--- 关键：将自身作为导航回调传入
        );
        setupTooltips(); // 渲染新内容后，重新设置 Tooltip

        // 更新URL hash，以便直接分享或刷新
        window.location.hash = chapterId;

        // 确保滚动到章节顶部，防止从长章节的底部跳到另一个章节的中间
        document.getElementById(chapterContent.id).scrollIntoView({ behavior: 'smooth' });
    } else {
        // 如果加载失败，可以显示错误信息或返回目录
        alert('无法加载章节内容！');
        showTocPage(); // 显示目录
        window.location.hash = ''; // 清除 hash
    }
}

// 监听 URL hash 变化，实现前进/后退按钮的导航
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    // allChapterIndexData 已经在 DOMContentLoaded 中加载，这里可以直接用
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            // 检查当前显示的章节ID，避免不必要的重新加载
            const currentDisplayedChapterTitleElement = document.getElementById('chapters').querySelector('h2');
            const currentDisplayedChapterId = currentDisplayedChapterTitleElement ? currentDisplayedChapterTitleElement.id : null;

            if (document.getElementById('chapters').style.display === 'none' || currentDisplayedChapterId !== chapterId) {
                handleChapterClick(chapterMeta.id, chapterMeta.file);
            }
        } else {
            // 如果 hash 指向无效章节，显示目录并清除 hash
            showTocPage();
            window.location.hash = '';
        }
    } else {
        // 如果 hash 为空，显示目录
        showTocPage();
    }
});
