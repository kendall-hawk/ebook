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
// Import updateActiveChapterTooltips to update tooltip module's data
import { setupTooltips, updateActiveChapterTooltips } from './tooltip.js'; 
import { getWordFrequencies } from './wordFrequency.js';
// ✨ New: Import the audioPlayer.js module
import { initAudioPlayer } from './audio/audioPlayer.js'; 

let allChapterIndexData = [];
let currentFilterCategory = 'all';

document.addEventListener('DOMContentLoaded', async () => {
    // Initial setup: The audio player will be dynamically created by initAudioPlayer
    // when a chapter is loaded. Its initial state and display are handled within audioPlayer.js,
    // and its visibility is managed in handleChapterClick and showTocPage.

    allChapterIndexData = await loadChapterIndex(); // Load all chapter index data

    if (allChapterIndexData.length === 0) {
        console.error('Chapter index is empty, cannot render.');
        document.getElementById('toc').innerHTML = '<p style="text-align: center; padding: 50px; color: #666;">No articles found.</p>';
        return;
    }

    // --- Word Frequency Calculation Optimization: Calculate once after loading all chapters ---
    const allParagraphs = [];
    const chapterContentsPromises = allChapterIndexData.map(async (chMeta) => {
        const chapterData = await loadSingleChapterContent(chMeta.file);
        if (chapterData && chapterData.paragraphs) {
            chapterData.paragraphs.forEach(p => {
                if (typeof p === 'string') {
                    allParagraphs.push(p);
                }
            });
        }
    });
    // Wait for all chapter content to be loaded
    await Promise.all(chapterContentsPromises);


    // --- Collect all Tooltip words (from [[word|id]] and data/chapters/N-tooltips.json) as protected words ---
    const protectedWordsForFrequency = new Set();
    for (const chapterMeta of allChapterIndexData) {
        const chapterId = chapterMeta.id; // e.g., 'chap-01'
        const tooltipFilePath = `chapters/${chapterId}-tooltips.json`; // Assumed conventional path

        try {
            const res = await fetch(`data/${tooltipFilePath}`);
            if (res.ok) {
                const chapterTooltips = await res.json();
                for (const tooltipId in chapterTooltips) {
                    if (Object.hasOwnProperty.call(chapterTooltips, tooltipId)) {
                        const tooltipEntry = chapterTooltips[tooltipId];
                        // Add the `word` field from Tooltip data to the protected words list (if it exists)
                        if (tooltipEntry.word) {
                            protectedWordsForFrequency.add(tooltipEntry.word.toLowerCase());
                        }
                        // If tooltipId itself is a meaningful word, also consider adding it
                        // protectedWordsForFrequency.add(tooltipId.split('-')[0].toLowerCase()); // e.g., 'invention-noun' -> 'invention'
                    }
                }
            } else {
                console.warn(`Chapter Tooltip data not found or could not be loaded: ${tooltipFilePath}. Status: ${res.status}`);
            }
        } catch (error) {
            console.error(`Failed to load chapter Tooltip data (${tooltipFilePath}):`, error);
        }
    }

    const { wordFrequenciesMap, maxFreq } = getWordFrequencies(allParagraphs, undefined, protectedWordsForFrequency);
    setGlobalWordFrequencies(wordFrequenciesMap, maxFreq);

    console.log('--- Word Frequency Calculation Results (main.js) ---');
    console.log('Global Word Frequency Map:', getGlobalWordFrequenciesMap());
    console.log('Global Max Frequency:', getGlobalMaxFreq());
    console.log('Protected Tooltip Words (for frequency calculation):', protectedWordsForFrequency);
    console.log('--- Word Frequency Calculation End ---');

    const categories = new Set();
    allChapterIndexData.forEach(ch => {
        if (Array.isArray(ch.categories)) {
            ch.categories.forEach(cat => categories.add(cat));
        }
    });
    renderCategoryNavigation(Array.from(categories));

    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);

    // **Important: Set up Tooltip event listeners when the page first loads**
    setupTooltips(); // Tooltip event listeners only need to be set up once

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


function renderCategoryNavigation(categories) {
    const categoryNav = document.getElementById('category-nav');
    if (!categoryNav) return;

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

    categoryNav.querySelectorAll('.category-button').forEach(btn => {
        if (btn.dataset.category === currentFilterCategory) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    categoryNav.querySelectorAll('.category-button').forEach(button => {
        button.addEventListener('click', () => {
            const selectedCategory = button.dataset.category;
            currentFilterCategory = selectedCategory;

            categoryNav.querySelectorAll('.category-button').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
            showTocPage();
            window.location.hash = '';
        });
    });
}


function showTocPage() {
    document.getElementById('chapters').style.display = 'none';
    document.getElementById('toc').style.display = 'grid';
    document.getElementById('category-nav').style.display = 'flex';
    // When returning to the table of contents page, hide the audio player if it was loaded
    const audioPlayerElement = document.querySelector('audio');
    if (audioPlayerElement) {
        audioPlayerElement.style.display = 'none';
        audioPlayerElement.pause(); // Pause playback
    }
    renderChapterToc(allChapterIndexData, handleChapterClick, currentFilterCategory);
}

/**
 * Callback function to handle chapter clicks.
 * @param {string} chapterId - The ID of the clicked chapter. If empty, it means returning to the home page.
 * @param {string} filePath - The file path of the clicked chapter.
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

    // --- New: Load current chapter's Tooltip data ---
    let currentChapterTooltips = {};
    const chapterTooltipFilePath = `chapters/${chapterId}-tooltips.json`; // Build Tooltip file path based on chapter ID
    try {
        const res = await fetch(`data/${chapterTooltipFilePath}`);
        if (res.ok) {
            currentChapterTooltips = await res.json();
            console.log(`Loaded Tooltip data for chapter ${chapterId}:`, currentChapterTooltips);
        } else {
            // If the file doesn't exist, it might mean this chapter has no custom Tooltips, which is not an error
            console.warn(`No dedicated Tooltip data for chapter ${chapterId} (${chapterTooltipFilePath}). Status: ${res.status}`);
        }
    } catch (error) {
        console.error(`Failed to load Tooltip data for chapter ${chapterId}:`, error);
    }
    // --- End new ---


    if (chapterContent) {
        // ✨ Key fix: Update current chapter data inside the Tooltip module BEFORE rendering chapter content ✨
        // Ensure tooltip.js can access current chapter's tooltip details when a word is clicked
        updateActiveChapterTooltips(currentChapterTooltips); 

        renderSingleChapterContent(
            chapterContent,
            currentChapterTooltips, // Pass chapter-specific Tooltip data to the renderer
            getGlobalWordFrequenciesMap(),
            getGlobalMaxFreq(),
            handleChapterClick
        );

        window.location.hash = chapterId;
        document.getElementById('chapters').scrollIntoView({ behavior: 'smooth' });

        // ✨ Key Change: Initialize the audio player here ✨
        // Get the Google Drive file ID corresponding to the current chapter
        // **VERY IMPORTANT: You must ensure that each chapter in chapters.json includes a 'googleDriveAudioId' field.**
        const currentGoogleDriveFileId = allChapterIndexData.find(ch => ch.id === chapterId)?.googleDriveAudioId;

        if (!currentGoogleDriveFileId) {
            console.error(`Google Drive audio file ID not found for chapter ${chapterId}, cannot initialize audio player.`);
            // If audio is missing, consider hiding the player
            const audioPlayerElement = document.querySelector('audio');
            if (audioPlayerElement) {
                audioPlayerElement.style.display = 'none';
                audioPlayerElement.pause();
            }
            return; // Stop execution, do not load audio
        }

        const networkAudioUrl = `https://docs.google.com/uc?export=download&id=${currentGoogleDriveFileId}`; 
        const localSrtPath = `data/chapters/srt/${chapterId}.srt`; 

        initAudioPlayer({
            audioSrc: networkAudioUrl,
            srtSrc: localSrtPath
        });

        // Ensure the audio player is visible when the chapter loads
        const audioPlayerElement = document.querySelector('audio');
        if (audioPlayerElement) {
            audioPlayerElement.style.display = 'block';
        }

    } else {
        alert('Could not load chapter content!');
        showTocPage();
        window.location.hash = '';
    }
}

// Listen for URL hash changes to enable navigation with browser back/forward buttons
window.addEventListener('hashchange', async () => {
    const chapterId = window.location.hash.substring(1);
    if (chapterId) {
        const chapterMeta = allChapterIndexData.find(ch => ch.id === chapterId);
        if (chapterMeta) {
            const currentDisplayedChapterElement = document.getElementById('chapters');
            // Get the ID of the currently displayed chapter title to avoid reloading the same chapter
            const currentDisplayedChapterTitleElement = currentDisplayedChapterElement.querySelector('h2');
            const currentDisplayedChapterId = currentDisplayedChapterTitleElement ? currentDisplayedChapterTitleElement.id : null;

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
