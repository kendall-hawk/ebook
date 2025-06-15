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
// 移除 loadTooltips，因为 Tooltip 数据现在由 handleChapterClick 动态加载
import { setupTooltips } from './tooltip.js'; // 只需要 setupTooltips
import { getWordFrequencies } from './wordFrequency.js';

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    allChapterIndexData = await loadChapterIndex(); // 加载所有章节索引

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // --- 词频计算优化：在所有章节加载完成后一次性计算 ---
    // 为了更精确地计算全局词频，我们需要等待所有章节内容加载完毕。
    // 这里不再在加载完 chapters.json 后立即处理 Tooltip 词，
    // 而是在计算词频时，动态地从所有章节内容中提取所有可能出现 Tooltip 的词。
    // 这将确保所有标记为 Tooltip 的词（无论是 `[[word|id]]` 还是自动检测的词）都被保护。

    const allParagraphs = [];
    // 假设 allChapterIndexData 已经包含了 chapterMeta.file 路径
    // 异步加载所有章节内容，然后统一处理词频
    const chapterContentsPromises = allChapterIndexData.map(async (chMeta) => {
        // 在这里预加载章节内容，以便在计算全局词频时使用
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
                        // 将 Tooltip 数据中的 `word` 字段加入受保护词列表
                        if (tooltipEntry.word) {
                            protectedWordsForFrequency.add(tooltipEntry.word.toLowerCase());
                        }
                        // 也可以将 tooltipId 本身作为受保护词，如果它对应某个实际的词
                        // protectedWordsForFrequency.add(tooltipId.toLowerCase());
                    }
                }
            } else {
                console.warn(`未找到或无法加载章节 Tooltip 数据: ${tooltipFilePath}. Status: ${res.status}`);
            }
        } catch (error) {
            console.error(`加载章节 Tooltip 数据失败 (${tooltipFilePath}):`, error);
        }
    }

    // **核心修正：将 allParagraphs 数组和 protectedWordsForFrequency 传入 getWordFrequencies**
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
        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips, // 将章节专属 Tooltip 数据传递给渲染器
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });
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
