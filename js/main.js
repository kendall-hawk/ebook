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
// 导入 TooltipManager 的单例实例和其导出的方法
import { loadTooltips, setupTooltips, tooltipManager } from './tooltip.js';
import { getWordFrequencies } from './wordFrequency.js';
// 导入 YouTubeFloatingPlayerManager 的单例实例和其导出的方法
import { setupFloatingYouTube, setupVideoAutoPause, youtubePlayerManager } from './youtube.js';


let allChapterIndexData = []; // 存储所有章节的原始索引数据，用于过滤
let currentFilterCategory = 'all'; // 当前激活的分类，默认为 'all'

document.addEventListener('DOMContentLoaded', async () => {
    // 显示加载消息
    document.getElementById('toc').classList.remove('hidden');
    document.getElementById('toc').innerHTML = '<p class="loading-message">加载章节目录中...</p>';


    // 预加载所有数据
    allChapterIndexData = await loadChapterIndex(); // 加载所有章节索引
    const tooltipsData = await loadTooltips(); // 加载工具提示数据

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">没有找到文章。</p>';
        return;
    }

    // --- 提取所有 Tooltip 关键词作为受保护词 ---
    const protectedTooltipWords = new Set();
    // 假设 tooltipsData 的键就是需要保护的词（例如 "flavours"），或者 "tooltipId"
    // 如果 tooltips.json 的键就是词本身，可以直接添加
    for (const key in tooltipsData) {
        if (Object.hasOwnProperty.call(tooltipsData, key)) {
            // 如果 tooltipsData 的键是实际的词（例如 "flavours"）
            protectedTooltipWords.add(key.toLowerCase());
            // 如果 tooltipsData 的键是 ID（例如 "flavour-noun"），并且数据内部有 'word' 属性
            if (tooltipsData[key].word) {
                protectedTooltipWords.add(tooltipsData[key].word.toLowerCase());
            }
        }
    }

    // --- 为所有章节内容计算并存储全局词频 ---
    // 先加载所有章节的原始内容，以便进行词频统计和受保护词的提取
    const allParagraphs = [];
    const chapterContentsPromises = allChapterIndexData.map(ch => loadSingleChapterContent(ch.file));
    const allLoadedChapterContents = await Promise.all(chapterContentsPromises);

    allLoadedChapterContents.forEach(chapterContent => {
        if (chapterContent && chapterContent.paragraphs) {
            chapterContent.paragraphs.forEach(p => {
                if (typeof p === 'string') {
                    allParagraphs.push(p);

                    // 在这里解析 Markdown 中的 [[word|tooltipId]] 格式，提取 'word' 部分
                    // 这确保了即使 tooltips.json 的键不是实际的词，也能保护这些词
                    const customTooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
                    let match;
                    while ((match = customTooltipPattern.exec(p)) !== null) {
                        protectedTooltipWords.add(match[1].toLowerCase()); // 添加 [[word|tooltipId]] 中的 'word'
                    }
                }
            });
        }
    });

    // 计算全局词频，并传入受保护词汇
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedTooltipWords);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    // 调试用，检查词频是否正确计算
    console.log('--- 词频计算结果 (main.js) ---');
    console.log('全局词频 Map:', getGlobalWordFrequenciesMap());
    console.log('全局最高频率:', getGlobalMaxFreq());
    console.log('受保护的 Tooltip 词:', protectedTooltipWords);
    console.log('--- 词频计算结束 ---');

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

    // **重要：在页面首次加载时就设置 Tooltip 事件监听器**
    // 确保 DOM 中的 .word 元素可以被监听
    setupTooltips();

    // **重要：初始化 YouTube 浮动视频功能和自动暂停**
    setupVideoAutoPause();
    setupFloatingYouTube();

    // 检查URL hash，如果存在，则直接加载对应章节
    const initialChapterId = window.location.hash.substring(1);
    if (initialChapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialChapterId);
        if (chapterMeta) {
            handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            showTocPage(); // hash 不匹配，显示目录页
        }
    } else {
        showTocPage(); // 没有 hash，显示目录页
    }
});


/**
 * 渲染分类导航栏。
 * @param {Array<string>} categories - 唯一的分类名称数组。
 */
function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

    categoryNav.innerHTML = ''; // 清空所有旧按钮

    const newAllButton = document.createElement('button');
    newAllButton.classList.add('category-button');
    newAllButton.dataset.category = 'all';
    newAllButton.textContent = '所有文章';
    categoryNav.appendChild(newAllButton);

    categories.sort().forEach(category => {
        const button = document.createElement('button');
        button.classList.add('category-button');
        button.dataset.category = category;
        button.textContent = category;
        categoryNav.appendChild(button);
    });

    // 初始化激活状态：根据 currentFilterCategory 设置
    categoryNav.querySelectorAll('.category-button').forEach(btn => {
        if (btn.dataset.category === currentFilterCategory) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 添加事件监听器
    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            const selectedCategory = button.dataset.category;
            currentFilterCategory = selectedCategory; // 更新当前过滤类别

            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
            showTocPage(); // 确保切换回主页视图
            window.location.hash = ''; // 清除 hash
        });
    });
}


/**
 * 显示章节列表页面（主页）。
 */
function showTocPage() {
    document.getElementById('chapters').classList.add('hidden'); // 隐藏章节内容
    document.getElementById('toc').classList.remove('hidden'); // 显示目录
    document.getElementById('category-nav').classList.remove('hidden'); // 显示分类导航

    // 重新渲染目录，以确保显示最新的过滤结果
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
}

/**
 * 处理章节点击事件的回调函数。
 * @param {string|null} chapterId - 被点击章节的 ID。如果为空，表示返回主页。
 * @param {string|null} filePath - 被点击章节的文件路径。
 */
async function handleChapterClick(chapterId, filePath) {
    if (!chapterId) {
        showTocPage();
        window.location.hash = '';
        return;
    }

    document.getElementById('toc').classList.add('hidden'); // 隐藏目录
    document.getElementById('category-nav').classList.add('hidden'); // 隐藏分类导航
    document.getElementById('chapters').classList.remove('hidden'); // 显示章节内容
    document.getElementById('current-chapter-article').innerHTML = '<p class="loading-message">加载章节内容中...</p>'; // 显示加载提示

    const chapterContent = await loadSingleChapterContent(filePath);
    if (chapterContent) {
        renderSingleChapterContent(
            chapterContent,
            getGlobalWordFrequenciesMap(), // 从全局获取词频 Map
            getGlobalMaxFreq(),           // 从全局获取最高频率
            handleChapterClick            // 将自身作为导航回调传入
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // !!! 关键修正 !!! 在渲染新章节内容后，重新设置 Tooltip 事件监听器
        setupTooltips();
        // 也要重新初始化 YouTube 播放器实例，特别是当新的视频嵌入进来时
        youtubePlayerManager.setupFloatingYouTube(); // 重新扫描并初始化播放器
    } else {
        document.getElementById('current-chapter-article').innerHTML = '<p class="loading-message" style="color: red;">抱歉，无法加载此章节内容。请稍后再试。</p>';
        // 保持在章节页面显示错误，或选择返回目录
        // showTocPage(); // 如果你希望加载失败后自动返回目录
        window.location.hash = ''; // 清除 hash
    }
}

// 监听 URL hash 变化，实现前进/后退按钮的导航
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            // 避免重复加载同一章节
            const currentDisplayedChapterElement = document.getElementById('current-chapter-article');
            const currentChapterTitleId = currentDisplayedChapterElement.querySelector('h2') ? currentDisplayedChapterElement.querySelector('h2').id : null;

            if (document.getElementById('chapters').classList.contains('hidden') || currentChapterTitleId !== chapterId) {
                handleChapterClick(chapterMeta.id, chapterMeta.file);
            }
        } else {
            showTocPage(); // hash 不匹配任何章节，返回目录
            window.location.hash = '';
        }
    } else {
        showTocPage(); // 没有 hash，返回目录
    }
});
