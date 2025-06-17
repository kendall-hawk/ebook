// js/audio/audioPlayer.js (Jaro-Winkler 弹性匹配版)
import { parseSRT } from './srtParser.js';
import { tokenizeText } from './tokenizer.js';

let audio, subtitleData = [];
let allContentTextNodes = []; // 存储所有可搜索的文本节点

/**
 * Initializes the audio player, creates the audio element, and loads subtitles.
 * @param {string} audioSrc - Path to the audio file.
 * @param {string} srtSrc - Path to the SRT subtitle file.
 * @param {Array<Object>} [initialSubtitleData] - Optional: If subtitle data is already loaded, it can be passed directly.
 */
export async function initAudioPlayer({ audioSrc, srtSrc, initialSubtitleData = null }) {
  // Remove existing audio player (if any) to prevent duplication
  const existingAudio = document.querySelector('audio');
  if (existingAudio) {
    existingAudio.remove();
  }

  audio = document.createElement('audio');
  Object.assign(audio, {
    src: audioSrc,
    controls: true,
    style: 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:9999;width:90%;max-width:600px;',
  });
  document.body.appendChild(audio);

  // Use provided subtitle data if available, otherwise load and parse
  if (initialSubtitleData && initialSubtitleData.length > 0) {
    subtitleData = initialSubtitleData;
  } else {
    try {
      const res = await fetch(srtSrc);
      const srtText = await res.text();
      subtitleData = parseSRT(srtText);
    } catch (error) {
      console.error('Failed to load or parse SRT:', error);
      return;
    }
  }

  // Bind click event to document.body to handle user clicks for seeking
  document.body.addEventListener('click', handleWordClick);

  // Collect all text nodes within the #chapters container for highlighting and click lookup
  allContentTextNodes = [];
  const chapterContainer = document.getElementById('chapters');
  if (chapterContainer) {
    const walker = document.createTreeWalker(chapterContainer, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      // Filter out empty or whitespace-only text nodes
      if (node.nodeValue && node.nodeValue.trim().length > 0) {
          allContentTextNodes.push(node);
      }
    }
  }

  let lastIndex = null;
  audio.addEventListener('timeupdate', () => {
    const currentTime = audio.currentTime;
    const index = subtitleData.findIndex(
      (sub, i) => currentTime >= sub.start && (i === subtitleData.length - 1 || currentTime < subtitleData[i + 1].start)
    );
    if (index !== -1 && index !== lastIndex) {
      lastIndex = index;
      clearAllHighlights();
      const { text } = subtitleData[index];
      // Highlight the text corresponding to the current subtitle
      const highlightedElement = findAndHighlightTextInChapterContent(text);
      if (highlightedElement) {
        requestAnimationFrame(() => highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
    }
  });

  console.log('Audio player initialized.');
}

function handleWordClick(e) {
    // Find text content near the click position
    const clickedElement = e.target;
    const { textContent: clickedTextSnippet, containerElement } = findTextElementNearCoords(e.clientX, e.clientY, clickedElement);

    if (!clickedTextSnippet || clickedTextSnippet.trim().length < 5) { // At least 5 characters to avoid clicking whitespace or single characters
        return;
    }

    // Find the best matching subtitle in the SRT data for the clicked text snippet
    const bestMatchIndex = findBestSubtitleMatch(clickedTextSnippet, containerElement);

    if (bestMatchIndex !== null) {
        const { start, text: matchedSubtitleText } = subtitleData[bestMatchIndex];
        audio.currentTime = start;
        audio.play();

        clearAllHighlights();
        // Re-highlight the matched subtitle text to ensure the user sees the highlight after seeking
        const highlightedElement = findAndHighlightTextInChapterContent(matchedSubtitleText);
        if (highlightedElement) {
            highlightedElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        // If no good match is found, do nothing
        // console.log("No good subtitle match found for clicked text:", clickedTextSnippet);
    }
}

/**
 * Finds a text-containing element near the given coordinates and extracts its content.
 * @param {number} clientX - X-coordinate of the click event.
 * @param {number} clientY - Y-coordinate of the click event.
 * @param {HTMLElement} clickedElement - The actual DOM element that was clicked.
 * @returns {{textContent: string, containerElement: HTMLElement}} - Extracted text content and the containing element.
 */
function findTextElementNearCoords(clientX, clientY, clickedElement) {
    let currentElement = clickedElement;
    let textToAnalyze = '';
    let container = null;

    // Try to find a suitable text container (e.g., P or DIV tag) by traversing up from the clicked element
    while (currentElement && currentElement !== document.body) {
        // Only consider elements that are likely to contain meaningful text blocks
        if (currentElement.nodeType === Node.ELEMENT_NODE && ['P', 'DIV', 'SPAN', 'H1', 'H2', 'H3', 'LI'].includes(currentElement.tagName)) {
            textToAnalyze = currentElement.textContent || '';
            container = currentElement;
            // If text is long enough or we found a block-level element, stop searching up
            if (textToAnalyze.length > 50 || ['P', 'DIV'].includes(currentElement.tagName)) {
                break;
            }
        }
        currentElement = currentElement.parentNode;
    }

    // Fallback: If no suitable container found or text is too short, try to extract from text node directly
    if (!container || textToAnalyze.length < 5) {
        const range = document.caretRangeFromPoint(clientX, clientY);
        if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = range.startContainer;
            const fullText = textNode.nodeValue || '';
            const start = Math.max(0, range.startOffset - 20); // Get 20 characters before click
            const end = Math.min(fullText.length, range.startOffset + 80); // Get 80 characters after click
            textToAnalyze = fullText.substring(start, end);
            container = textNode.parentNode; // Parent element of the text node
        } else {
             textToAnalyze = clickedElement.textContent || ''; // Final fallback to the clicked element's text
             container = clickedElement;
        }
    }

    return { textContent: textToAnalyze.trim(), containerElement: container };
}

/**
 * Finds the most similar subtitle entry in the SRT data for a given text snippet.
 * Uses Jaro-Winkler similarity for more flexible matching.
 * @param {string} clickedTextSnippet - Text snippet extracted from the user's click position.
 * @param {HTMLElement} clickedTextContainer - The DOM container element of the clicked text.
 * @returns {number|null} - Index of the best matching subtitle, or null if no good match is found.
 */
function findBestSubtitleMatch(clickedTextSnippet, clickedTextContainer) {
    if (!clickedTextSnippet || subtitleData.length === 0) {
        return null;
    }

    const clickedTextLower = clickedTextSnippet.toLowerCase();
    let bestIndex = null;
    let highestScore = -Infinity;
    const clickedElementRect = clickedTextContainer ? clickedTextContainer.getBoundingClientRect() : null;
    const clickedElementTop = clickedElementRect ? clickedElementRect.top + window.scrollY : null;

    for (let i = 0; i < subtitleData.length; i++) {
        const subtitle = subtitleData[i];
        const subtitleTextLower = subtitle.text.toLowerCase();

        // 1. Text Similarity (using Jaro-Winkler)
        const textSimilarity = computeJaroWinklerSimilarity(clickedTextLower, subtitleTextLower);

        // If similarity is too low, skip directly (threshold can be adjusted)
        if (textSimilarity < 0.6) continue; // Jaro-Winkler scores are generally higher, so threshold is higher

        // 2. Spatial Proximity (based on subtitle rendering position on the page)
        let proximityScore = 0;
        if (clickedElementTop !== null) {
            // Find the closest DOM element containing the current SRT subtitle text for proximity calculation
            const subtitleDomElement = findDomElementForSubtitleText(subtitle.text);
            if (subtitleDomElement) {
                const subtitleDomRect = subtitleDomElement.getBoundingClientRect();
                const subtitleDomTop = subtitleDomRect.top + window.scrollY;
                const distance = Math.abs(subtitleDomTop - clickedElementTop);
                const maxDist = window.innerHeight * 2; // Consider two screen heights as max distance
                proximityScore = 1 - Math.min(distance / maxDist, 1);
            }
        } else {
            // If cannot get offsetTop of clicked element (e.g., clicked non-text element), rely only on text similarity
            proximityScore = 0.5; // Assign a medium value, indicating unknown position
        }

        // Combined score: Text similarity weighted higher
        const combinedScore = textSimilarity * 0.7 + proximityScore * 0.3; // Weights can be fine-tuned

        if (combinedScore > highestScore) {
            highestScore = combinedScore;
            bestIndex = i;
        }
    }
    
    // If the highest score is below a certain threshold, consider no good match found
    if (highestScore < 0.65) { // Adjusted threshold for Jaro-Winkler
        return null;
    }

    return bestIndex;
}

/**
 * Finds a DOM element that contains the specified SRT text.
 * Used for calculating spatial proximity. This can be a relatively expensive operation.
 * @param {string} srtText - The original text of the SRT subtitle.
 * @returns {HTMLElement|null} - The found DOM element containing the text.
 */
function findDomElementForSubtitleText(srtText) {
    const srtTextLower = srtText.toLowerCase();
    // Iterate through all searchable text nodes to find the first parent element containing the SRT text
    for (const textNode of allContentTextNodes) {
        if (textNode.nodeValue && textNode.nodeValue.toLowerCase().includes(srtTextLower)) {
            // Return the parent element of the text node, usually a <p>, <span>, or <div>
            return textNode.parentNode;
        }
    }
    return null;
}

/**
 * Clears all currently highlighted text elements.
 */
function clearAllHighlights() {
  document.querySelectorAll('.highlighted').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      // Check if el.firstChild exists to prevent issues if the element is already emptied
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
      // parent.normalize() merges adjacent text nodes, important for clean highlight removal
      parent.normalize();
    }
  });
}

/**
 * Finds and highlights the specified text within the entire chapter content.
 * Returns the outermost element that was highlighted (typically a <p> or <div>).
 * @param {string} targetText - The subtitle text to find and highlight.
 * @returns {HTMLElement|null} - The nearest ancestor element containing the highlighted text, or null if not found and highlighted.
 */
function findAndHighlightTextInChapterContent(targetText) {
  const targetLower = targetText.trim().toLowerCase();

  // Iterate through all searchable text nodes
  for (const textNode of allContentTextNodes) {
    const text = textNode.nodeValue;
    // Avoid highlighting already highlighted areas or inside them
    if (textNode.parentNode?.classList.contains('highlighted')) {
      continue;
    }

    const index = text.toLowerCase().indexOf(targetLower);
    if (index !== -1) {
      const range = document.createRange();
      try {
        range.setStart(textNode, index);
        range.setEnd(textNode, index + targetLower.length);
        const span = document.createElement('span');
        span.className = 'highlighted'; // 'highlighted' class for audio playback highlighting
        range.surroundContents(span);

        // Find the nearest paragraph or block-level element for scrolling
        let currentParent = span.parentNode;
        while (currentParent && currentParent !== document.getElementById('chapters') && !['P', 'DIV', 'H1', 'H2', 'H3'].includes(currentParent.tagName)) {
             currentParent = currentParent.parentNode;
        }
        return currentParent;
      } catch (e) {
        console.warn('Highlighting failed:', e, 'Text:', targetText, 'Node:', textNode);
        return null;
      }
    }
  }
  return null; // Text not found
}

/**
 * Computes the Jaro-Winkler similarity between two strings.
 * Values range from 0 to 1, where 1 means identical strings.
 * @param {string} s1 - String 1.
 * @param {string} s2 - String 2.
 * @returns {number} The Jaro-Winkler similarity score.
 */
function computeJaroWinklerSimilarity(s1, s2) {
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    const n1 = s1.length;
    const n2 = s2.length;
    if (n1 === 0 || n2 === 0) return 0.0;

    const matchWindow = Math.floor(Math.max(n1, n2) / 2) - 1;
    const s1Matches = new Array(n1).fill(false);
    const s2Matches = new Array(n2).fill(false);
    let numMatches = 0;

    for (let i = 0; i < n1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, n2);
        for (let j = start; j < end; j++) {
            if (!s2Matches[j] && s1[i] === s2[j]) {
                s1Matches[i] = true;
                s2Matches[j] = true;
                numMatches++;
                break;
            }
        }
    }

    if (numMatches === 0) return 0.0;

    let k = 0;
    let numTranspositions = 0;
    for (let i = 0; i < n1; i++) {
        if (s1Matches[i]) {
            while (!s2Matches[k]) k++;
            if (s1[i] !== s2[k]) {
                numTranspositions++;
            }
            k++;
        }
    }
    const jaro = (numMatches / n1 + numMatches / n2 + (numMatches - numTranspositions / 2) / numMatches) / 3;

    // Winkler modification
    const prefixLength = Math.min(4, n1, n2); // Max prefix length to consider is 4
    let commonPrefix = 0;
    for (let i = 0; i < prefixLength; i++) {
        if (s1[i] === s2[i]) {
            commonPrefix++;
        } else {
            break;
        }
    }

    const p = 0.1; // Scaling factor for the common prefix. Usually 0.1
    return jaro + commonPrefix * p * (1 - jaro);
}
