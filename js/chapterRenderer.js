// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js'; // 确保这些工具函数可用
import { findAndJumpToSubtitle, updateArticleParagraphs } from './audio/audioPlayer.js'; // 导入 audioPlayer 的公共函数

// 全局变量
let allChapterIndex = []; // 所有章节的索引
let currentChapterData = null; // 当前章节的完整数据
let globalWordFrequenciesMap = new Map(); // 全局词频 Map
let globalMaxFreq = 1; // 全局最高词频
let transcriptParagraphIdCounter = 0; // 用于生成转录稿段落的唯一 ID

/**
 * 加载章节索引数据。
 * @returns {Promise<Array<Object>>} - 章节索引数组。
 */
export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} - Check 'data/chapters.json' path and server.`);
    }
    const data = await res.json();
    allChapterIndex = data.chapters;
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引数据失败:', error);
    return [];
  }
}

/**
 * 加载单个章节的详细内容。
 * @param {string} filePath - 章节内容文件的路径。
 * @returns {Promise<Object>} - 章节内容的 JSON 对象。
 */
export async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status} - Check 'data/${filePath}' path and server.`);
    }
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

/**
 * 渲染章节目录到 DOM (用于主页的缩略图列表)。
 * @param {Array<Object>} chapterIndex - 章节索引数组。
 * @param {Function} onChapterClick - 点击章节时触发的回调函数。
 * @param {string} [filterCategory='all'] - 用于过滤的分类名称，'all' 表示不过滤。
 */
export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) {
    console.error('未找到 #toc 容器。');
    return;
  }
  toc.innerHTML = '';

  const filteredChapters = chapterIndex.filter(ch => {
    if (filterCategory === 'all') {
      return true;
    }
    return Array.isArray(ch.categories) && ch.categories.includes(filterCategory);
  });

  if (filteredChapters.length === 0) {
      toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
      return;
  }

  filteredChapters.forEach(ch => {
    const itemLink = document.createElement('a');
    itemLink.href = `#${ch.id}`;
    itemLink.classList.add('chapter-list-item');

    if (ch.thumbnail) {
      const img = document.createElement('img');
      img.src = ch.thumbnail;
      img.alt = ch.title;
      itemLink.appendChild(img);
    } else {
      const defaultImg = document.createElement('img');
      defaultImg.src = 'assets/default_thumbnail.jpg';
      defaultImg.alt = 'Default Chapter Thumbnail';
      itemLink.appendChild(defaultImg);
    }

    const title = document.createElement('h3');
    title.textContent = ch.title;
    itemLink.appendChild(title);

    itemLink.dataset.filePath = ch.file;
    itemLink.addEventListener('click', (e) => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });
    toc.appendChild(itemLink);
  });
}

/**
 * 渲染单个章节内容到 DOM。
 * @param {Object} chapterContent - 当前章节的完整数据。
 * @param {Object} currentChapterTooltips - 当前章节专属的 Tooltips 数据。
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 * @param {Function} navigateToChapterCallback - 用于导航到其他章节的回调函数 (Prev/Next)。
 */
export function renderSingleChapterContent(chapterContent, currentChapterTooltips, wordFrequenciesMap, maxFreq, navigateToChapterCallback) {
  const chaptersContainer = document.getElementById('chapters');
  if (!chaptersContainer) {
    console.error('未找到 #chapters 容器。');
    return;
  }
  chaptersContainer.innerHTML = ''; // 清空旧内容

  currentChapterData = chapterContent;
  transcriptParagraphIdCounter = 0; // 每次渲染新章节时重置转录稿段落计数器

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  chaptersContainer.appendChild(title);

  let isTranscriptSection = false; // 标记当前是否处于转录稿部分
  let currentWordIndex = 0; // 追踪转录稿中所有单词的全局索引

  // 遍历章节内容的每个段落/项目
  chapterContent.paragraphs.forEach(item => {
    if (typeof item === 'string') {
      // 检查是否是特殊的标题（如 TRANSCRIPT 或 VOCABULARY）
      const trimmedItem = item.trim().toUpperCase();
      if (trimmedItem.includes('## TRANSCRIPT')) {
        isTranscriptSection = true; // 进入转录稿部分
        const transcriptTitle = document.createElement('h2');
        transcriptTitle.textContent = item.replace('## ', '').trim();
        chaptersContainer.appendChild(transcriptTitle);
        return; // 跳过当前循环，不作为普通段落处理
      } else if (trimmedItem.includes('## VOCABULARY')) {
        isTranscriptSection = false; // 离开转录稿部分
        const vocabTitle = document.createElement('h2');
        vocabTitle.textContent = item.replace('## ', '').trim();
        chaptersContainer.appendChild(vocabTitle);
        return; // 跳过当前循环
      }

      // 如果是普通 Markdown 段落
      const renderedResult = renderMarkdownWithTooltips(
          item, // 传入当前段落的 Markdown 文本
          currentChapterTooltips,
          wordFrequenciesMap,
          maxFreq,
          isTranscriptSection, // 告知 tooltip 模块是否为转录稿部分
          currentWordIndex // 传递当前单词的起始索引
      );
      currentWordIndex = renderedResult.wordCount; // 更新全局单词索引

      // 创建一个临时 div 来包裹 Marked.js 渲染后的 HTML
      // 这样可以确保每个段落或一系列元素作为一个整体被处理
      const tempWrapper = document.createElement('div');
      // Marked.js 应该在这里被调用，将 renderMarkdownWithTooltips 返回的 Markdown 渲染为 HTML
      tempWrapper.innerHTML = marked.parse(renderedResult.html);

      // 如果当前是转录稿部分，给这个段落容器添加特殊类和ID
      if (isTranscriptSection) {
          // 将 tempWrapper 的内容移入一个真正的 .transcript-paragraph 容器
          const paragraphContainer = document.createElement('div');
          paragraphContainer.classList.add('transcript-paragraph');
          paragraphContainer.dataset.paragraphId = `p-${transcriptParagraphIdCounter++}`;
          // 将 tempWrapper 的所有子元素移动到 paragraphContainer
          while (tempWrapper.firstChild) {
              paragraphContainer.appendChild(tempWrapper.firstChild);
          }
          chaptersContainer.appendChild(paragraphContainer);
      } else {
          // 非转录稿部分，直接将内容添加到章节容器
          while (tempWrapper.firstChild) {
              chaptersContainer.appendChild(tempWrapper.firstChild);
          }
      }

    } else if (item.video) {
      // 处理视频嵌入
      const videoUrl = item.video;
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative',
        paddingBottom: '56.25%',
        height: '0',
        overflow: 'hidden',
        maxWidth: '100%',
        marginBottom: '20px'
      });

      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
      });
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

      const videoId = extractVideoId(videoUrl);
      if (videoId) {
          // 更正 YouTube embed URL 格式
          iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`);
      } else {
          iframe.src = ensureEnableJsApi(videoUrl); // 使用原始 URL
      }

      wrapper.appendChild(iframe);
      chaptersContainer.appendChild(wrapper);
    }
  });

  // **为转录稿单词添加点击事件监听器**
  // 确保在所有 HTML 都渲染完毕后执行
  document.querySelectorAll('.transcript-word').forEach(wordSpan => {
      wordSpan.addEventListener('click', function(e) {
          e.preventDefault(); // 阻止默认行为

          // 获取被点击单词所属的整个段落的文本
          const paragraphElement = this.closest('.transcript-paragraph');
          if (paragraphElement) {
              // 获取段落的纯文本内容，用于与 SRT 匹配
              const paragraphText = paragraphElement.innerText || paragraphElement.textContent;
              // 调用 audioPlayer 模块的函数，传入段落文本进行匹配和跳转
              if (window.audioPlayer && window.audioPlayer.findAndJumpToSubtitle) {
                 window.audioPlayer.findAndJumpToSubtitle(paragraphText);
              } else {
                  console.warn('Audio player not initialized or findAndJumpToSubtitle function not found.');
                  console.log(`Clicked transcript word in paragraph: ${paragraphText}`);
              }
          } else {
              console.warn("Clicked word is not inside a .transcript-paragraph. Audio jump not possible for this word.");
          }
      });
  });

  // **通知 audioPlayer 模块更新其对文章段落的引用**
  // 必须在章节内容渲染完毕且 .transcript-paragraph 元素都已存在之后调用
  if (window.audioPlayer && window.audioPlayer.updateArticleParagraphs) {
      window.audioPlayer.updateArticleParagraphs();
  } else {
      console.warn('Audio player not initialized or updateArticleParagraphs function not found.');
  }


  // 章节导航链接 (保持不变)
  const navSection = document.createElement('div');
  navSection.classList.add('chapter-nav-links');

  const currentIndex = allChapterIndex.findIndex(ch => ch.id === chapterContent.id);

  if (currentIndex > 0) {
    const prevChapter = allChapterIndex[currentIndex - 1];
    const prevLink = document.createElement('a');
    prevLink.href = `#${prevChapter.id}`;
    prevLink.textContent = '上一篇';
    prevLink.classList.add('chapter-nav-link');
    prevLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToChapterCallback(prevChapter.id, prevChapter.file);
    });
    navSection.appendChild(prevLink);
  }

  if (currentIndex > 0 && (currentIndex < allChapterIndex.length - 1 || chapterContent.id)) {
    const separator1 = document.createTextNode(' | ');
    navSection.appendChild(separator1);
  }

  const toTopLink = document.createElement('a');
  toTopLink.href = `#${chapterContent.id}`;
  toTopLink.textContent = '返回本篇文章开头';
  toTopLink.classList.add('chapter-nav-link');
  toTopLink.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(chapterContent.id).scrollIntoView({ behavior: 'smooth' });
  });
  navSection.appendChild(toTopLink);

  if (currentIndex < allChapterIndex.length - 1 && (currentIndex > 0 || chapterContent.id)) {
    const separator2 = document.createTextNode(' | ');
    navSection.appendChild(separator2);
  }

  if (currentIndex < allChapterIndex.length - 1) {
    const nextChapter = allChapterIndex[currentIndex + 1];
    const nextLink = document.createElement('a');
    nextLink.href = `#${nextChapter.id}`;
    nextLink.textContent = '下一篇';
    nextLink.classList.add('chapter-nav-link');
    nextLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToChapterCallback(nextChapter.id, nextChapter.file);
    });
    navSection.appendChild(nextLink);
  }

  if (navSection.children.length > 0) {
      const separator3 = document.createTextNode(' | ');
      navSection.appendChild(separator3);
  }
  const backToTocLink = document.createElement('a');
  backToTocLink.href = '#';
  backToTocLink.textContent = '返回文章列表';
  backToTocLink.classList.add('chapter-nav-link');
  backToTocLink.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToChapterCallback('');
  });
  navSection.appendChild(backToTocLink);


  chaptersContainer.appendChild(navSection);
}

// 词频相关函数（保持不变）
export function getGlobalWordFrequenciesMap() {
  return globalWordFrequenciesMap;
}

export function getGlobalMaxFreq() {
  return globalMaxFreq;
}

export function setGlobalWordFrequencies(map, maxF) {
  globalWordFrequenciesMap = map;
  globalMaxFreq = maxF;
}
