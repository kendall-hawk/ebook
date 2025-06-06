// 1. 工具提示加载与初始化（保持你的代码）
async function loadTooltips() {
  // ...你的加载逻辑
  return {}; // 示例返回值
}
async function loadChapters() {
  // ...你的章节加载逻辑
  return []; // 示例返回值
}
function setupTooltips(tooltips) {
  // ...初始化提示逻辑
}

// 2. 视频自动暂停和悬浮播放整合
function setupVideoAutoPause() {
  // 监听所有视频元素的播放状态
  const videos = document.querySelectorAll('video');
  videos.forEach(video => {
    video.addEventListener('timeupdate', () => {
      // 判断视频是否在视口内
      const rect = video.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (!isVisible && !video.paused) {
        // 视频不在视口内且在播放，切换到悬浮播放
        createFloatingVideo(video);
        video.pause();
      } else if (isVisible) {
        // 视频在视口内，移除悬浮播放
        removeFloatingVideo(video);
      }
    });
  });
}

// 3. 悬浮视频相关操作
const floatingVideosMap = new Map(); // 原视频 -> 悬浮容器 映射

function createFloatingVideo(originalVideo) {
  if (floatingVideosMap.has(originalVideo)) return; // 已存在悬浮视频

  // 创建悬浮容器
  const floatingContainer = document.createElement('div');
  floatingContainer.className = 'floating-video-container';
  floatingContainer.style.position = 'fixed';
  floatingContainer.style.bottom = '20px';
  floatingContainer.style.right = '20px';
  floatingContainer.style.width = '300px';
  floatingContainer.style.height = '168px';
  floatingContainer.style.background = '#000';
  floatingContainer.style.zIndex = 9999;
  floatingContainer.style.borderRadius = '8px';
  floatingContainer.style.overflow = 'hidden';
  floatingContainer.style.cursor = 'move';
  floatingContainer.style.display = 'flex';
  floatingContainer.style.alignItems = 'center';
  floatingContainer.style.justifyContent = 'center';

  // 复制视频节点
  const clonedVideo = originalVideo.cloneNode(true);
  clonedVideo.style.width = '100%';
  clonedVideo.style.height = '100%';
  clonedVideo.muted = true;
  clonedVideo.currentTime = originalVideo.currentTime;

  // 控制按钮 - 关闭
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '5px';
  closeBtn.style.right = '5px';
  closeBtn.style.background = 'rgba(0,0,0,0.5)';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '18px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.borderRadius = '50%';
  closeBtn.style.width = '28px';
  closeBtn.style.height = '28px';
  closeBtn.style.lineHeight = '28px';
  closeBtn.style.textAlign = 'center';

  closeBtn.addEventListener('click', () => {
    removeFloatingVideo(originalVideo);
  });

  // 放大按钮示例（可自定义）
  const expandBtn = document.createElement('button');
  expandBtn.textContent = '⬜';
  expandBtn.style.position = 'absolute';
  expandBtn.style.top = '5px';
  expandBtn.style.right = '40px';
  expandBtn.style.background = 'rgba(0,0,0,0.5)';
  expandBtn.style.color = 'white';
  expandBtn.style.border = 'none';
  expandBtn.style.fontSize = '14px';
  expandBtn.style.cursor = 'pointer';
  expandBtn.style.borderRadius = '4px';
  expandBtn.style.width = '28px';
  expandBtn.style.height = '28px';

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

  // 拖拽功能
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
    // 限制不超出窗口
    x = Math.max(0, Math.min(window.innerWidth - floatingContainer.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - floatingContainer.offsetHeight, y));
    floatingContainer.style.left = x + 'px';
    floatingContainer.style.top = y + 'px';
  });

  floatingContainer.appendChild(clonedVideo);
  floatingContainer.appendChild(closeBtn);
  floatingContainer.appendChild(expandBtn);

  document.body.appendChild(floatingContainer);

  // 自动播放悬浮视频
  clonedVideo.play();

  floatingVideosMap.set(originalVideo, floatingContainer);
}

function removeFloatingVideo(originalVideo) {
  const floatingContainer = floatingVideosMap.get(originalVideo);
  if (floatingContainer) {
    floatingContainer.remove();
    floatingVideosMap.delete(originalVideo);
  }
}

// 4. 页面初始化
document.addEventListener('DOMContentLoaded', async () => {
  const tooltipData = await loadTooltips();
  const chapters = await loadChapters();

  setupTooltips(tooltipData);
  setupVideoAutoPause();
});