// ------------------ 你的原有初始化函数，如果有，保留或整合 ------------------
function init() {
  // 你的页面初始化代码
  // 示例：
  console.log('Page initialized');
}

// ------------------ 悬浮视频播放功能代码 ------------------

(function(){
  // 判断元素是否在视口中
  function isInViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  let floatContainer = null;
  let currentVideo = null;
  let originalParent = null;
  let originalNextSibling = null;
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function createFloatingContainer() {
    if (floatContainer) return;

    floatContainer = document.createElement('div');
    floatContainer.className = 'floating-video';
    Object.assign(floatContainer.style, {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      width: '320px',
      height: '180px',
      backgroundColor: '#000',
      zIndex: '10000',
      border: '1px solid #444',
      borderRadius: '6px',
      display: 'flex',
      flexDirection: 'column',
    });

    const header = document.createElement('div');
    header.className = 'video-header';
    Object.assign(header.style, {
      cursor: 'move',
      userSelect: 'none',
      background: '#222',
      color: '#fff',
      padding: '4px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '14px',
    });

    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-btn';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.textContent = '×';

    const resizeBtn = document.createElement('span');
    resizeBtn.className = 'resize-btn';
    resizeBtn.style.cursor = 'pointer';
    resizeBtn.textContent = '⤢';

    header.appendChild(closeBtn);
    header.appendChild(resizeBtn);
    floatContainer.appendChild(header);
    document.body.appendChild(floatContainer);

    // 拖拽开始
    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - floatContainer.getBoundingClientRect().left;
      offsetY = e.clientY - floatContainer.getBoundingClientRect().top;
      e.preventDefault();
    });
    // 拖拽移动
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        let left = e.clientX - offsetX;
        let top = e.clientY - offsetY;
        left = Math.max(0, Math.min(left, window.innerWidth - floatContainer.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - floatContainer.offsetHeight));
        floatContainer.style.left = left + 'px';
        floatContainer.style.top = top + 'px';
        floatContainer.style.bottom = 'auto';
        floatContainer.style.right = 'auto';
      }
    });
    // 拖拽结束
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // 关闭按钮
    closeBtn.addEventListener('click', () => {
      restoreVideo();
      removeFloatingContainer();
    });

    // 放大缩小切换
    let isLarge = false;
    resizeBtn.addEventListener('click', () => {
      if (!currentVideo) return;
      isLarge = !isLarge;
      if (isLarge) {
        floatContainer.style.width = '560px';
        floatContainer.style.height = '315px';
        currentVideo.width = '560';
        currentVideo.height = '315';
      } else {
        floatContainer.style.width = '320px';
        floatContainer.style.height = '180px';
        currentVideo.width = '320';
        currentVideo.height = '180';
      }
    });
  }

  function removeFloatingContainer() {
    if (!floatContainer) return;
    floatContainer.remove();
    floatContainer = null;
  }

  // 移动视频到悬浮窗
  function moveVideoToFloating(video) {
    if (floatContainer) return;
    currentVideo = video;
    originalParent = video.parentNode;
    originalNextSibling = video.nextSibling;

    createFloatingContainer();

    floatContainer.appendChild(video);
    video.style.width = '320px';
    video.style.height = '180px';
  }

  // 恢复视频到原位置
  function restoreVideo() {
    if (!currentVideo || !originalParent) return;
    if (originalNextSibling) {
      originalParent.insertBefore(currentVideo, originalNextSibling);
    } else {
      originalParent.appendChild(currentVideo);
    }
    currentVideo.style.width = '560px';
    currentVideo.style.height = '315px';

    currentVideo = null;
    originalParent = null;
    originalNextSibling = null;
  }

  // 滚动检测，自动切换悬浮和原位
  window.addEventListener('scroll', () => {
    if (!currentVideo) return;
    if (isInViewport(currentVideo)) {
      restoreVideo();
      removeFloatingContainer();
    } else {
      if (!floatContainer) {
        moveVideoToFloating(currentVideo);
      }
    }
  });

  // 监听iframe消息，自动检测视频播放状态
  window.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return;

    if (e.data.includes('"playerState":1')) {
      const playingIframe = e.source.frameElement;
      if (!playingIframe) return;

      if (currentVideo && currentVideo !== playingIframe) {
        restoreVideo();
        removeFloatingContainer();
        currentVideo = null;
      }

      currentVideo = playingIframe;

      if (!isInViewport(currentVideo)) {
        moveVideoToFloating(currentVideo);
      }

      // 暂停其它视频
      document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(iframe => {
        if (iframe !== currentVideo) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }

    if (e.data.includes('"playerState":2') || e.data.includes('"playerState":0')) {
      if (currentVideo) {
        restoreVideo();
        removeFloatingContainer();
        currentVideo = null;
      }
    }
  });

  // 自动给iframe加enablejsapi=1参数
  function addEnableJsApi() {
    document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(iframe => {
      if (!iframe.src.includes('enablejsapi=1')) {
        iframe.src += (iframe.src.includes('?') ? '&' : '?') + 'enablejsapi=1';
      }
    });
  }

  // 页面加载完毕后初始化
  window.addEventListener('load', () => {
    addEnableJsApi();
  });

  // 页面初始化调用你的init
  window.addEventListener('load', () => {
    init();
  });

})();