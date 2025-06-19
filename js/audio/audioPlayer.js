/**
 * js/audio/audioPlayer.js (音频播放器)
 * 负责音频播放、时间同步、字幕高亮。
 */

import { parseSRT } from '../utils.js'; // 确保正确导入 parseSRT

const audioPlayerContainer = document.getElementById('audio-player-container');
const mainAudioPlayer = document.getElementById('main-audio-player');
const playbackSpeedBtn = document.getElementById('playback-speed-btn');

let currentSrtData = [];
let currentSubtitleIndex = -1;
let currentPlaybackSpeedIndex = 0;
const playbackSpeeds = [1.0, 1.25, 1.5, 1.75, 2.0]; // 播放速度选项

/**
 * 初始化音频播放器并加载 SRT。
 * @param {Object} options - 配置选项。
 * @param {string} options.audioSrc - 音频文件路径。
 * @param {string} options.srtSrc - SRT 文件路径。
 */
export async function initAudioPlayer({ audioSrc, srtSrc }) {
    if (!mainAudioPlayer || !audioPlayerContainer) {
        console.error("Audio player elements not found.");
        return;
    }

    // 显示播放器
    audioPlayerContainer.style.display = 'flex'; // 或者 'block'，取决于你的CSS

    // 移除之前的事件监听器以避免重复绑定
    mainAudioPlayer.removeEventListener('timeupdate', handleTimeUpdate);
    playbackSpeedBtn.removeEventListener('click', togglePlaybackSpeed);

    // 重置播放器状态
    mainAudioPlayer.src = audioSrc;
    mainAudioPlayer.currentTime = 0;
    mainAudioPlayer.playbackRate = playbackSpeeds[currentPlaybackSpeedIndex];
    playbackSpeedBtn.textContent = `${playbackSpeeds[currentPlaybackSpeedIndex]}x`;
    currentSubtitleIndex = -1;
    highlightSubtitle(-1); // 清除所有高亮

    try {
        const srtResponse = await fetch(srtSrc);
        if (!srtResponse.ok) {
            throw new Error(`Failed to load SRT: ${srtResponse.statusText}`);
        }
        const srtText = await srtResponse.text();
        currentSrtData = parseSRT(srtText);
        console.log("SRT loaded and parsed:", currentSrtData);
    } catch (error) {
        console.error("Error loading or parsing SRT:", error);
        currentSrtData = []; // 清空数据，避免后续错误
    }

    // 绑定事件监听器
    mainAudioPlayer.addEventListener('timeupdate', handleTimeUpdate);
    playbackSpeedBtn.addEventListener('click', togglePlaybackSpeed);
}

/**
 * 清理音频播放器并隐藏。
 */
export function cleanupAudioPlayer() {
    if (mainAudioPlayer) {
        mainAudioPlayer.pause();
        mainAudioPlayer.src = ''; // 清空 src
        mainAudioPlayer.load(); // 强制加载，释放资源
        mainAudioPlayer.removeEventListener('timeupdate', handleTimeUpdate);
    }
    if (playbackSpeedBtn) {
        playbackSpeedBtn.removeEventListener('click', togglePlaybackSpeed);
    }
    if (audioPlayerContainer) {
        audioPlayerContainer.style.display = 'none'; // 隐藏播放器
    }
    currentSrtData = [];
    currentSubtitleIndex = -1;
    highlightSubtitle(-1); // 确保所有高亮被清除
}

/**
 * 处理音频时间更新事件。
 */
function handleTimeUpdate() {
    const currentTime = mainAudioPlayer.currentTime;
    //console.log("Current Time:", currentTime);

    // 查找当前应该高亮的字幕
    let newSubtitleIndex = -1;
    for (let i = 0; i < currentSrtData.length; i++) {
        const subtitle = currentSrtData[i];
        if (currentTime >= subtitle.start && currentTime < subtitle.end) {
            newSubtitleIndex = i;
            break;
        }
    }

    if (newSubtitleIndex !== currentSubtitleIndex) {
        currentSubtitleIndex = newSubtitleIndex;
        highlightSubtitle(currentSubtitleIndex);
    }
}

/**
 * 高亮当前字幕。
 * @param {number} index - 当前字幕在 `currentSrtData` 数组中的索引。
 */
function highlightSubtitle(index) {
    // 移除所有现有高亮
    document.querySelectorAll('.subtitle-segment.active-subtitle').forEach(el => {
        el.classList.remove('active-subtitle');
    });

    if (index === -1 || !currentSrtData[index]) {
        return; // 没有需要高亮的字幕
    }

    const subtitleIdToHighlight = currentSrtData[index].id;
    // 使用 querySelector 查找所有 chapter-content 内部的字幕片段
    const chapterContentBody = document.getElementById('chapter-content-body');
    const targetElement = chapterContentBody ? chapterContentBody.querySelector(`.subtitle-segment[data-subtitle-id="${subtitleIdToHighlight}"]`) : null;


    if (targetElement) {
        targetElement.classList.add('active-subtitle');

        // 滚动到视图，确保高亮字幕可见
        // 只有当元素不在当前视口内时才滚动
        const rect = targetElement.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth) {
            // 使用 behavior: 'smooth' 可能会导致字幕快速切换时闪烁，
            // 对于实时高亮，'auto' 更合适，或者只在必要时才平滑滚动。
            targetElement.scrollIntoView({ behavior: 'auto', block: 'center' });
        }
    }
}

/**
 * 切换播放速度。
 */
function togglePlaybackSpeed() {
    currentPlaybackSpeedIndex = (currentPlaybackSpeedIndex + 1) % playbackSpeeds.length;
    const newSpeed = playbackSpeeds[currentPlaybackSpeedIndex];
    mainAudioPlayer.playbackRate = newSpeed;
    playbackSpeedBtn.textContent = `${newSpeed}x`;
    console.log(`Playback speed set to: ${newSpeed}x`);
}
