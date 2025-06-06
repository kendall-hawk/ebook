// 1. 工具提示加载与初始化
async function loadTooltips() {
  return {}; // 示例
}
async function loadChapters() {
  return []; // 示例
}
function setupTooltips(tooltips) {
  // 初始化提示逻辑
}

// 2. 视频自动暂停和悬浮播放整合
function setupVideoAutoPause() {
  const videos = Array.from(document.querySelectorAll('video')).filter(
    v => !v.closest('.floating-video-container') // 防止 clone 视频被误处理
  );

  videos.forEach(video => {
    video.__hasFloating = false; // 初始状态

    video.addEventListener('timeupdate', () => {
      const rect = video.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (!isVisible && !video.paused && !video.__hasFloating) {
        createFloatingVideo(video);
        video.pause();
        video.__hasFloating = true;
      } else if (isVisible && video.__hasFloating) {
        removeFloatingVideo(video);
        video.play(); // 可选：自动恢复播放
      }
    });
  });
}

// 3. 悬浮视频操作
const floatingVideosMap = new Map(); // 原视频 -> 悬浮容器

function createFloatingVideo(originalVideo) {
  if (floatingVideosMap.has(originalVideo)) return;

  const floatingContainer = document.createElement('div');
  floatingContainer.className = 'floating-video-container';
  Object.assign(floatingContainer.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '300px',
    height: '168px',
    background: '#000',
    zIndex: 9999,
    borderRadius: '8px',
    overflow: 'hidden',
    cursor: 'move',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });

  const clonedVideo = originalVideo.cloneNode(true);
  clonedVideo.style.width = '100%';
  clonedVideo.style.height = '100%';
  clonedVideo.muted = true;

  clonedVideo.addEventListener('loadedmetadata', () => {
    clonedVideo.currentTime = originalVideo.currentTime;
    clonedVideo.play(); // 等待 loadedmetadata 后播放
  });

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  Object.assign(closeBtn.style, {
    position: 'absolute',
    top: '5px',
    right: '5px',
    background: 'rgba(0,0,0,0.5)',
    color: 'white',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    borderRadius: '50%',
    width: '28px',
    height: '28px',
    lineHeight: '28px',
    textAlign: 'center'
  });
  closeBtn.addEventListener('click', () => {
    removeFloatingVideo(originalVideo);
    originalVideo.play(); // 可选：恢复原视频播放
  });

  // 放大按钮
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '⬜';
  Object.assign(expandBtn.style, {
    position: 'absolute',
    top: '5px',
    right: '40px',
    background: 'rgba(0,0,0,0.5)',
    color: 'white',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    borderRadius: '4px',
    width: '28px',
    height: '28px'
  });

  let isExpanded = false;
  expandBtn.addEventListener('click', () => {
    if (!isExpanded) {
      floatingContainer.style.width = '600px';
      floatingContainer.style.height = '338px';
      isExpanded = true;
    } else {
      floatingContainer.style.width = '300px';
      floatingContainer.style.height = '168px';
      isExpanded = false;
    }
  });

  // 拖拽功能（鼠标拖动容器）
  let isDragging = false;
  let dragStartX, dragStartY;
  floatingContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX - floatingContainer.offsetLeft;
    dragStartY = e.clientY - floatingContainer.offsetTop;
    floatingContainer.style.transition = 'none';
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
    floatingContainer.style.transition = '';
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    let x = e.clientX - dragStartX;
    let y = e.clientY - dragStartY;
    x = Math.max(0, Math.min(window.innerWidth - floatingContainer.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - floatingContainer.offsetHeight, y));
    floatingContainer.style.left = x + 'px';
    floatingContainer.style.top = y + 'px';
    floatingContainer.style.bottom = 'auto';
    floatingContainer.style.right = 'auto';
  });

  floatingContainer.appendChild(clonedVideo);
  floatingContainer.appendChild(closeBtn);
  floatingContainer.appendChild(expandBtn);

  document.body.appendChild(floatingContainer);
  floatingVideosMap.set(originalVideo, floatingContainer);
}

function removeFloatingVideo(originalVideo) {
  const floatingContainer = floatingVideosMap.get(originalVideo);
  if (floatingContainer) {
    floatingContainer.remove();
    floatingVideosMap.delete(originalVideo);
    originalVideo.__hasFloating = false;
  }
}

// 4. 页面初始化
document.addEventListener('DOMContentLoaded', async () => {
  const tooltipData = await loadTooltips();
  const chapters = await loadChapters();

  setupTooltips(tooltipData);
  setupVideoAutoPause();
});