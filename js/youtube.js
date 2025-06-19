/**
 * js/youtube.js
 * 负责 YouTube 视频的嵌入、浮动播放和自动暂停。
 */

let floatBox = null;
let floatPlayer = null;
let currentFloatVideoId = null; // 跟踪当前浮动视频的 ID
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// 定义一个阈值，小于此宽度被认为是移动设备，不显示浮动视频
const MOBILE_WIDTH_THRESHOLD = 768;

// --- 工具函数 ---

/**
 * 从各种 YouTube URL 格式中提取视频 ID。
 * @param {string} url - YouTube 视频的 URL。
 * @returns {string|null} - 提取到的视频 ID，如果没有找到则返回 null。
 */
export function extractVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    const regex = /(?:youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtu\.be\/|m\.youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;
    const m = url.match(regex);
    return m && m[1] ? m[1] : null;
}

/**
 * 统一生成 YouTube 嵌入 iframe 的 src URL。
 * @param {string} videoId - YouTube 视频的 ID。
 * @param {boolean} [enableJsApi=false] - 是否启用 JavaScript API。
 * @returns {string} - 生成的 YouTube 嵌入 URL。
 */
export function getYouTubeEmbedUrl(videoId, enableJsApi = false) {
    if (!videoId || typeof videoId !== 'string') return '';
    // 使用标准的 YouTube 嵌入域名
    const baseUrl = 'https://www.youtube.com/embed/'; // 标准嵌入域名

    const params = new URLSearchParams();
    if (enableJsApi) {
        params.set('enablejsapi', '1');
    }
    params.set('rel', '0'); // 不显示相关视频
    params.set('controls', '1'); // 显示播放器控件
    params.set('modestbranding', '1'); // 隐藏 YouTube 标志

    return `${baseUrl}${videoId}?${params.toString()}`;
}

// --- 浮动播放器和 API 加载逻辑 ---

/**
 * 加载 YouTube iframe API。
 * @returns {Promise<void>}
 */
function loadYouTubeAPI() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    // 当 YouTube API 准备好时，会调用这个全局函数
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

/**
 * 创建浮动视频框。
 * @param {string} videoUrl - 视频的原始 URL (用于提取ID)。
 */
function createFloatBox(videoUrl) {
  if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
    return;
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
      console.error('无法从 URL 提取 YouTube 视频 ID:', videoUrl);
      return;
  }

  // 如果已经存在浮动框，并且是同一个视频，则直接返回
  if (floatBox && currentFloatVideoId === videoId) {
    return;
  }
  // 如果存在但不是同一个视频，则先移除旧的
  if (floatBox) {
      removeFloatBox();
  }

  floatBox = document.createElement('div');
  floatBox.classList.add('floating-video');
  // 初始定位在右下角
  Object.assign(floatBox.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '320px', // 固定宽度
    height: '220px', // 高度 = 180 (视频) + 40 (头部)
    backgroundColor: '#000',
    boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    resize: 'both', // 允许用户调整大小
    overflow: 'hidden', // 隐藏溢出内容
    userSelect: 'none'
  });

  floatBox.innerHTML = `
    <div class="video-header" style="cursor: grab; display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; background-color: #333; color: #fff;">
      <span style="font-size: 14px;">Floating Video</span>
      <button class="close-btn" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; padding: 0 5px;">&times;</button>
    </div>
    <div id="float-player" style="flex-grow:1; width:100%; height:100%;"></div>
  `;

  document.body.appendChild(floatBox);

  const header = floatBox.querySelector('.video-header');
  header.addEventListener('mousedown', e => {
    isDragging = true;
    dragOffsetX = e.clientX - floatBox.getBoundingClientRect().left;
    dragOffsetY = e.clientY - floatBox.getBoundingClientRect().top;
    header.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;

    // 限制在视口内
    left = Math.min(Math.max(0, left), window.innerWidth - floatBox.offsetWidth);
    top = Math.min(Math.max(0, top), window.innerHeight - floatBox.offsetHeight);

    floatBox.style.left = left + 'px';
    floatBox.style.top = top + 'px';
    floatBox.style.bottom = 'auto'; // 取消 bottom/right 定位
    floatBox.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    if (header) header.style.cursor = 'grab';
  });

  floatBox.querySelector('.close-btn').addEventListener('click', () => {
    removeFloatBox();
  });

  // 使用提取的 videoId 初始化 YT.Player
  loadYouTubeAPI().then(() => {
    floatPlayer = new YT.Player('float-player', {
      height: '100%', // 占满父容器
      width: '100%',  // 占满父容器
      videoId: videoId,
      playerVars: {
          autoplay: 1,
          controls: 1,
          enablejsapi: 1
      },
      events: {
        onReady: event => {
            event.target.playVideo();
        },
        onError: (e) => {
            console.error('浮动播放器错误:', e);
            removeFloatBox(); // 发生错误时移除浮动框
        }
      }
    });
  }).catch(error => {
      console.error("加载 YouTube API 失败:", error);
      removeFloatBox();
  });

  currentFloatVideoId = videoId;
}

/**
 * 移除浮动视频框。
 */
function removeFloatBox() {
  if (floatPlayer) {
    floatPlayer.destroy(); // 销毁播放器实例
    floatPlayer = null;
  }
  if (floatBox) {
    // 移除所有事件监听器（可选，因为元素会被移除）
    const header = floatBox.querySelector('.video-header');
    if (header) {
        header.removeEventListener('mousedown', null); // 传递null可以移除所有相同类型的listener, 但更好的方式是保留引用逐一移除
    }
    floatBox.querySelector('.close-btn').removeEventListener('click', null);

    floatBox.remove();
    floatBox = null;
    currentFloatVideoId = null;
  }
}

/**
 * 判断 iframe 是否完全超出视口。
 * @param {HTMLIFrameElement} iframe - 要检查的 iframe 元素。
 * @returns {boolean} - 如果 iframe 完全超出视口则返回 true。
 */
function isIframeOutOfView(iframe) {
  if (!iframe) return false;
  const rect = iframe.getBoundingClientRect();
  // 考虑滚动条，判断是否完全在顶部或底部之外
  return rect.bottom <= 0 || rect.top >= window.innerHeight;
}

/**
 * 设置 YouTube 视频的自动暂停功能。
 * 当一个视频开始播放时，暂停其他所有视频。
 * 此功能依赖于 YouTube Iframe Player API 的 postMessage 机制。
 */
export function setupVideoAutoPause() {
  window.addEventListener('message', (e) => {
    // 过滤掉非 YouTube 来源的消息
    if (!e.origin.includes('youtube.com') && !e.origin.includes('youtube-nocookie.com')) {
      return;
    }

    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      // 检查是否是播放器状态改变消息，并且状态是“播放中”
      if (data.event === 'infoDelivery' && data.info && data.info.playerState === 1) { // playerState 1 是播放中
        const playingIframe = e.source; // 正在播放视频的 iframe 的 window 对象

        document.querySelectorAll('iframe[src*="youtube.com/embed/"], iframe[src*="youtube-nocookie.com/embed/"]')
          .forEach(iframe => {
            // 如果不是当前播放的 iframe，则发送暂停命令
            if (iframe.contentWindow !== playingIframe) {
              iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            }
          });
      }
    } catch (error) {
      // 忽略非 JSON 格式的消息或解析错误
      // console.warn("非 YouTube API 消息或解析错误:", error, e.data);
    }
  });
}

/**
 * 设置浮动 YouTube 视频功能。
 * 监听页面滚动和视频播放状态，当主视频滚动出视口时，在桌面端显示浮动视频。
 */
export async function setupFloatingYouTube() {
  // 确保 API 已经加载
  await loadYouTubeAPI();

  if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      console.log("检测到移动设备，不启用浮动视频功能。");
      return;
  }

  // 收集所有嵌入的 YouTube iframe 元素
  const chapterIframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"], iframe[src*="youtube-nocookie.com/embed/"]'));

  // 创建 YT.Player 实例并存储状态
  // Map<HTMLIFrameElement, YT.Player>
  const playerInstances = new Map();

  chapterIframes.forEach(iframe => {
    const videoId = extractVideoId(iframe.src);
    if (!videoId) {
        console.warn('无法为 iframe 提取视频 ID:', iframe);
        return;
    }
    // 确保 iframe 的 src 包含 enablejsapi=1，统一处理
    iframe.src = getYouTubeEmbedUrl(videoId, true);

    const player = new YT.Player(iframe, {
      events: {
        onStateChange: (event) => {
            // 当播放状态改变时，更新浮动框状态
            updateFloatBoxVisibility(event.target.getIframe());
        },
        onError: (e) => {
            console.error('章节视频播放器错误:', e);
        }
      }
    });
    playerInstances.set(iframe, player);
  });

  // 根据 iframe 的播放状态和视口位置更新浮动框
  function updateFloatBoxVisibility(targetIframe) {
    if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
        removeFloatBox();
        return;
    }

    const player = playerInstances.get(targetIframe);
    if (!player) return;

    // YT.Player 的 PlayerState 枚举: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    const state = player.getPlayerState();
    const videoId = extractVideoId(targetIframe.src);

    // 如果视频正在播放 (state === 1) 且当前 iframe 滚出了视口
    if (state === 1 && isIframeOutOfView(targetIframe)) {
      // 只有当前没有浮动框，或者浮动框是不同视频时才创建新的
      if (!floatBox || currentFloatVideoId !== videoId) {
        createFloatBox(targetIframe.src); // 传递原始 src 以提取 ID
      }
    } else {
      // 如果视频停止播放 (state !== 1) 或重新进入视口
      // 且当前浮动框就是这个视频的，则移除浮动框
      if (floatBox && currentFloatVideoId === videoId) {
        removeFloatBox();
      }
    }
  }

  // 监听窗口滚动事件，更新所有视频的浮动状态
  window.addEventListener('scroll', () => {
    playerInstances.forEach((player, iframe) => {
      updateFloatBoxVisibility(iframe);
    });
  }, { passive: true }); // 使用被动事件监听器提高滚动性能

  // 监听窗口大小变化，在移动设备宽度下移除浮动框
  window.addEventListener('resize', () => {
    if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      removeFloatBox();
    } else {
      // 确保浮动框在调整大小后仍在视口内
      if (floatBox) {
        const left = parseFloat(floatBox.style.left || '0');
        const top = parseFloat(floatBox.style.top || '0');
        floatBox.style.left = Math.min(left, window.innerWidth - floatBox.offsetWidth) + 'px';
        floatBox.style.top = Math.min(top, window.innerHeight - floatBox.offsetHeight) + 'px';
      }
    }
  });

  // 初始加载时也检查一下所有视频的状态
  chapterIframes.forEach(iframe => updateFloatBoxVisibility(iframe));
}
