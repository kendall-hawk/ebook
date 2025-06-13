// js/main.js
import {
    loadChapterIndex,
    loadSingleChapterContent,
    renderChapterToc,
    renderSingleChapterContent,
    // 移除了 getGlobalWordFrequenciesMap, getGlobalMaxFreq，因为它们现在从 setGlobalWordFrequencies 获取
    setGlobalWordFrequencies,
    getGlobalWordFrequenciesMap, // 重新添加，因为 renderSingleChapterContent 需要获取全局词频
    getGlobalMaxFreq // 重新添加，因为 renderSingleChapterContent 需要获取全局最高频率
} from './chapterRenderer.js';
import { loadTooltips, setupTooltips } from './tooltip.js';
import { getWordFrequencies } from './wordFrequency.js';

let allChapterIndexData = []; // 存储所有章节的原始索引数据，用于过滤
let currentFilterCategory = 'all'; // 当前激活的分类，默认为 'all'

document.addEventListener('DOMContentLoaded', async () => {
    // 预加载所有数据
    allChapterIndexData = await loadChapterIndex(); // 加载所有章节索引
    const tooltipsData = await loadTooltips(); // 加载工具提示数据
    // console.log('Tooltips Data Loaded:', tooltipsData); // 调试用，可以保留或移除

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

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

    // **核心修正：将 allParagraphs 数组直接传递给 getWordFrequencies**
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq); // 设置全局词频

    // 调试用，检查词频是否正确计算
    console.log('全局词频 Map (main.js):', getGlobalWordFrequenciesMap());
    console.log('全局最高频率 (main.js):', getGlobalMaxFreq());
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

    // **重要：在页面首次加载时就设置 Tooltip 事件监听器**
    // 这样做一次即可，因为 tooltip.js 内部已经使用了事件委托。
    setupTooltips();

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

    // 清空旧按钮，并重建“All Articles”按钮，确保其在最前面且是激活状态
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
        renderSingleChapterContent(
            chapterContent,
            // 注意：tooltipsData 不再从这里直接传入，因为 tooltip.js 内部管理了
            // 但是 renderSingleChapterContent 还需要 tooltipsData 来判断哪些词有 tooltip
            // 所以，这里传入 tooltipsData 仍然是必要的，确保 renderMarkdownWithTooltips 知道哪些词是 tooltip 词
            // 确保 chapterRenderer.js 中的 renderSingleChapterContent 内部将这个 tooltipsData 传递给了 renderMarkdownWithTooltips
            null, // 传递 null 或一个空对象，因为 renderMarkdownWithTooltips 不再直接使用此参数进行数据查找
            getGlobalWordFrequenciesMap(), // 从全局获取词频 Map
            getGlobalMaxFreq(),           // 从全局获取最高频率
            handleChapterClick            // 将自身作为导航回调传入
        );

        // **重要：在渲染新内容后，不需要再次调用 setupTooltips()**
        // 因为 tooltip.js 内部已经使用了事件委托，事件监听器绑定在父容器上，
        // 动态生成的 .word 元素也能被捕获到。
        // 如果你之前在 setupTooltips() 中有移除旧事件监听器的逻辑，那现在应该移除了，
        // 保持 setupTooltips() 只做一次初始化绑定。

        // 更新URL hash，以便直接分享或刷新
        window.location.hash = chapterId;

        // 确保滚动到章节顶部，防止从长章节的底部跳到另一个章节的中间
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' }); // 滚动到章节内容容器顶部
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
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            // 检查当前显示的章节ID，避免不必要的重新加载
            const currentDisplayedChapterElement = document.getElementById('chapters');
            const currentDisplayedChapterId = currentDisplayedChapterElement.querySelector('h2') ? currentDisplayedChapterElement.querySelector('h2').id : null;

            if (currentDisplayedChapterElement.style.display === 'none' || currentDisplayedChapterId !== chapterId) {
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
