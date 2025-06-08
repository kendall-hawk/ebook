// js/youtube.js
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let floatBox = null;
let floatPlayer = null;
let currentFloatSrc = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// 定义一个阈值，小于此宽度被认为是移动设备，不显示浮动视频
const MOBILE_WIDTH_THRESHOLD = 768; // 可以根据需要调整

/**
 * 加载 YouTube iframe API。
 * @returns {Promise<void>}
 */
function loadYouTubeAPI() {
  return new Promise(resolve => {
    // 如果 API 已经加载，直接解决 Promise
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    // 检查是否已经存在 YouTube API 脚本标签，避免重复添加
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      // !!! 关键修正 !!! 使用正确的 YouTube API URL
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
 * @param {string} videoSrc - 视频的 URL。
 */
function createFloatBox(videoSrc) {
  // 如果是移动设备，不创建浮动视频框
  if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
    return;
  }

  // 如果已经存在浮动框，并且是同一个视频，则直接返回
  if (floatBox && currentFloatSrc === videoSrc) {
    return;
  }
  // 如果存在但不是同一个视频，则先移除旧的
  if (floatBox) {
      removeFloatBox();
  }

  floatBox = document.createElement('div');
  // !!! 关键修正 !!! 添加 CSS 类名，让 style.css 来控制样式
  floatBox.classList.add('floating-video');

  // 只有少数需要动态修改或 JS 独有的样式保留 inline
  Object.assign(floatBox.style, {
    userSelect: 'none' // 防止拖动时选中文字
  });

  // !!! 关键修正 !!! 使用 class 代替 id，以匹配 style.css
  floatBox.innerHTML = `
    <div class="video-header">
      <span>Floating Video</span>
      <button class="close-btn">×</button>
    </div>
    <div id="float-player" style="flex-grow:1; width:100%;"></div>
  `;

  document.body.appendChild(floatBox);

  // !!! 关键修正 !!! 使用 class 选择器
  const header = floatBox.querySelector('.video-header');
  header.addEventListener('mousedown', e => {
    isDragging = true;
    dragOffsetX = e.clientX - floatBox.getBoundingClientRect().left;
    dragOffsetY = e.clientY - floatBox.getBoundingClientRect().top;
    e.preventDefault(); // 防止拖动时选中文字
  });

  // 拖动事件绑定到 document，确保鼠标离开浮动框也能继续拖动
  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;

    // 限制浮动框在视口内
    left = Math.min(Math.max(0, left), window.innerWidth - floatBox.offsetWidth);
    top = Math.min(Math.max(0, top), window.innerHeight - floatBox.offsetHeight);

    floatBox.style.left = left + 'px';
    floatBox.style.top = top + 'px';
    // 拖动后清除 bottom/right，以免冲突
    floatBox.style.bottom = 'auto';
    floatBox.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // !!! 关键修正 !!! 使用 class 选择器
  floatBox.querySelector('.close-btn').addEventListener('click', () => {
    removeFloatBox();
  });

  // 确保 videoSrc 是正确的 YouTube 嵌入 URL，并且提取 videoId
  const videoId = extractVideoId(videoSrc);
  if (!videoId) {
      console.error('无法从 URL 提取 YouTube 视频 ID:', videoSrc);
      removeFloatBox();
      return;
  }

  // YT.Player 的第三个参数是 ID，这里是 '#float-player' 元素的 ID
  floatPlayer = new YT.Player('float-player', {
    height: '180', // 这些宽高会作为 iframe 的默认宽高，但会被 CSS 或父容器 flex 覆盖
    width: '320',
    videoId: videoId, // 使用提取的视频 ID
    playerVars: {
        autoplay: 1,
        controls: 1,
        enablejsapi: 1 // 确保这个参数在 playerVars 中
    },
    events: {
      onReady: event => {
          event.target.playVideo();
      },
      // 可以在这里添加其他事件，例如 onStateChange
    }
  });

  currentFloatSrc = videoSrc;
}

/**
 * 移除浮动视频框。
 */
function removeFloatBox() {
  if (floatPlayer) {
    floatPlayer.destroy(); // 销毁 YouTube 播放器实例
    floatPlayer = null;
  }
  if (floatBox) {
    floatBox.remove(); // 从 DOM 中移除元素
    floatBox = null;
    currentFloatSrc = null;
  }
}

/**
 * 判断 iframe 是否完全超出视口。
 * @param {HTMLIFrameElement} iframe - 要检查的 iframe 元素。
 * @returns {boolean} - 如果 iframe 完全超出视口则返回 true。
 */
function isIframeOutOfView(iframe) {
  const rect = iframe.getBoundingClientRect();
  // 当 iframe 顶部在视口底部以下，或者 iframe 底部在视口顶部以上时，认为其超出视口
  return rect.top >= window.innerHeight || rect.bottom <= 0;
}

/**
 * 设置 YouTube 视频的自动暂停功能。
 * 当一个视频开始播放时，暂停其他所有视频。
 */
export function setupVideoAutoPause() {
  window.addEventListener('message', (e) => {
    // 确保消息来自 YouTube iframe
    if (e.origin !== 'https://www.youtube.com' && e.origin !== 'https://youtube.com') { // 确保是正确的 YouTube 域名
      return;
    }

    // 解析 YouTube playerState 消息
    try {
      const data = JSON.parse(e.data);
      if (data.event === 'infoDelivery' && data.info && data.info.playerState === 1) { // playerState 1 是播放中
        const playingIframe = e.source; // 正在播放的 iframe 的内容窗口

        document.querySelectorAll('iframe[src*="https://www.youtube.com/embed/"]').forEach(iframe => {
          if (iframe.contentWindow !== playingIframe) {
            // 如果不是正在播放的 iframe，则发送暂停指令
            iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
          }
        });
      }
    } catch (error) {
      // 忽略非 JSON 格式的消息或解析错误
      // console.warn('无法解析 YouTube API 消息:', e.data, error);
    }
  });
}

/**
 * 设置浮动 YouTube 视频功能。
 * 监听页面滚动和视频播放状态，当主视频滚动出视口时，在桌面端显示浮动视频。
 */
export async function setupFloatingYouTube() {
  await loadYouTubeAPI(); // 确保 API 已加载

  // 如果是移动设备，直接返回，不设置浮动视频功能
  if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      console.log("检测到移动设备，不启用浮动视频功能。");
      return;
  }

  const iframes = Array.from(document.querySelectorAll('iframe[src*="https://www.youtube.com/embed/"]'))
    .map(iframe => {
      // 确保 iframe 的 src 包含 enablejsapi=1
      iframe.src = ensureEnableJsApi(iframe.src);
      return iframe;
    });

  const players = new Map(); // 存储 iframe -> playerState

  // 为每个 iframe 创建 YT.Player 实例，并监听状态变化
  iframes.forEach(iframe => {
    const player = new YT.Player(iframe, {
      events: {
        onStateChange: (event) => {
            const currentIframe = event.target.getIframe(); // 获取事件对应的 iframe 元素
            players.set(currentIframe, event.data); // 更新该 iframe 的播放状态
            updateFloatForIframe(currentIframe); // 根据状态更新浮动视频
        }
      }
    });
    players.set(iframe, -1); // 初始状态设为 -1 (未播放)
  });

  // 根据 iframe 的播放状态和是否超出视口来更新浮动视频框
  function updateFloatForIframe(iframe) {
    // 如果是移动设备，不显示浮动视频
    if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
        removeFloatBox(); // 确保浮动视频被移除
        return;
    }

    const state = players.get(iframe);
    const videoId = extractVideoId(iframe.src); // 提取视频 ID

    // 当视频正在播放 (state === 1) 且完全超出视口时
    if (state === 1 && isIframeOutOfView(iframe)) {
      // 如果没有浮动框，或者浮动框中的视频不是当前播放的视频，则创建/更新浮动框
      if (!floatBox || currentFloatSrc !== iframe.src) {
        createFloatBox(iframe.src);
      }
    } else {
      // 如果视频不在播放，或者在视口内，或者当前浮动框就是这个视频，则移除浮动框
      if (floatBox && currentFloatSrc === iframe.src) {
        removeFloatBox();
      }
    }
  }

  // 监听页面滚动事件，更新浮动视频状态
  window.addEventListener('scroll', () => {
    // 在滚动时，迭代所有已知的播放器，并根据它们的状态和位置更新浮动视频
    players.forEach((state, iframe) => {
      updateFloatForIframe(iframe);
    });
  });

  // 监听页面窗口大小调整，以防从桌面模式切换到移动模式或反之
  window.addEventListener('resize', () => {
    if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
      removeFloatBox(); // 移动端直接移除浮动视频
    } else {
      // 如果是桌面端，并且之前有浮动视频，重新调整位置
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
