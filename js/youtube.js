// js/youtube.js (重构版 - 包含所有 YouTube 逻辑)

let floatBox = null;
let floatPlayer = null;
let currentFloatVideoId = null; // 跟踪当前浮动视频的 ID
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// 定义一个阈值，小于此宽度被认为是移动设备，不显示浮动视频
const MOBILE_WIDTH_THRESHOLD = 768;

// --- 新增或修改的工具函数 ---

/**
 * 从各种 YouTube URL 格式中提取视频 ID。
 * 已从 utils.js 移动到这里。
 * @param {string} url - YouTube 视频的 URL。
 * @returns {string|null} - 提取到的视频 ID，如果没有找到则返回 null。
 */
export function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtu\.be\/|m\.youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;
    const m = url.match(regex);
    if (m && m[1] && m[1].length === 11) {
        // 确保ID是干净的，虽然regex应该已经处理了大部分
        let videoId = m[1];
        const queryParamIndex = videoId.indexOf('?');
        if (queryParamIndex !== -1) videoId = videoId.substring(0, queryParamIndex);
        const hashIndex = videoId.indexOf('#');
        if (hashIndex !== -1) videoId = videoId.substring(0, hashIndex);
        return videoId;
    }
    return null;
}

/**
 * 统一生成 YouTube 嵌入 iframe 的 src URL。
 * 替代了原先 utils.js 中的 ensureEnableJsApi 的部分功能，并修正了域名。
 * @param {string} videoId - YouTube 视频的 ID。
 * @param {boolean} [enableJsApi=false] - 是否启用 JavaScript API。
 * @returns {string} - 生成的 YouTube 嵌入 URL。
 */
export function getYouTubeEmbedUrl(videoId, enableJsApi = false) {
    if (!videoId) return '';
    // 使用标准的 YouTube 嵌入域名
    const baseUrl = 'www.youtube.com'; // 标准嵌入域名
    let url = `${baseUrl}${videoId}`;

    const params = new URLSearchParams();
    if (enableJsApi) {
        params.set('enablejsapi', '1');
    }
    // 其他可能需要的参数，例如 rel=0, controls=1 等
    // params.set('rel', '0'); // 不显示相关视频
    // params.set('controls', '1'); // 显示播放器控件

    if (params.toString()) {
        url += `?${params.toString()}`;
    }
    return url;
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

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api`。"]')) {
      const tag = document.createElement('script');
      // 修正：使用标准的 YouTube API URL
      tag.src = 'https://www.youtube.com/iframe_api`。';
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
  Object.assign(floatBox.style, {
    userSelect: 'none'
  });

  floatBox.innerHTML = `
    <div class="video-header">
      <span>Floating Video</span>
      <button class="close-btn">×</button>
    </div>
    <div id="float-player" style="flex-grow:1; width:100%;"></div>
  `;

  document.body.appendChild(floatBox);

  const header = floatBox.querySelector('.video-header');
  header.addEventListener('mousedown', e => {
    isDragging = true;
    dragOffsetX = e.clientX - floatBox.getBoundingClientRect().left;
    dragOffsetY = e.clientY - floatBox.getBoundingClientRect().top;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;

    left = Math.min(Math.max(0, left), window.innerWidth - floatBox.offsetWidth);
    top = Math.min(Math.max(0, top), window.innerHeight - floatBox.offsetHeight);

    floatBox.style.left = left + 'px';
    floatBox.style.top = top + 'px';
    floatBox.style.bottom = 'auto';
    floatBox.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  floatBox.querySelector('.close-btn').addEventListener('click', () => {
    removeFloatBox();
  });

  // 使用提取的 videoId 初始化 YT.Player
  floatPlayer = new YT.Player('float-player', {
    height: '180',
    width: '320',
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
    }
  });

  currentFloatVideoId = videoId;
}

/**
 * 移除浮动视频框。
 */
function removeFloatBox() {
  if (floatPlayer) {
    floatPlayer.destroy();
    floatPlayer = null;
  }
  if (floatBox) {
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
  const rect = iframe.getBoundingClientRect();
  return rect.top >= window.innerHeight || rect.bottom <= 0;
}

/**
 * 设置 YouTube 视频的自动暂停功能。
 * 当一个视频开始播放时，暂停其他所有视频。
 */
export function setupVideoAutoPause() {
  window.addEventListener('message', (e) => {
    // 修正：检查标准的 YouTube 消息来源
    // 典型的 YouTube 嵌入 iframe 来源是 www.youtube.com 或 https://www.youtube-nocookie.com
    if (!(e.origin.includes('www.youtube.com') || e.origin.includes('youtube-nocookie.com'))) {
      return;
    }

    try {
      const data = JSON.parse(e.data);
      if (data.event === 'infoDelivery' && data.info && data.info.playerState === 1) { // playerState 1 是播放中
        const playingIframe = e.source;

        // 修正：选择器匹配标准的 YouTube 嵌入 iframe src
        document.querySelectorAll('iframe[src*="www.youtube.com"]').forEach(iframe => {
          if (iframe.contentWindow !== playingIframe) {
            iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
          }
        });
      }
    } catch (error) {
      // 忽略非 JSON 格式的消息或解析错误
    }
  });
}

/**
 * 设置浮动 YouTube 视频功能。
 * 监听页面滚动和视频播放状态，当主视频滚动出视口时，在桌面端显示浮动视频。
 */
export async function setupFloatingYouTube() {
  await loadYouTubeAPI();

  if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      console.log("检测到移动设备，不启用浮动视频功能。");
      return;
  }

  // 修正：选择器匹配标准的 YouTube 嵌入 iframe src
  const iframes = Array.from(document.querySelectorAll('iframe[src*="www.youtube.com"]'))
    .map(iframe => {
      // 确保 iframe 的 src 包含 enablejsapi=1，使用 getYouTubeEmbedUrl 来统一生成
      const videoId = extractVideoId(iframe.src);
      if (videoId) {
          iframe.src = getYouTubeEmbedUrl(videoId, true);
      }
      return iframe;
    });

  const players = new Map();

  iframes.forEach(iframe => {
    // 使用 YT.Player(iframe_element, ...) 初始化
    const player = new YT.Player(iframe, {
      events: {
        onStateChange: (event) => {
            const currentIframe = event.target.getIframe();
            players.set(currentIframe, event.data);
            updateFloatForIframe(currentIframe);
        }
      }
    });
    players.set(iframe, -1);
  });

  function updateFloatForIframe(iframe) {
    if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
        removeFloatBox();
        return;
    }

    const state = players.get(iframe);
    const videoId = extractVideoId(iframe.src);

    if (state === 1 && isIframeOutOfView(iframe)) {
      if (!floatBox || currentFloatVideoId !== videoId) { // 比较 videoId 而不是整个 src
        createFloatBox(iframe.src); // 传入原始 src 给 createFloatBox，它会提取 ID
      }
    } else {
      if (floatBox && currentFloatVideoId === videoId) { // 比较 videoId 而不是整个 src
        removeFloatBox();
      }
    }
  }

  window.addEventListener('scroll', () => {
    players.forEach((state, iframe) => {
      updateFloatForIframe(iframe);
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      removeFloatBox();
    } else {
      if (floatBox) {
        const left = parseInt(floatBox.style.left || 'auto');
        const top = parseInt(floatBox.style.top || 'auto');
        if (!isNaN(left) && !isNaN(top)) {
          floatBox.style.left = Math.min(left, window.innerWidth - floatBox.offsetWidth) + 'px';
          floatBox.style.top = Math.min(top, window.innerHeight - floatBox.offsetHeight) + 'px';
        }
      }
    }
  });

  // 初始加载时也检查一下
  if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      removeFloatBox();
  }
}
