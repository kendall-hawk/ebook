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

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    const tocEl = document.getElementById('toc');
    const chaptersEl = document.getElementById('chapters');
    const navEl = document.getElementById('category-nav');

    if (!tocEl || !chaptersEl || !navEl) {
        console.error('缺少必要 DOM 元素');
        return;
    }

    try {
        allChapterIndexData = await loadChapterIndex();
        const tooltipData = await loadTooltips();

        if (!allChapterIndexData.length) {
            tocEl.innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
            return;
        }

        // 解析章节内容 & 提取词频相关信息
        const protectedWords = new Set();
        const allParagraphs = [];
        const contentPromises = allChapterIndexData.map(async chapter => {
            const contentObj = await loadSingleChapterContent(chapter.file);
            const content = chapter.content || '';
            const tooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
            let match;
            while ((match = tooltipPattern.exec(content)) !== null) {
                protectedWords.add(match[1].toLowerCase());
            }

            if (contentObj?.paragraphs) {
                for (const p of contentObj.paragraphs) {
                    if (typeof p === 'string') allParagraphs.push(p);
                }
            }
        });

        await Promise.all(contentPromises);

        // 提取 tooltipData 的 key 作为 protected 词（兼容更简单场景）
        Object.keys(tooltipData || {}).forEach(key => protectedWords.add(key.toLowerCase()));

        const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWords);
        setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

        setupTooltips();
        renderCategoryNavigation(extractCategories(allChapterIndexData));
        renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

        // Hash 章节跳转
        const hashId = window.location.hash.substring(1);
        const chapterMeta = allChapterIndexData.find(ch => ch.id === hashId);
        if (chapterMeta) {
            handleChapterClick(chapterMeta.id, chapterMeta.file);
        } else {
            toggleView(true);
        }

    } catch (err) {
        console.error('初始化失败:', err);
        tocEl.innerHTML = '<p style="text-align: center; padding: 50px; color: red;">加载失败，请稍后重试。</p>';
    }
});

function extractCategories(data) {
    const set = new Set();
    data.forEach(ch => Array.isArray(ch.categories) && ch.categories.forEach(cat => set.add(cat)));
    return Array.from(set);
}

function renderCategoryNavigation(categories) {
    const nav = document.getElementById('category-nav');
    if (!nav) return;

    nav.innerHTML = '';

    const renderButton = (cat, label) => {
        const btn = document.createElement('button');
        btn.className = 'category-button';
        btn.dataset.category = cat;
        btn.textContent = label;
        btn.onclick = () => {
            currentFilterCategory = cat;
            [...nav.querySelectorAll('.category-button')].forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderChapterToc(allChapterIndexData, handleChapterClick, cat);
            toggleView(true);
            window.location.hash = '';
        };
        nav.appendChild(btn);
    };

    renderButton('all', 'All Articles');
    categories.sort().forEach(cat => renderButton(cat, cat));

    // 初始化激活按钮
    const activeBtn = nav.querySelector(`[data-category="${currentFilterCategory}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

async function handleChapterClick(chapterId, filePath) {
    if (!chapterId) {
        toggleView(true);
        window.location.hash = '';
        return;
    }

    toggleView(false);

    try {
        const chapterContent = await loadSingleChapterContent(filePath);
        if (!chapterContent) throw new Error('章节内容为空');

        renderSingleChapterContent(
            chapterContent,
            null,
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        alert('无法加载章节内容！');
        toggleView(true);
        window.location.hash = '';
    }
}

function toggleView(showToc) {
    const toc = document.getElementById('toc');
    const ch = document.getElementById('chapters');
    const nav = document.getElementById('category-nav');

    if (toc && ch && nav) {
        toc.style.display = showToc ? 'grid' : 'none';
        nav.style.display = showToc ? 'flex' : 'none';
        ch.style.display = showToc ? 'none' : 'block';
    }
}

window.addEventListener('hashchange', () => {
    const chapterId = window.location.hash.substring(1);
    if (!chapterId) {
        toggleView(true);
        return;
    }

    const meta = allChapterIndexData.find(ch => ch.id === chapterId);
    const curId = document.querySelector('#chapters h2')?.id;

    if (meta && curId !== chapterId) {
        handleChapterClick(meta.id, meta.file);
    } else if (!meta) {
        toggleView(true);
        window.location.hash = '';
    }
});