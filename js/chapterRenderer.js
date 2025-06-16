// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';
import { tokenizeText } from './audio/tokenizer.js'; // 尽管本文件中不再直接用于DOM词分，但保留导入
import { parseSRT } from './audio/srtParser.js';

let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

// 辅助函数：清理文本，移除 [[...]] 标记，用于匹配
// 保留你文件中已有的定义
function cleanTextForMatching(text) {
  // 移除 [[...|...]] 形式的标记，只保留内容
  let cleaned = text.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1');
  // 移除其他可能的非文本字符，或标准化空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim(); // 将多个空格替换为单个空格并修剪
  return cleaned;
}

// 辅助函数：在原始文本中找到与 SRT 文本匹配的片段，并返回其原始的文本和结束位置
// 目标：Given originalText with [[...]] and a pureSrtText, find the original segment that matches pureSrtText.
// 此函数已根据更鲁棒的匹配逻辑进行优化
function findOriginalTextSegment(originalText, startPosInOriginal, pureSrtText, cleanerFunc) {
    const cleanedSrtText = cleanerFunc(pureSrtText); // SRT文本的纯净版本
    let matchedOriginalText = null;
    let endPosInOriginal = -1;

    // 遍历原始文本的剩余部分，尝试找到匹配
    // 这里的 i 是在 originalText 中的真实索引
    for (let i = startPosInOriginal; i < originalText.length; i++) {
        let currentOriginalEndCursor = i; // 在 originalText 中的当前结束游标
        let currentCleanedLengthAccumulated = 0; // 累计的清理后文本长度

        // 尝试从当前位置开始，构建一个清理后的字符串，直到它与 cleanedSrtText 匹配或超出
        while (currentOriginalEndCursor < originalText.length && currentCleanedLengthAccumulated < cleanedSrtText.length) {
            const char = originalText[currentOriginalEndCursor];
            const nextTwoChars = originalText.substring(currentOriginalEndCursor, currentOriginalEndCursor + 2);

            // 如果遇到 [[ 标记，跳过整个标记的内容和本身
            if (nextTwoChars === '[[' && originalText.indexOf(']]', currentOriginalEndCursor) !== -1) {
                const tagEndIndex = originalText.indexOf(']]', currentOriginalEndCursor);
                if (tagEndIndex !== -1) {
                    const tagContent = originalText.substring(currentOriginalEndCursor + 2, tagEndIndex);
                    const pipeIndex = tagContent.indexOf('|');
                    const textInsideTag = pipeIndex !== -1 ? tagContent.substring(0, pipeIndex) : tagContent;
                    currentCleanedLengthAccumulated += cleanerFunc(textInsideTag).length;
                    currentOriginalEndCursor = tagEndIndex + 2; // 跳过整个标记
                    continue;
                }
            }
            // 处理普通字符，将其清理后的长度加入累计
            currentCleanedLengthAccumulated += cleanerFunc(char).length;
            currentOriginalEndCursor++;
        }

        // 检查构建出的原始文本片段（从 i 到 currentOriginalEndCursor）在清理后是否与 cleanedSrtText 完全匹配
        const candidateOriginalText = originalText.substring(i, currentOriginalEndCursor);
        const cleanedCandidateText = cleanerFunc(candidateOriginalText);

        if (cleanedCandidateText === cleanedSrtText) {
            matchedOriginalText = candidateOriginalText;
            endPosInOriginal = currentOriginalEndCursor;
            break; // 找到第一个匹配，跳出循环
        }
    }
    return { matchedOriginalText: matchedOriginalText, endPosInOriginal: endPosInOriginal };
}


export async function loadChapterIndex() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    allChapterIndex = data.chapters;
    return allChapterIndex;
  } catch (error) {
    console.error('加载章节索引失败:', error);
    return [];
  }
}

export async function loadSingleChapterContent(filePath) {
  try {
    const res = await fetch(`data/${filePath}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error(`加载章节内容失败 (${filePath}):`, error);
    return null;
  }
}

export function renderChapterToc(chapterIndex, onChapterClick, filterCategory = 'all') {
  const toc = document.getElementById('toc');
  if (!toc) return console.error('未找到 #toc 容器。');
  toc.innerHTML = '';

  const filtered = chapterIndex.filter(ch =>
    filterCategory === 'all' || (Array.isArray(ch.categories) && ch.categories.includes(filterCategory))
  );

  if (filtered.length === 0) {
    toc.innerHTML = `<p style="text-align: center; padding: 50px; color: #666;">No articles found for category: "${filterCategory}".</p>`;
    return;
  }

  filtered.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.classList.add('chapter-list-item');
    link.dataset.filePath = ch.file;

    const img = document.createElement('img');
    img.src = ch.thumbnail || 'assets/default_thumbnail.jpg';
    img.alt = ch.title;
    link.appendChild(img);

    const title = document.createElement('h3');
    title.textContent = ch.title;
    link.appendChild(title);

    link.addEventListener('click', e => {
      e.preventDefault();
      onChapterClick(ch.id, ch.file);
    });

    toc.appendChild(link);
  });
}

export async function renderSingleChapterContent(
  chapterContent,
  currentTooltips,
  wordFreqMap,
  maxFreq,
  navigateToChapter,
  srtEntries = []
) {
  const container = document.getElementById('chapters');
  if (!container) return console.error('未找到 #chapters 容器。');
  container.innerHTML = '';
  currentChapterData = chapterContent;

  const title = document.createElement('h2');
  title.id = chapterContent.id;
  title.textContent = chapterContent.title;
  container.appendChild(title);

  let srtCursor = 0; // 用于跟踪当前章节 SRT 条目的索引

  for (const item of chapterContent.paragraphs) {
    if (typeof item === 'string') {
      // 兼容旧的字符串格式，将其视为 markdown/text
      const para = document.createElement('p');
      para.classList.add('chapter-paragraph');
      const html = renderMarkdownWithTooltips(item, currentTooltips, wordFreqMap, maxFreq);
      const temp = document.createElement('div');
      temp.innerHTML = html;
      while (temp.firstChild) para.appendChild(temp.firstChild);
      container.appendChild(para);
    } else if (item.type === 'markdown' || item.type === 'text') {
      // 处理普通的文本或 Markdown 内容
      const para = document.createElement('p');
      para.classList.add('chapter-paragraph');
      const html = renderMarkdownWithTooltips(item.content, currentTooltips, wordFreqMap, maxFreq);
      const temp = document.createElement('div');
      temp.innerHTML = html;
      while (temp.firstChild) para.appendChild(temp.firstChild);
      container.appendChild(para);
    } else if (item.type === 'audio-transcript') {
      const audioPara = document.createElement('p');
      audioPara.classList.add('chapter-paragraph', 'audio-transcript-block');

      const originalBlockContent = item.content; // 包含 [[...]] 标记的原始文本
      // 注意：这里不再需要 cleanedBlockContent 的全局变量，因为 findOriginalTextSegment 内部处理

      let currentBlockContentPos = 0; // 在 originalBlockContent 中的当前处理位置

      while (srtCursor < srtEntries.length) {
        const srtEntry = srtEntries[srtCursor];
        const srtText = srtEntry.text.trim(); // SRT 的纯文本

        // 调用辅助函数，在原始文本中查找匹配的片段
        const { matchedOriginalText, endPosInOriginal } = findOriginalTextSegment(
            originalBlockContent,
            currentBlockContentPos,
            srtText,
            cleanTextForMatching
        );

        if (matchedOriginalText) {
          // 渲染 SRT 句子之前的非 SRT 文本（如果有）
          // 这部分文本可能包含换行符或其他 markdown，仍需 renderMarkdownWithTooltips 处理
          if (currentBlockContentPos < (endPosInOriginal - matchedOriginalText.length)) {
             const preSrtText = originalBlockContent.substring(currentBlockContentPos, endPosInOriginal - matchedOriginalText.length);
             const html = renderMarkdownWithTooltips(preSrtText, currentTooltips, wordFreqMap, maxFreq);
             const temp = document.createElement('div');
             temp.innerHTML = html;
             while (temp.firstChild) audioPara.appendChild(temp.firstChild);
          }


          // 渲染 SRT 句子对应的部分
          const sent = document.createElement('span');
          sent.classList.add('sentence');
          sent.dataset.subIndex = srtCursor; // 用于查找对应的DOM元素
          sent.dataset.startTime = srtEntry.start;
          sent.dataset.endTime = srtEntry.end;

          // 将包含 [[...]] 标记的原始文本片段传递给 renderMarkdownWithTooltips
          // **重要：renderMarkdownWithTooltips 必须确保在渲染后的 HTML 中，
          // 每个实际的单词都被一个 `<span class="word">` 标签包裹。**
          const sentenceHtml = renderMarkdownWithTooltips(matchedOriginalText, currentTooltips, wordFreqMap, maxFreq);
          const tempDivForHtml = document.createElement('div');
          tempDivForHtml.innerHTML = sentenceHtml;

          // 将 tempDivForHtml 的所有子节点附加到 sentenceSpan 中
          while(tempDivForHtml.firstChild) {
              sent.appendChild(tempDivForHtml.firstChild);
          }

          audioPara.appendChild(sent);
          srtCursor++; // 推进 SRT 游标
          currentBlockContentPos = endPosInOriginal; // 更新在原始块中的位置

        } else {
          // 当前 SRT 条目在 originalBlockContent 的剩余部分中找不到
          // 这通常意味着 SRT 与文章文本不完全一致，或者当前 SRT 块已处理完毕
          console.warn(`在 audio-transcript 块中未能找到 SRT 条目 ${srtEntry.id}: "${srtText}" 对应的原始文本。
                        当前处理位置: ${currentBlockContentPos}, 剩余内容: "${originalBlockContent.substring(currentBlockContentPos).substring(0, 100)}..."`);
          // 无法匹配，我们可能需要跳过此 SRT 条目，或结束此块的匹配
          // 这里选择结束当前 audio-transcript 块的 SRT 匹配，以防无限循环或错误跳过
          break;
        }
      }

      // 处理当前 audio-transcript 块中剩余的文本（在所有匹配的 SRT 句子之后）
      if (currentBlockContentPos < originalBlockContent.length) {
        const postSrtText = originalBlockContent.substring(currentBlockContentPos);
        const html = renderMarkdownWithTooltips(postSrtText, currentTooltips, wordFreqMap, maxFreq);
        const temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.firstChild) audioPara.appendChild(temp.firstChild);
      }
      container.appendChild(audioPara);

    } else if (item.video) {
      // 处理视频内容，保持不变
      const wrapper = document.createElement('div');
      Object.assign(wrapper.style, {
        position: 'relative', paddingBottom: '56.25%', height: '0', overflow: 'hidden', maxWidth: '100%', marginBottom: '20px'
      });
      const iframe = document.createElement('iframe');
      Object.assign(iframe.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
      });
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      const videoId = extractVideoId(item.video);
      // 修正 YouTube URL 格式，将 2{videoId} 修正为 embed/{videoId}
      iframe.src = videoId
        ? ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}?enablejsapi=1`)
        : ensureEnableJsApi(item.video);
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
    }
  }

  // --- 导航链接渲染逻辑 (与你原有的保持一致) ---
  const nav = document.createElement('div');
  nav.classList.add('chapter-nav-links');

  const idx = allChapterIndex.findIndex(c => c.id === chapterContent.id);

  if (idx > 0) {
    const prev = allChapterIndex[idx - 1];
    const link = document.createElement('a');
    link.textContent = '上一篇';
    link.href = `#${prev.id}`;
    link.classList.add('chapter-nav-link');
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateToChapter(prev.id, prev.file);
    });
    nav.appendChild(link);
  }

  if (idx > 0 && idx < allChapterIndex.length - 1) nav.appendChild(document.createTextNode(' | '));

  const toTop = document.createElement('a');
  toTop.textContent = '返回本篇文章开头';
  toTop.href = `#${chapterContent.id}`;
  toTop.classList.add('chapter-nav-link');
  toTop.addEventListener('click', e => {
    e.preventDefault();
    document.getElementById(chapterContent.id)?.scrollIntoView({ behavior: 'smooth' });
  });
  nav.appendChild(toTop);

  if (idx < allChapterIndex.length - 1) {
    nav.appendChild(document.createTextNode(' | '));
    const next = allChapterIndex[idx + 1];
    const link = document.createElement('a');
    link.textContent = '下一篇';
    link.href = `#${next.id}`;
    link.classList.add('chapter-nav-link');
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateToChapter(next.id, next.file);
    });
    nav.appendChild(link);
  }

  nav.appendChild(document.createTextNode(' | '));
  const back = document.createElement('a');
  back.textContent = '返回文章列表';
  back.href = '#';
  back.classList.add('chapter-nav-link');
  back.addEventListener('click', e => {
    e.preventDefault();
    navigateToChapter('');
  });
  nav.appendChild(back);

  container.appendChild(nav);
}

// 状态管理器
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
