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
import { loadTooltips, setupTooltips } from './tooltip.js';
import { getWordFrequencies } from './wordFrequency.js';

let allChapterIndexData = []; // 存储所有章节的原始索引数据，用于过滤
let currentFilterCategory = 'all'; // 当前激活的分类，默认为 'all'

document.addEventListener('DOMContentLoaded', async () => {
    // 预加载所有数据
    allChapterIndexData = await loadChapterIndex(); // 加载所有章节索引
    const tooltipsData = await loadTooltips(); // 加载工具提示数据

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // --- 提取所有 Tooltip 关键词作为受保护词 ---
    const protectedTooltipWords = new Set();
    for (const key in tooltipsData) {
        if (Object.hasOwnProperty.call(tooltipsData, key)) {
            // 将 tooltip 的键（ID）加入 protectedWords Set
            // 这通常是小写形式的单词，例如 'flavours'
            protectedTooltipWords.add(key.toLowerCase());
        }
    }
    // 额外处理 [[word|tooltipId]] 格式中的 'word' 部分，确保它也被保护。
    // 这需要解析所有章节的文本，找出这种格式中的 'word'。
    // 另一种更简单、更健壮的方法是：如果你的 Tooltip 系统设计上，
    // 所有想作为 Tooltip 的词（无论其 Markdown 格式如何）都必须在 tooltipsData 中有对应的条目，
    // 那么只需提取 tooltipsData 的键就足够了。
    // 基于你提供的 [[flavours|flavour-noun]] 示例，这里的 `key` 可能是 `flavour-noun`。
    // 但 `renderMarkdownWithTooltips` 是用 `flavours` 来查词频的。
    // 为了确保 `flavours` 被保护，我们需要确保 `protectedTooltipWords` 包含 `flavours`。
    // 解决方案：在 Tooltip 数据（tooltip.json）中，确保键是实际的单词形式（例如 `flavours`），
    // 或者在 `renderMarkdownWithTooltips` 解析 `[[word|tooltipId]]` 时，
    // 将 `word` 本身也加入到 `protectedTooltipWords` 中（这会使逻辑更复杂）。
    // 最简单的方案是：**确保 `tooltipsData` 的键就是你想统计和放大的词的小写形式**。
    // 例如，如果 'flavours' 是一个 Tooltip 词，那么你的 tooltips.json 应该有类似
    // "flavours": { "partOfSpeech": "noun", "definition": "..." }
    // 如果是 "flavour-noun": { "word": "flavours", "definition": "..." }
    // 那么这里的 `protectedTooltipWords.add(key.toLowerCase());` 会添加 `flavour-noun`，而不是 `flavours`。

    // **为了兼容你的 `[[flavours|flavour-noun]]` 格式**
    // 并且假设 `flavour-noun` 是 `tooltipsData` 的 key，
    // 并且 `flavours` 是你想要统计和放大的词：
    // 你需要在 `renderMarkdownWithTooltips` 中，当它处理 `[[word|tooltipId]]` 时，
    // 将 `word.toLowerCase()` 也添加到 `protectedTooltipWords` 或 `wordFrequenciesMap`。
    // 但更直接的：**让 tooltips.json 的键直接是你想要统计的词**。
    // 例如：
    // {
    //   "flavours": {
    //     "partOfSpeech": "noun",
    //     "definition": "...",
    //     "tooltipId": "flavour-noun" // 额外存储 Tooltip ID
    //   },
    //   "invention": {
    //     "partOfSpeech": "noun",
    //     "definition": "...",
    //     "tooltipId": "invention-noun"
    //   }
    // }
    // 如果你的 tooltips.json 是这种结构，那么 `key.toLowerCase()` 就能正确添加 `flavours`。
    // 我假设你的 `tooltip.json` 是 `{"flavour-noun": {...}}` 而不是 `{"flavours": {...}}`
    // 如果是这样，你需要修改 `main.js` 提取 `protectedTooltipWords` 的逻辑，
    // 或者修改你的 `tooltip.json` 结构，使其键与要统计的单词一致。
    // **最简单的改法：将所有 Tooltip 词都视为需要保护。**
    // 这里，我将解析 Markdown 文本，获取所有 [[word|tooltipId]] 中的 `word` 部分。
    allChapterIndexData.forEach(chapterMeta => {
        // 假设 loadSingleChapterContent 已经加载了 chapterMeta.content 字符串
        const content = chapterMeta.content || ""; // 确保有内容
        const customTooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
        let match;
        while ((match = customTooltipPattern.exec(content)) !== null) {
            protectedTooltipWords.add(match[1].toLowerCase()); // 添加 [[word|tooltipId]] 中的 'word'
        }
    });


    // --- 为所有章节内容计算并存储全局词频 ---
    const allParagraphs = [];
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

    // **核心修正：将 allParagraphs 数组和 protectedTooltipWords 传入 getWordFrequencies**
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
    setupTooltips();

    // 检查URL hash，如果存在，则直接加载对应章节
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
    newAllButton.textContent = 'All Articles';
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
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid'; // 确保是 grid 显示
    document.getElementById('category-nav').style.display = 'flex'; // 确保分类导航显示
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
    if (chapterContent) {
        renderSingleChapterContent(
            chapterContent,
            null, // _unusedTooltipDataFromMain (已废弃)
            getGlobalWordFrequenciesMap(), // 从全局获取词频 Map
            getGlobalMaxFreq(),           // 从全局获取最高频率
            handleChapterClick            // 将自身作为导航回调传入
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
            const currentDisplayedChapterId = currentDisplayedChapterElement.querySelector('h2') ? currentDisplayedChapterElement.querySelector('h2').id : null;

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
