import { loadChapterIndex, loadSingleChapterContent, setChapterIndexData, getChapterIndexData } from './store/chapterStore.js';
import { getWordFrequencies, getGlobalWordFrequenciesMap, getGlobalMaxFreq, setGlobalWordFrequencies } from './store/chapterStore.js';
import { renderChapterToc } from './render/renderToc.js';
import { renderSingleChapterContent } from './render/renderChapter.js';
import { loadTooltips, setupTooltips } from './tooltip.js';

let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    const allChapterIndexData = await loadChapterIndex();
    setChapterIndexData(allChapterIndexData);

    const tooltipsData = await loadTooltips();

    if (allChapterIndexData.length === 0) {
        console.error('章节索引为空，无法渲染。');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // ----- 提取 tooltip 关键词 -----
    const protectedTooltipWords = new Set();
    for (const key in tooltipsData) {
        if (Object.hasOwnProperty.call(tooltipsData, key)) {
            protectedTooltipWords.add(key.toLowerCase());
        }
    }

    allChapterIndexData.forEach(ch => {
        const content = ch.content || '';
        const tooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
        let match;
        while ((match = tooltipPattern.exec(content)) !== null) {
            protectedTooltipWords.add(match[1].toLowerCase());
        }
    });

    // ----- 加载所有章节内容并提取段落 -----
    const allParagraphs = [];
    const chapterContents = await Promise.all(
        allChapterIndexData.map(ch => loadSingleChapterContent(ch.file))
    );

    chapterContents.forEach(ch => {
        if (ch && ch.paragraphs) {
            ch.paragraphs.forEach(p => {
                if (typeof p === 'string') allParagraphs.push(p);
            });
        }
    });

    // ----- 全局词频计算 -----
    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedTooltipWords);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    console.log('词频计算完成:', { wordFrequenciesMap, maxFreq, protectedTooltipWords });

    // ----- 渲染分类导航 -----
    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation([...categories]);

    // ----- 初始渲染目录页 -----
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
    setupTooltips();

    // ----- hash 跳转支持 -----
    const initialHash = window.location.hash.substring(1);
    if (initialHash) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === initialHash);
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
    const nav = document.getElementById('category-nav');
    if (!nav) return;

    nav.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'category-button';
    allBtn.dataset.category = 'all';
    allBtn.textContent = 'All Articles';
    nav.appendChild(allBtn);

    categories.sort().forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-button';
        btn.dataset.category = cat;
        btn.textContent = cat;
        nav.appendChild(btn);
    });

    nav.querySelectorAll('.category-button').forEach(btn => {
        if (btn.dataset.category === currentFilterCategory) {
            btn.classList.add('active');
        }
        btn.addEventListener('click', () => {
            currentFilterCategory = btn.dataset.category;
            nav.querySelectorAll('.category-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderChapterToc(getChapterIndexData(), handleChapterClick, currentFilterCategory);
            showTocPage();
            window.location.hash = '';
        });
    });
}

function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid';
    document.getElementById('category-nav').style.display = 'flex';
    renderChapterToc(getChapterIndexData(), handleChapterClick, currentFilterCategory);
}

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

window.addEventListener('hashchange', () => {
    const chapterId = window.location.hash.substring(1);
    if (chapterId) {
        const meta = getChapterIndexData().find(ch => ch.id === chapterId);
        if (meta) {
            const currentId = document.getElementById('chapters').querySelector('h2')?.id;
            if (currentId !== chapterId) {
                handleChapterClick(meta.id, meta.file);
            }
        } else {
            showTocPage();
        }
    } else {
        showTocPage();
    }
});