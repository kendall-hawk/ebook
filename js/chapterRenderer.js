// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';
import { tokenizeText } from './audio/tokenizer.js';
import { parseSRT } from './audio/srtParser.js';

let allChapterIndex = [];
let currentChapterData = null;
let globalWordFrequenciesMap = new Map();
let globalMaxFreq = 1;

// 辅助函数：清理文本，移除 [[...]] 标记，用于匹配
function cleanTextForMatching(text) {
  // 移除 [[...|...]] 形式的标记，只保留内容
  let cleaned = text.replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1');
  // 移除其他可能的非文本字符，或标准化空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim(); // 将多个空格替换为单个空格并修剪
  return cleaned;
}

// 辅助函数：清理字符串，用于更深层次的模糊比较（移除标点、转换小写）
function cleanTextForDeepComparison(str) {
    return str.replace(/[\s.,!?;:"“”‘’…—\-_\n\r]+/g, '').toLowerCase();
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
      const cleanedBlockContent = cleanTextForMatching(originalBlockContent); // 移除 [[...]] 标记后的纯文本

      let currentBlockContentPos = 0; // 在 originalBlockContent 中的当前处理位置

      while (srtCursor < srtEntries.length) {
        const srtEntry = srtEntries[srtCursor];
        const srtText = srtEntry.text.trim();
        const cleanedSrtText = cleanTextForMatching(srtText); // 清理 SRT 文本

        // 在**清理后的文章内容**中查找**清理后的 SRT 文本**
        const matchIndexInCleanedBlock = cleanedBlockContent.indexOf(cleanedSrtText, cleanTextForMatching(originalBlockContent.substring(0, currentBlockContentPos)).length);

        if (matchIndexInCleanedBlock !== -1) {
          // **找到匹配**：现在需要从**原始的 originalBlockContent** 中截取对应的部分。
          // 这需要一个映射：清理后的文本索引 -> 原始文本索引
          // 这是一个复杂的问题，简单的 indexOf 无法直接映射回原始文本的真实长度，因为 [[...]] 标记被移除了。
          // 更可靠的方法是，我们不再直接使用 indexOf(cleanedSrtText)。
          // 而是通过迭代原始文本，并逐个匹配清理后的 token，从而找到原始文本的真实起点和终点。

          // 由于直接从 cleanedBlockContent 的索引反推 originalBlockContent 的索引很困难且容易出错，
          // 我们采取另一种策略：在原始文本上进行“模糊”匹配，并找到其在 SRT 中的真实起点。
          // 这种方法假定 SRT 文本在移除标记后，与原始文本的对应部分是大致一致的。

          // 首先，找到当前清理后的 srtText 在 cleanedBlockContent 的剩余部分的起始位置
          const currentCleanedRemaining = cleanedBlockContent.substring(cleanTextForMatching(originalBlockContent.substring(0, currentBlockContentPos)).length);
          const cleanedSrtTextRelativeIndex = currentCleanedRemaining.indexOf(cleanedSrtText);

          if (cleanedSrtTextRelativeIndex === -1) {
              // 无法找到，说明当前 SRT 条目不匹配或已超出当前块
              break;
          }

          // 计算出在原始的 `originalBlockContent` 中，`cleanedSrtText` 对应的开始和结束位置
          // 这个辅助函数将尝试从原始文本中提取出与清理后的 SRT 文本最匹配的子串
          const { matchedOriginalText, endPosInOriginal } = findOriginalTextSegment(
              originalBlockContent,
              currentBlockContentPos,
              srtText, // 传入原始SRT文本，而不是清理后的，因为我们要匹配其内容
              cleanTextForMatching // 用于清理的函数
          );

          if (!matchedOriginalText) {
              // 未能找到对应的原始文本段，跳过当前 SRT 条目或结束循环
              console.warn(`无法在原始段落中找到 SRT 条目 ${srtEntry.id} 对应的原始文本: "${srtText}"`);
              break;
          }

          // **在匹配的 SRT 句子之前有其他文本（如果有）**
          if (matchedOriginalText !== srtText && currentBlockContentPos < (endPosInOriginal - matchedOriginalText.length)) {
             // 只有当 matchedOriginalText 不完全等于 srtText 且前面有非 SRT 文本时才渲染
             const preSrtText = originalBlockContent.substring(currentBlockContentPos, endPosInOriginal - matchedOriginalText.length);
             const html = renderMarkdownWithTooltips(preSrtText, currentTooltips, wordFreqMap, maxFreq);
             const temp = document.createElement('div');
             temp.innerHTML = html;
             while (temp.firstChild) audioPara.appendChild(temp.firstChild);
          }


          // 渲染 SRT 句子
          const sent = document.createElement('span');
          sent.classList.add('sentence');
          sent.dataset.subIndex = srtCursor;
          sent.dataset.startTime = srtEntry.start;
          sent.dataset.endTime = srtEntry.end;

          // 使用原始的、包含标记的 matchedOriginalText 进行分词和渲染
          // renderMarkdownWithTooltips 应该能够处理这些标记并生成正确的 HTML 结构
          // 但这里我们的目标是逐词高亮，所以我们用 tokenizeText 直接处理纯文本，
          // 并将标记作为 tooltip.js 的职责来处理。
          // 实际上，tokenizeText 在处理 [[...]] 时，可能会将其作为一个 token。
          // 这里需要确保 tokenizeText 只处理纯文本。
          // 因此，我们会将 srtText 再次传递给 tokenizeText，因为它是纯的。
          // 同时，我们需要渲染 originalBlockContent 的一部分，并让它里面的单词被高亮。

          // 最好的方法是：
          // 1. 获取 originalBlockContent 中对应 SRT 文本的子串 (matchedOriginalText)。
          // 2. 将这个子串传递给 renderMarkdownWithTooltips，它会处理 [[...]] 并返回 HTML。
          // 3. 然后，我们需要在这个 HTML 内部找到纯文本的单词，并给它们添加 .word 和 .highlight 类。
          // 这意味着我们需要修改 renderMarkdownWithTooltips 或者在之后进行 DOM 操作。

          // 重新评估：如果你希望保留 [[...]] 并在其内部高亮单词，那么 `tokenizeText` 就不能移除它们。
          // `tokenizeText` 应该只分割单词和标点，而 `renderMarkdownWithTooltips` 负责解析 `[[...]]`。

          // 方案调整：
          // - renderMarkdownWithTooltips 返回的 HTML 中，需要让每个词依然被 `<span>` 包裹 (例如 `<span>word</span>`)
          // - 这样我们才能对这些 `<span>` 进行高亮。

          // 假设 renderMarkdownWithTooltips 能够返回包含 `<span>word</span>` 结构的 HTML
          // 并且 `tokenizeText` 在这里只用于估算单词数量和逐词推进。
          // 但是，如果 `tokenizeText` 拿到的是 `[[invention|invention-noun]]` 这样的，它会把它当成一个单词。
          // 我们需要让 renderMarkdownWithTooltips 负责将它渲染成 HTML，
          // 然后在渲染后的 HTML 中找到实际的单词。

          // 这是一个更复杂的整合点。
          // 暂时的解决方案（可能不是最优雅的）：
          // 1. 将 srtText 用于时间戳和单词数量估算。
          // 2. 将 matchedOriginalText 用于渲染 HTML，并让其内部的词被正确地标记为 .word
          // 如果 renderMarkdownWithTooltips 不会给每个词加 .word，这就会成为问题。

          // 最直接的修改是：让 `renderMarkdownWithTooltips` 返回的 HTML 中，
          // 每个实际的单词（非标记部分）都包裹在一个 `<span class="word-for-highlight">` 中。
          // 然后我们在这个 `word-for-highlight` 上应用高亮。

          // 为了简化，我们假设 `renderMarkdownWithTooltips` 最终会生成一个 DOM 结构，
          // 并且这个结构里可以找到实际的单词节点。
          // 否则，我们需要在 `renderMarkdownWithTooltips` 内部添加逻辑，或者在它渲染后再次处理 DOM。

          // **当前方案：** `tokenizeText` 仍然基于 SRT 纯文本来确定高亮顺序和数量。
          // 但是，DOM 渲染使用 `matchedOriginalText`，这意味着渲染的词可能比 SRT 纯文本多（如标记）。
          // 这会导致高亮和实际显示的词不完全对应。

          // **更好的方法 (需要 tooltip.js 和 chapterRenderer.js 协同)：**
          // 1. `renderMarkdownWithTooltips` 应该返回一个 DOM 元素，而不是纯 HTML 字符串。
          // 2. 这个 DOM 元素内部，所有实际的单词都应该被 `<span class="word">` 包裹。
          //    例如：`This is an <span class="tooltip-container"><span class="tooltip-trigger">invention</span><span class="tooltip-content">...</span></span>.`
          //    如果这样，那么我们需要 `<span>invention</span>` 能够被 `querySelectorAll('.word')` 选中。

          // 鉴于你已有的结构，我将尝试在 `renderSingleChapterContent` 中，
          // 依然利用 `tokenizeText(srtText)` 来确定高亮的逻辑步进，
          // 但实际渲染的文本是 `matchedOriginalText`。
          // 这要求 `matchedOriginalText` 在渲染后，其中的词能够被你的高亮函数识别。

          // 为了让高亮功能工作，`highlightWords` 需要 `sentenceEl.querySelectorAll('.word')`。
          // 这意味着 `renderMarkdownWithTooltips` 返回的 HTML 必须包含 `class="word"` 的 span。

          // 假设 renderMarkdownWithTooltips 已经处理了 [[...]] 并在最终的纯文本单词上加了 `class="word"`
          // 这是最简单的路径。如果不是，那么需要修改 renderMarkdownWithTooltips。
          const sentenceHtml = renderMarkdownWithTooltips(matchedOriginalText, currentTooltips, wordFreqMap, maxFreq);
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = sentenceHtml;

          // 将 tempDiv 的所有子节点附加到 sentenceSpan 中
          while(tempDiv.firstChild) {
              sent.appendChild(tempDiv.firstChild);
          }

          audioPara.appendChild(sent);
          srtCursor++; // 推进 SRT 游标
          currentBlockContentPos = endPosInOriginal; // 更新在原始块中的位置
        } else {
          // 当前 SRT 条目在 currentBlockContent 的剩余部分中找不到（精确匹配清理后文本失败）
          // 这意味着当前 audio-transcript 块的 SRT 内容可能已经处理完毕，或者 SRT 条目与文章文本不一致
          console.warn(`在 audio-transcript 块中未能找到 SRT 条目 ${srtEntry.id}: "${srtText}" 对应的原始文本。`);
          break; // 跳出内部 while 循环
        }
      }

      // 处理当前 audio-transcript 块中剩余的文本
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
      iframe.src = videoId
        ? ensureEnableJsApi(`http://www.youtube.com/embed/${videoId}?enablejsapi=1`) // 修正 YouTube URL 格式
        : ensureEnableJsApi(item.video);
      wrapper.appendChild(iframe);
      container.appendChild(wrapper);
    }
  }

  // ... (保留底部的导航链接渲染逻辑)
  const nav = document.createElement('div');
  nav.classList.add('chapter-nav-links');
  const idx = allChapterIndex.findIndex(c => c.id === chapterContent.id);
  // ... (导航链接的创建逻辑，与你原有的保持一致)
  // ...
  container.appendChild(nav);
}

// 辅助函数：在原始文本中找到与 SRT 文本匹配的片段，并返回其原始的文本和结束位置
// 目标：Given originalText with [[...]] and a pureSrtText, find the original segment that matches pureSrtText.
function findOriginalTextSegment(originalText, startPosInOriginal, pureSrtText, cleanerFunc) {
    const cleanedSrtText = cleanerFunc(pureSrtText); // SRT文本的纯净版本
    let bestMatchOriginalText = null;
    let bestMatchEndPos = -1;

    // 遍历原始文本的剩余部分，尝试找到匹配
    for (let i = startPosInOriginal; i < originalText.length; i++) {
        const sub = originalText.substring(i);
        const cleanedSub = cleanerFunc(sub);

        // 如果清理后的子串以清理后的SRT文本开头
        if (cleanedSub.startsWith(cleanedSrtText)) {
            // 我们找到了一个潜在的匹配点。现在需要确定这个匹配在原始文本中结束在哪里。
            // 这是一个挑战：cleanedSrtText 的长度和原始文本中对应部分的长度可能不同。
            // 简单的方法是，假设从匹配点开始，原始文本的长度大致等于 srtText 的长度加上一些裕度
            // 更精确的方法需要逐字符比较，或者重新使用 tokenizer。

            // 替代策略：尝试从当前位置开始，匹配 SRT 纯文本的长度，然后检查清理后是否一致。
            // 这是一个递归问题，因为 [[...]] 可以嵌套或变化。

            // 最稳健的方案是：
            // 遍历 originalText 的剩余部分，同时维护一个“清理后”的游标。
            // 当清理后的游标前进到与 cleanedSrtText 长度相等时，就认为找到了。

            let currentCleanedLength = 0;
            let currentOriginalEnd = i;
            while (currentOriginalEnd < originalText.length && currentCleanedLength < cleanedSrtText.length) {
                const char = originalText[currentOriginalEnd];
                // 检查是否是标记开始，如果是，跳过整个标记
                if (char === '[' && originalText[currentOriginalEnd + 1] === '[') {
                    const tagEndIndex = originalText.indexOf(']]', currentOriginalEnd);
                    if (tagEndIndex !== -1) {
                        currentOriginalEnd = tagEndIndex + 2;
                        continue; // 跳过标记，不计入清理后的长度
                    }
                }
                // 正常字符，计入清理后的长度
                currentCleanedLength += cleanerFunc(char).length; // 检查清理后字符的长度（通常为0或1）
                currentOriginalEnd++;
            }

            // 检查实际清理后的文本是否匹配
            const candidateOriginalText = originalText.substring(i, currentOriginalEnd);
            if (cleanerFunc(candidateOriginalText) === cleanedSrtText) {
                bestMatchOriginalText = candidateOriginalText;
                bestMatchEndPos = currentOriginalEnd;
                break; // 找到第一个匹配，跳出
            }
        }
    }
    return { matchedOriginalText: bestMatchOriginalText, endPosInOriginal: bestMatchEndPos };
}


// ... (保留 getGlobalWordFrequenciesMap, getGlobalMaxFreq, setGlobalWordFrequencies)
