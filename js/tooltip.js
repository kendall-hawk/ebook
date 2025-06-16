// js/tooltip.js
import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import { tokenizeText } from './audio/tokenizer.js'; // 导入 tokenizer

marked.setOptions({
  gfm: true,
  breaks: true
});

let _currentHideTimeout = null;
let _currentActiveTooltipSpan = null;
let _sentenceIdCounter = 0; // 用于在整个章节渲染过程中为句子生成唯一ID

export function renderMarkdownWithTooltips(
    md,
    currentChapterTooltips,
    wordFrequenciesMap,
    maxFreq,
    baseFontSize = 16,
    maxFontSizeIncrease = 12,
    // 新增参数：一个基准 ID，用于确保 sentenceId 的唯一性
    // 假设这个参数是来自 chapterRenderer 的 `chapterContent.id_pX` 或直接是 chapterContent.id
    baseIdPrefix = 'default_paragraph'
) {
    // 步骤 1: 预处理自定义 Tooltip 语法 [[word|tooltipId]]
    // 在这里，我们将 [[...]] 转换为 Marked.js 能够直接解析的 <span data-tooltip-id="..." ...> 结构
    const customTooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
    let preprocessedMd = md.replace(customTooltipPattern, (match, word, tooltipId) => {
        // 这里的 span 已经包含 tooltip 信息，后面我们会添加高亮所需信息
        return `<span data-tooltip-id="${tooltipId}" class="word-pre-render">${word}</span>`;
    });

    // 步骤 2: 使用 Marked.js 将 Markdown 转换为基本的 HTML 字符串
    const initialHtml = marked.parse(preprocessedMd);

    // 步骤 3: 使用 DOMParser 将 HTML 字符串解析成一个可操作的 DOM 树
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${initialHtml}</div>`, 'text/html');
    const rootElement = doc.body.firstChild; // 获取最外层的 div 容器

    const finalOutputNodes = []; // 收集最终的 DOM 节点
    let currentSentenceSpan = null; // 用于收集属于同一个句子的单词span

    // 辅助函数：处理单个单词，生成带有高亮和 Tooltip 属性的 Span
    function createWordSpan(wordText, originalIndex, isTooltipWord = false, tooltipId = null) {
        const wordSpan = doc.createElement('span');
        wordSpan.textContent = wordText;
        wordSpan.classList.add('word-highlightable'); // 所有可高亮的词都添加这个类

        const lowerWord = wordText.toLowerCase();
        const freq = wordFrequenciesMap.get(lowerWord) || 0;
        let fontSizeStyle = '';

        if (freq > 0 && maxFreq > 0) {
            const calculatedFontSize = baseFontSize + (freq / maxFreq) * maxFontSizeIncrease;
            fontSizeStyle = `font-size: ${calculatedFontSize.toFixed(1)}px;`;
        }
        if (fontSizeStyle) {
            wordSpan.style.cssText += fontSizeStyle;
        }

        if (isTooltipWord) {
            wordSpan.classList.add('word'); // Tooltip 的 class
            wordSpan.dataset.tooltipId = tooltipId || lowerWord;
        }

        // 单词 ID 在这里生成，与句子 ID 关联
        // 注意：wordObj.originalIndex 是单词在**当前句子**内的索引
        wordSpan.dataset.wordId = `${currentSentenceSpan.dataset.sentenceId}-w${originalIndex}`;

        return wordSpan;
    }

    // 递归函数来遍历和转换节点
    function traverseAndTransform(node, parentNodeIsBlock = false) {
        if (node.nodeType === Node.TEXT_NODE) {
            const textContent = node.textContent;
            if (textContent.trim().length === 0 && !textContent.includes('\n')) return; // 忽略纯空白文本节点，但保留换行

            // 简单的句子分割：按句号、问号、感叹号及后面的空格分割
            // 注意：这里用 `split` 会移除分隔符，需要手动处理
            const sentenceParts = textContent.split(/([.?!])(?=\s|$)|(\s+)/g); // 捕获分隔符和空格

            let tempSentenceBuffer = [];
            sentenceParts.forEach(part => {
                if (!part) return; // 过滤空字符串

                tempSentenceBuffer.push(part);

                // 如果当前部分是句末标点，或者它是文本的最后一部分且不包含标点
                const isSentenceEnd = part.match(/[.?!]/) || (part === sentenceParts[sentenceParts.length - 1] && !part.match(/\s+/));

                if (isSentenceEnd && tempSentenceBuffer.some(p => p.trim().length > 0)) {
                    const fullSentenceText = tempSentenceBuffer.join('');
                    const trimmedSentenceText = fullSentenceText.trim();

                    if (trimmedSentenceText.length > 0) {
                        _sentenceIdCounter++; // 递增句子 ID
                        currentSentenceSpan = doc.createElement('span');
                        currentSentenceSpan.classList.add('sentence-container');
                        currentSentenceSpan.dataset.sentenceId = `${baseIdPrefix}_s${_sentenceIdCounter}`;

                        const words = tokenizeText(trimmedSentenceText); // 再次分词
                        words.forEach((wordObj) => {
                            const lowerWord = wordObj.word.toLowerCase();
                            const isTooltipWord = currentChapterTooltips.hasOwnProperty(lowerWord);
                            const wordSpan = createWordSpan(wordObj.word, wordObj.originalIndex, isTooltipWord, lowerWord); // originalIndex 现在是单词在当前句子中的索引
                            currentSentenceSpan.appendChild(wordSpan);
                            currentSentenceSpan.appendChild(doc.createTextNode(' ')); // 单词之间添加空格
                        });
                        // 移除最后一个空格
                        if (currentSentenceSpan.lastChild && currentSentenceSpan.lastChild.nodeType === Node.TEXT_NODE && currentSentenceSpan.lastChild.textContent === ' ') {
                            currentSentenceSpan.removeChild(currentSentenceSpan.lastChild);
                        }
                        finalOutputNodes.push(currentSentenceSpan);
                        currentSentenceSpan = null; // 句子处理完毕，重置
                    }
                    tempSentenceBuffer = []; // 清空缓冲区
                }
            });

            // 处理缓冲区中剩余的，如果它们不构成完整句子但有内容
            if (tempSentenceBuffer.some(p => p.trim().length > 0)) {
                const fullSentenceText = tempSentenceBuffer.join('');
                const trimmedSentenceText = fullSentenceText.trim();
                 if (trimmedSentenceText.length > 0) {
                    _sentenceIdCounter++;
                    currentSentenceSpan = doc.createElement('span');
                    currentSentenceSpan.classList.add('sentence-container');
                    currentSentenceSpan.dataset.sentenceId = `${baseIdPrefix}_s${_sentenceIdCounter}`;

                    const words = tokenizeText(trimmedSentenceText);
                    words.forEach((wordObj) => {
                        const lowerWord = wordObj.word.toLowerCase();
                        const isTooltipWord = currentChapterTooltips.hasOwnProperty(lowerWord);
                        const wordSpan = createWordSpan(wordObj.word, wordObj.originalIndex, isTooltipWord, lowerWord);
                        currentSentenceSpan.appendChild(wordSpan);
                        currentSentenceSpan.appendChild(doc.createTextNode(' '));
                    });
                    if (currentSentenceSpan.lastChild && currentSentenceSpan.lastChild.nodeType === Node.TEXT_NODE && currentSentenceSpan.lastChild.textContent === ' ') {
                        currentSentenceSpan.removeChild(currentSentenceSpan.lastChild);
                    }
                    finalOutputNodes.push(currentSentenceSpan);
                    currentSentenceSpan = null;
                 }
            }


        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // 如果是元素节点 (如 <p>, <strong>, <a>, 或者 Marked 已经生成的 .word-pre-render span)
            // 复制当前元素节点 (浅拷贝，不复制子节点)
            const newElement = doc.createElement(node.tagName.toLowerCase());
            Array.from(node.attributes).forEach(attr => newElement.setAttribute(attr.name, attr.value));

            // 如果是预处理的 `word-pre-render` span，意味着它是来自 `[[...]]` 的 Tooltip 词
            if (node.classList.contains('word-pre-render')) {
                // 此时，这个 span 内部应该只有文本
                const wordText = node.textContent;
                const lowerWord = wordText.toLowerCase();
                const tooltipId = node.dataset.tooltipId; // 从预处理的 span 中获取 tooltipId

                // 这里我们直接创建高亮和 Tooltip 兼备的 span
                if (!currentSentenceSpan) {
                    _sentenceIdCounter++;
                    currentSentenceSpan = doc.createElement('span');
                    currentSentenceSpan.classList.add('sentence-container');
                    currentSentenceSpan.dataset.sentenceId = `${baseIdPrefix}_s${_sentenceIdCounter}`;
                }
                const wordSpan = createWordSpan(wordText, 0, true, tooltipId); // originalIndex 设为0，因为这里是单个词
                currentSentenceSpan.appendChild(wordSpan);
                currentSentenceSpan.appendChild(doc.createTextNode(' ')); // 添加空格
                // 不将这个 wordSpan 作为独立的 finalOutputNodes，它会成为 currentSentenceSpan 的子节点
                return; // 不再递归处理其子节点，因为我们已经处理了其文本
            }

            // 检查元素是否是块级元素，如果是，则结束当前句子并添加到 finalOutputNodes
            const isBlockElement = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE'].includes(node.tagName.toUpperCase());

            if (currentSentenceSpan && isBlockElement) {
                finalOutputNodes.push(currentSentenceSpan);
                currentSentenceSpan = null;
            }

            // 递归处理子节点
            Array.from(node.childNodes).forEach(child => {
                traverseAndTransform(child, isBlockElement);
                // 经过 transform 后，子节点可能已经直接被添加到 finalOutputNodes 或 currentSentenceSpan
                // 所以这里不再需要手动将返回值添加到 newElement
            });

            // 只有当这个元素是真正的“容器”（如<p>），而不是中间的span时，才添加到 finalOutputNodes
            // 并且只有当它包含了内容（即有子节点）
            if (newElement.childNodes.length > 0 || isBlockElement) {
                 // 如果 newElement 自身没有被包裹进 sentenceSpan，则直接添加到 finalOutputNodes
                 // 这是一个复杂的判断点，确保没有重复添加或丢失
                 if (!currentSentenceSpan || !currentSentenceSpan.contains(newElement)) {
                     finalOutputNodes.push(newElement);
                 }
            }


        }
    }

    // 启动遍历根元素的所有顶层子节点
    Array.from(rootElement.childNodes).forEach(node => {
        traverseAndTransform(node, true); // 假设顶层元素都是块级元素
    });

    // 处理可能在遍历结束时仍未添加到 finalOutputNodes 的 currentSentenceSpan
    if (currentSentenceSpan) {
        finalOutputNodes.push(currentSentenceSpan);
    }

    // 将所有最终 DOM 节点拼接成 HTML 字符串
    const finalHtmlString = finalOutputNodes.map(el => el.outerHTML).join('');

    // 重置句子计数器，以便下次渲染新章节时从头开始
    _sentenceIdCounter = 0;

    return finalHtmlString;
}

export function setupTooltips() {
    const tooltipDiv = document.getElementById('react-tooltips');
    const contentContainer = document.getElementById('chapters') || document.body;

    if (!tooltipDiv) {
        console.warn('Tooltip container #react-tooltips not found. Tooltips may not display.');
        return;
    }

    // Remove old event listeners to prevent duplicates
    if (window._tooltipGlobalClickListener) {
        document.removeEventListener('click', window._tooltipGlobalClickListener);
    }
    if (window._tooltipScrollListener) {
        document.removeEventListener('scroll', window._tooltipScrollListener);
    }
    if (tooltipDiv._mouseLeaveListener) {
        tooltipDiv.removeEventListener('mouseleave', tooltipDiv._mouseLeaveListener);
    }
    if (tooltipDiv._mouseEnterListener) {
        tooltipDiv.removeEventListener('mouseenter', tooltipDiv._mouseEnterListener);
    }

    // 现在 Tooltip 应该监听 .word 类，这个类也用于 Tooltip 的显示
    contentContainer.addEventListener('click', function(e) {
        const targetSpan = e.target.closest('.word'); // 寻找最近的 .word 元素
        if (targetSpan) {
            showTooltip(e, targetSpan);
        } else if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    });

    window._tooltipGlobalClickListener = (e) => {
        if (tooltipDiv.classList.contains('visible') &&
            !e.target.closest('.word') && // 确保点击的不是单词
            !e.target.closest('#react-tooltips')) {
            hideTooltip();
        }
    };
    document.addEventListener('click', window._tooltipGlobalClickListener);

    tooltipDiv._mouseLeaveListener = hideTooltip;
    tooltipDiv.addEventListener('mouseleave', tooltipDiv._mouseLeaveListener);

    tooltipDiv._mouseEnterListener = () => {
        clearTimeout(_currentHideTimeout);
    };
    tooltipDiv.addEventListener('mouseenter', tooltipDiv._mouseEnterListener);

    window._tooltipScrollListener = () => {
        if (tooltipDiv.classList.contains('visible')) {
            hideTooltip();
        }
    };
    document.addEventListener('scroll', window._tooltipScrollListener, { passive: true });

    async function showTooltip(e, clickedSpan) {
        clearTimeout(_currentHideTimeout);
        e.stopPropagation();

        if (_currentActiveTooltipSpan === clickedSpan) {
            hideTooltip();
            _currentActiveTooltipSpan = null;
            return;
        }

        _currentActiveTooltipSpan = clickedSpan;
        const tooltipId = clickedSpan.dataset.tooltipId;

        const data = _activeChapterTooltipsData[tooltipId];
        console.log('--- showTooltip Debug Info ---');
        console.log('Tooltip ID:', tooltipId);
        console.log('Fetched Tooltip Data:', data);

        if (data) {
            let htmlContent = '';
            // Adjust fieldsOrder to separate 'image' and 'imageDescription'
            const fieldsOrder = [
                'word', 'title', 'partOfSpeech', 'pronunciation', 'definition',
                'contextualMeaning', 'exampleSentence', 'videoLink',
                'image', // Image path itself
                'imageDescription', // Text description of the image
                'synonyms', 'antonyms', 'etymology',
                'category', 'source', 'lastUpdated'
            ];

            fieldsOrder.forEach(field => {
                const value = data[field];
                console.log(`Processing field: "${field}", Value:`, value); // Debug: log each field and its value

                // Only attempt to render if value is not empty or undefined
                if (value === undefined || value === null || value === '') {
                    console.log(`Field "${field}" is empty or not present, skipping.`);
                    return;
                }

                let formattedValue = Array.isArray(value) ? value.join(', ') : value;

                // --- Explicitly handle each field ---
                if (field === 'word' || field === 'title') {
                    htmlContent += `<p class="tooltip-title"><strong>${formattedValue}</strong></p>`;
                } else if (field === 'partOfSpeech') {
                    htmlContent += `<p class="tooltip-pos">(${formattedValue})</p>`;
                } else if (field === 'pronunciation') {
                    htmlContent += `<p class="tooltip-pronunciation">/${formattedValue}/</p>`;
                } else if (field === 'definition') {
                    htmlContent += `<p class="tooltip-definition">${formattedValue}</p>`;
                } else if (field === 'contextualMeaning') {
                    htmlContent += `<p class="tooltip-contextual-meaning">💡 Visual Sense: <em>${formattedValue}</em></p>`; // Changed prefix
                } else if (field === 'exampleSentence') {
                    htmlContent += `<p class="tooltip-example"><strong>example:</strong> ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'videoLink') {
                    const videoId = extractVideoId(formattedValue);
                    if (videoId) {
                         htmlContent += `<div class="tooltip-video-wrapper"><iframe src="https://www.youtube.com/embed/${videoId}?enablejsapi=1" frameborder="0" allowfullscreen></iframe></div>`;
                         console.log(`Rendered video for ${tooltipId} from: ${formattedValue}`);
                    } else {
                        console.warn(`Could not extract video ID from: ${formattedValue}`);
                    }
                } else if (field === 'image') { // NEW: Handle image path independently
                    htmlContent += `<img src="${formattedValue}" alt="Tooltip Image" class="tooltip-image">`;
                    console.log(`Rendered image for ${tooltipId} from: ${formattedValue}`);
                } else if (field === 'imageDescription') { // NEW: Handle image description independently
                    htmlContent += `<p class="tooltip-image-description-text"><strong>ImageDescription:</strong> ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'synonyms') {
                    htmlContent += `<p class="tooltip-synonyms"><strong>synonyms:</strong> ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'antonyms') {
                    htmlContent += `<p class="tooltip-antonyms"><strong>antonyms:</strong> ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'etymology') {
                    htmlContent += `<p class="tooltip-etymology">Etymology: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'category') {
                    htmlContent += `<p class="tooltip-category">Category: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'source') {
                    htmlContent += `<p class="tooltip-source">Source: ${formattedValue}</p>`; // Changed prefix
                } else if (field === 'lastUpdated') {
                    htmlContent += `<p class="tooltip-last-updated">Updated: ${formattedValue}</p>`; // Changed prefix
                } else {
                    // This block should rarely be triggered if all expected fields are handled
                    console.warn(`Unhandled field encountered: "${field}" with value: "${value}". Please add a specific handler for it.`);
                    htmlContent += `<p class="tooltip-unhandled-field"><strong>${field.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${formattedValue}</p>`;
                }
            });

            if (!htmlContent) {
                htmlContent = `<p>No detailed information available for "${tooltipId}".</p>`;
            }

            tooltipDiv.innerHTML = htmlContent;
            tooltipDiv.style.display = 'block';
            tooltipDiv.classList.add('visible');

            // Positioning logic remains unchanged
            const spanRect = clickedSpan.getBoundingClientRect();
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;

            let left = spanRect.left + scrollX + (spanRect.width / 2) - (tooltipDiv.offsetWidth / 2);
            let top = spanRect.top + scrollY - tooltipDiv.offsetHeight - 10;

            if (left < scrollX + 10) left = scrollX + 10;
            if (left + tooltipDiv.offsetWidth > scrollX + viewportWidth - 10) left = scrollX + viewportWidth - tooltipDiv.offsetWidth - 10;
            if (top < scrollY + 10) top = spanRect.bottom + scrollY + 10;

            tooltipDiv.style.left = `${left}px`;
            tooltipDiv.style.top = `${top}px`;

        } else {
            console.warn(`Tooltip data not found for ID: ${tooltipId}. Current active data:`, _activeChapterTooltipsData);
            hideTooltip();
        }
        console.log('--- showTooltip Debug End ---');
    }

    function hideTooltip() {
        clearTimeout(_currentHideTimeout);
        _currentHideTimeout = setTimeout(() => {
            tooltipDiv.classList.remove('visible');
            setTimeout(() => {
                tooltipDiv.style.display = 'none';
                _currentActiveTooltipSpan = null;
            }, 300); // Matches CSS transition time
        }, 100); // Delay hide to allow user to move mouse to tooltip
    }

    // Helper function: Extracts video ID from YouTube URL
    function extractVideoId(url) {
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|\?(?:v=)|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regExp);
        return (match && match[1]) ? match[1] : null;
    }
}

let _activeChapterTooltipsData = {}; // Stores tooltip data for the current chapter

export function updateActiveChapterTooltips(tooltipsData) {
    _activeChapterTooltipsData = tooltipsData || {};
    console.log("Tooltip module: Active tooltip data updated.", _activeChapterTooltipsData);
}
