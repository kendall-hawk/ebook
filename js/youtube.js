// js/youtube.js
import { ensureEnableJsApi, extractVideoId } from './utils.js';

// --- 全局变量和状态 ---
let floatBox = null;         // 浮动视频容器元素
let floatPlayer = null;      // 浮动视频的 YT.Player 实例
let currentFloatSrc = null;  // 当前浮动视频的原始 src

// 拖动功能相关变量
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Intersection Observer 实例的 Map，用于观察每个视频 iframe
const intersectionObservers = new Map();
// 存储原始视频的 YT.Player 实例
const players = new Map(); // Map<HTMLElement, YT.Player>
// 存储原始视频的播放状态 (YouTube API playerState: 1: playing, 2: paused, etc.)
const playerStates = new Map(); // Map<HTMLElement, number>

// --- 辅助函数 ---

/**
 * 动态加载 YouTube Iframe API 脚本。
 * 该函数确保 onYouTubeIframeAPIReady 回调被正确处理。
 * @returns {Promise<void>}
 */
function loadYouTubeAPI() {
  return new Promise(resolve => {
    // 如果 API 已经加载，直接解决 Promise
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    // 将 onYouTubeIframeAPIReady 设置为全局回调，在 API 脚本加载完成后触发
    window.onYouTubeIframeAPIReady = () => {
      resolve();
      // 清除全局回调，防止重复触发 (可选，但推荐)
      delete window.onYouTubeIframeAPIReady;
    };

    // 如果 API 脚本尚未在 DOM 中，则创建并添加脚本标签
    // 注意：这里的 URL 是标准的 YouTube API URL
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  });
}

/**
 * 创建并初始化浮动视频框。
 * @param {string} videoSrc - 原始视频的 URL。
 */
function createFloatBox(videoSrc) {
  // 如果浮动框已经存在，则不重复创建
  if (floatBox) return;

  floatBox = document.createElement('div');
  Object.assign(floatBox.style, {
    position: 'fixed',
    width: '320px',    // 浮动框宽度
    height: '180px',   // 浮动框高度 (16:9 比例)
    bottom: '10px',    // 初始位置：右下角
    right: '10px',
    backgroundColor: '#000',
    border: '1px solid #444',
    borderRadius: '6px',
    zIndex: '9999',    // 确保在最上层
    display: 'flex',
    flexDirection: 'column',
    cursor: 'move',    // 鼠标样式表示可拖动
    userSelect: 'none', // 防止拖动时选中文字
    boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
  });

  floatBox.innerHTML = `
    <div id="float-header" style="background:#222; color:#fff; padding:4px 8px; display:flex; justify-content:space-between; align-items:center; font-size:14px; cursor:grab;">
      <span>Floating Video</span>
      <button id="float-close" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer; line-height:1; padding:0 5px;">&times;</button>
    </div>
    <div id="float-player" style="flex-grow:1; width:100%;"></div>
  `;

  document.body.appendChild(floatBox);

  // --- 拖动功能 ---
  const header = floatBox.querySelector('#float-header');
  header.addEventListener('mousedown', e => {
    isDragging = true;
    dragOffsetX = e.clientX - floatBox.getBoundingClientRect().left;
    dragOffsetY = e.clientY - floatBox.getBoundingClientRect().top;
    header.style.cursor = 'grabbing'; // 拖动时改变鼠标样式
    e.preventDefault(); // 阻止默认的拖动行为，如图片拖动
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;

    // 限制浮动框在视口内移动
    left = Math.min(Math.max(0, left), window.innerWidth - floatBox.offsetWidth);
    top = Math.min(Math.max(0, top), window.innerHeight - floatBox.offsetHeight);

    floatBox.style.left = left + 'px';
    floatBox.style.top = top + 'px';
    // 移除 bottom 和 right 样式，以免冲突
    floatBox.style.bottom = 'auto';
    floatBox.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab'; // 恢复鼠标样式
    }
  });

  // --- 关闭按钮功能 ---
  floatBox.querySelector('#float-close').addEventListener('click', () => {
    removeFloatBox();
  });

  // --- 初始化浮动视频播放器 ---
  floatPlayer = new YT.Player('float-player', {
    height: '100%', // 填充父容器
    width: '100%',  // 填充父容器
    videoId: extractVideoId(videoSrc),
    playerVars: {
      autoplay: 1,  // 自动播放
      controls: 1,  // 显示控制器
      disablekb: 1, // 禁用键盘控制 (可选)
      modestbranding: 1 // 适度品牌 (可选)
    },
    events: {
      // 浮动播放器准备好后自动播放
      onReady: event => {
        event.target.playVideo();
      },
      // 浮动播放器状态改变时，如果播放结束，则移除浮动框
      onStateChange: event => {
        if (event.data === YT.PlayerState.ENDED) {
          removeFloatBox();
        }
      }
    }
  });

  currentFloatSrc = videoSrc; // 记录当前浮动视频的原始 src
}

/**
 * 移除浮动视频框和播放器。
 */
function removeFloatBox() {
  if (floatPlayer) {
    floatPlayer.destroy(); // 销毁 YT.Player 实例
    floatPlayer = null;
  }
  if (floatBox) {
    floatBox.remove(); // 从 DOM 中移除浮动框
    floatBox = null;
    currentFloatSrc = null;
  }
}

// --- 主要功能设置 ---

/**
 * 设置 YouTube 视频的自动暂停功能：
 * 当一个视频开始播放时，暂停页面上其他正在播放的视频。
 */
export function setupVideoAutoPause() {
  // 监听来自 iframe 的 postMessage 消息
  window.addEventListener('message', (e) => {
    // 确保消息是来自 YouTube 播放器并包含播放状态信息
    if (typeof e.data === 'string' && e.data.includes('{"event":"infoDelivery"') && e.data.includes('"info":{"playerState":1')) {
      const playingIframe = e.source; // 获取当前正在播放视频的 iframe 的 window 对象

      // 遍历所有 iframe
      document.querySelectorAll('iframe').forEach(iframe => {
        // 如果不是当前正在播放的 iframe，并且是 YouTube 播放器，则发送暂停命令
        if (iframe.contentWindow !== playingIframe && iframe.src.includes('youtube.com/embed/')) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }
  });
}

/**
 * 设置浮动 YouTube 视频功能：
 * 当正在播放的视频滚动出视口时，自动变成浮动小窗口。
 */
export async function setupFloatingYouTube() {
  await loadYouTubeAPI(); // 确保 YouTube API 已加载

  // 1. 找到所有 YouTube 视频 iframe
  const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"], iframe[src*="youtube.com/watch?v="]'))
    .map(iframe => {
      // 确保每个 iframe 的 src 包含 enablejsapi=1 参数，以便能够通过 API 控制
      iframe.src = ensureEnableJsApi(iframe.src);
      return iframe;
    });

  // 2. 为每个视频 iframe 初始化 YT.Player 实例并监听状态变化
  iframes.forEach(iframe => {
    const player = new YT.Player(iframe, {
      events: {
        onStateChange: onPlayerStateChange // 当播放器状态改变时触发
      }
    });
    players.set(iframe, player); // 存储播放器实例
    playerStates.set(iframe, -1); // 初始化播放器状态为未知 (-1)
  });

  /**
   * YT.Player 的 onStateChange 事件回调。
   * @param {Object} event - 事件对象，event.data 包含播放器状态。
   */
  function onPlayerStateChange(event) {
    const iframe = event.target.getIframe(); // 获取触发事件的 iframe 元素
    playerStates.set(iframe, event.data); // 更新该 iframe 的播放状态

    // 当播放器状态改变时，也需要检查交叉状态，以决定是否浮动
    // 这里手动调用 observerCallback，模拟 Intersection Observer 的行为
    const rect = iframe.getBoundingClientRect();
    observerCallback([{
      target: iframe,
      isIntersecting: rect.bottom > 0 && rect.top < window.innerHeight // 简单判断是否在视口内
    }]);
  }


  // 3. 使用 Intersection Observer 监听视频 iframe 的视口交叉状态
  const observerCallback = (entries) => {
    entries.forEach(entry => {
      const iframe = entry.target;
      const player = players.get(iframe);
      const state = playerStates.get(iframe);

      // 确保播放器实例存在
      if (!player) return;

      // 如果视频正在播放 (YT.PlayerState.PLAYING === 1)
      if (state === YT.PlayerState.PLAYING) {
        // 如果视频的原始位置完全不在视口内 (isIntersecting === false)
        if (!entry.isIntersecting) {
          // 如果浮动框不存在，或者存在但不是当前视频的浮动框，则创建浮动框
          if (!floatBox || currentFloatSrc !== iframe.src) {
            createFloatBox(iframe.src);
            // 尝试同步播放状态：让浮动播放器从当前时间点开始播放
            if (player && floatPlayer) {
              floatPlayer.seekTo(player.getCurrentTime(), true);
            }
          }
        } else {
          // 如果视频回到了视口内
          if (floatBox && currentFloatSrc === iframe.src) {
            removeFloatBox();
            // 尝试同步播放状态：让原始播放器从浮动播放器当前时间点开始播放
            if (player && playerStates.get(iframe) !== YT.PlayerState.ENDED) { // 确保原始视频没有播放结束
                player.seekTo(floatPlayer ? floatPlayer.getCurrentTime() : player.getCurrentTime(), true);
                player.playVideo(); // 确保原始视频继续播放
            }
          }
        }
      } else {
        // 如果视频不在播放状态（暂停、停止、未开始、结束等），确保浮动窗口关闭
        if (floatBox && currentFloatSrc === iframe.src) {
          removeFloatBox();
        }
      }
    });
  };

  // 为每个 iframe 创建 Intersection Observer
  iframes.forEach(iframe => {
    const observer = new IntersectionObserver(observerCallback, {
      root: null,      // 视口是根元素
      rootMargin: '0px', // 没有额外的边距
      threshold: 0     // 视频完全离开或进入视口时触发
    });
    observer.observe(iframe);
    intersectionObservers.set(iframe, observer);
  });

  // 4. 监听窗口大小调整事件，以重新定位浮动框（如果它在拖动后脱离了右下角定位）
  window.addEventListener('resize', () => {
    if (!floatBox) return; // 如果浮动框不存在，则不处理

    // 获取浮动框当前的左上角定位 (如果它被手动拖动过)
    const currentLeft = parseFloat(floatBox.style.left);
    const currentTop = parseFloat(floatBox.style.top);

    // 如果浮动框是固定定位 (bottom/right) 的，则不改变
    if (isNaN(currentLeft) && isNaN(currentTop)) {
        return; // 保持其原始的 bottom/right 定位
    }

    // 否则，根据新的窗口大小调整其位置，使其保持在视口内
    floatBox.style.left = Math.min(currentLeft, window.innerWidth - floatBox.offsetWidth) + 'px';
    floatBox.style.top = Math.min(currentTop, window.innerHeight - floatBox.offsetHeight) + 'px';
  });
}
