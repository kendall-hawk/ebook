/**
 * js/youtube.js (YouTube 视频处理)
 * 负责嵌入 YouTube 视频并实现浮动播放器功能。
 */

const floatingPlayer = document.getElementById('floating-youtube-player');
let currentEmbeddedPlayer = null; // 用于存储当前的 iframe 元素

/**
 * 设置浮动 YouTube 播放器功能。
 * 遍历所有章节内容中的 YouTube 视频，当视频滚动出视口时，
 * 将其移动到浮动播放器中。
 */
export function setupFloatingYouTube() {
    // 清理之前的浮动播放器内容
    if (currentEmbeddedPlayer) {
        currentEmbeddedPlayer.remove();
        currentEmbeddedPlayer = null;
    }
    if (floatingPlayer) {
        floatingPlayer.style.display = 'none';
        floatingPlayer.innerHTML = '';
    }

    // 确保只选择当前章节内容内的 iframe
    const chapterContentBody = document.getElementById('chapter-content-body');
    if (!chapterContentBody) {
        console.warn("Chapter content body not found for YouTube setup.");
        return;
    }
    // 寻找 chapter-content-body 内部的 YouTube iframe
    const videoContainers = chapterContentBody.querySelectorAll('.video-container iframe[src*="youtube.com/embed/"]');

    videoContainers.forEach(iframe => {
        // 为每个 iframe 绑定一个滚动监听器
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    // 视频滚动出视口
                    if (entry.target.isConnected) { // 确保元素仍在DOM中
                        makeVideoFloating(entry.target);
                    }
                } else {
                    // 视频进入视口
                    if (entry.target.dataset.floating === 'true') {
                        // 如果视频正在浮动且回到其原始位置，则取消浮动
                        stopFloating(entry.target);
                    }
                }
            });
        }, { threshold: 0 }); // 0 表示只要有一个像素离开视口就触发

        observer.observe(iframe);

        // 如果用户点击视频内部，且播放器不是浮动的，我们可能不想立即浮动
        iframe.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止事件冒泡到文档
            // 如果视频不是浮动的，并且正在播放，可以考虑不立即浮动
            // 这需要 YouTube IFrame Player API 来获取播放状态，这里简化处理
        });
    });
}

/**
 * 将视频移动到浮动播放器。
 * @param {HTMLIFrameElement} iframe - 原始视频的 iframe 元素。
 */
function makeVideoFloating(iframe) {
    if (!floatingPlayer || iframe.dataset.floating === 'true') {
        return; // 已经浮动了，或者没有浮动播放器
    }

    // 克隆 iframe 防止 DOM 移动问题
    const clonedIframe = iframe.cloneNode(true);
    clonedIframe.dataset.floating = 'true'; // 标记为浮动状态

    // 隐藏原始 iframe
    iframe.style.visibility = 'hidden';
    iframe.dataset.originalParentId = iframe.parentNode.id || ''; // 存储原始父级的ID，如果需要恢复

    // 清理浮动播放器中可能已有的内容
    floatingPlayer.innerHTML = '';
    floatingPlayer.appendChild(clonedIframe);
    floatingPlayer.style.display = 'block';

    currentEmbeddedPlayer = clonedIframe; // 记录当前浮动的播放器
    console.log('Video is now floating.');
}

/**
 * 停止浮动播放，将视频移回原始位置。
 * @param {HTMLIFrameElement} iframe - 浮动中的 iframe 元素。
 */
function stopFloating(iframe) {
    if (!floatingPlayer || iframe.dataset.floating !== 'true') {
        return; // 不在浮动状态
    }

    floatingPlayer.innerHTML = '';
    floatingPlayer.style.display = 'none';

    // 找到原始 iframe 并显示它
    // 注意：通过 src 查找可能不唯一，更好的方式是存储一个唯一 ID
    const originalIframe = document.querySelector(`iframe[src="${iframe.src}"]:not([data-floating="true"])`);
    if (originalIframe) {
        originalIframe.style.visibility = 'visible';
    }

    iframe.dataset.floating = 'false'; // 移除浮动标记
    currentEmbeddedPlayer = null; // 清空当前浮动播放器引用
    console.log('Video stopped floating.');
}

/**
 * 设置 YouTube 视频的自动暂停功能。
 * 当页面上的任何 YouTube 视频在用户滚动时被隐藏，自动暂停播放。
 * （注意：这需要 YouTube IFrame Player API 来实现精确控制，这里是简化版）
 */
export function setupVideoAutoPause() {
    // 监听所有 iframe 元素的滚动状态
    // 这是一个简化版本，理想情况需要 YouTube IFrame Player API
    // 来监听播放状态并调用 player.pauseVideo()
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const iframe = entry.target;
            // 确保是 YouTube 嵌入视频
            if (iframe.tagName === 'IFRAME' && iframe.src.includes('youtube.com/embed/')) {
                if (!entry.isIntersecting && !iframe.dataset.floating) {
                    // 如果视频不在视口内且不是浮动的，尝试暂停它
                    // 仅通过重新加载 src 来暂停是粗暴的方法，会导致播放器重置
                    // 理想情况应使用 YouTube IFrame Player API: player.pauseVideo();
                    // 这里只是发送一个通用的 postMessage，不保证所有浏览器和 API 版本都支持
                    iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                    console.log('Attempting to pause YouTube video:', iframe.src);
                }
            }
        });
    }, { threshold: 0 });

    // 初始时观察所有存在的 iframe (在 chapterRenderer 渲染内容后，需要重新调用 setupFloatingYouTube 来观察新的 iframe)
    // 这里我们只观察最初加载的 iframe。在加载新章节时，setupFloatingYouTube 会重新设置观察器。
    // 所以这段代码在 initial setup 时可能不会找到任何 iframe，会在章节加载后生效。
    document.querySelectorAll('iframe[src*="youtube.com/embed/"]').forEach(iframe => {
        observer.observe(iframe);
    });
}
