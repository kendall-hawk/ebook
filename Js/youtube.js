// js/youtube.js
import { ensureEnableJsApi, extractVideoId } from './utils.js';

let floatBox = null;
let floatPlayer = null;
let currentFloatSrc = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

/**
 * 加载 YouTube iframe API。
 * @returns {Promise<void>}
 */
function loadYouTubeAPI() {
  return new Promise(resolve => {
    if (window.YT && window.YT.Player) {
      resolve();
    } else {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api'; // 确保这是正确的 YouTube API URL
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = () => resolve();
    }
  });
}

/**
 * 创建浮动视频框。
 * @param {string} videoSrc - 视频的 URL。
 */
function createFloatBox(videoSrc) {
  if (floatBox) return;

  floatBox = document.createElement('div');
  Object.assign(floatBox.style, {
    position: 'fixed',
    width: '320px',
    height: '180px',
    bottom: '10px',
    right: '10px',
    backgroundColor: '#000',
    border: '1px solid #444',
    borderRadius: '6px',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    cursor: 'move',
    userSelect: 'none',
  });

  floatBox.innerHTML = `
    <div id="float-header" style="background:#222; color:#fff; padding:4px; display:flex; justify-content:space-between; align-items:center;">
      <span>Floating Video</span>
      <button id="float-close" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer;">×</button>
    </div>
    <div id="float-player" style="flex-grow:1;"></div>
  `;

  document.body.appendChild(floatBox);

  const header = floatBox.querySelector('#float-header');
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

  floatBox.querySelector('#float-close').addEventListener('click', () => {
    removeFloatBox();
  });

  floatPlayer = new YT.Player('float-player', {
    height: '180',
    width: '320',
    videoId: extractVideoId(videoSrc),
    playerVars: { autoplay: 1, controls: 1 },
    events: {
      onReady: event => event.target.playVideo()
    }
  });

  currentFloatSrc = videoSrc;
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
    currentFloatSrc = null;
  }
}

/**
 * 判断 iframe 是否完全超出视口。
 * @param {HTMLElement} iframe - 要检查的 iframe 元素。
 * @returns {boolean} - 如果 iframe 超出视口则返回 true。
 */
function isIframeOutOfView(iframe) {
  const rect = iframe.getBoundingClientRect();
  return rect.bottom < 0 || rect.top > window.innerHeight;
}

/**
 * 设置 YouTube 视频的自动暂停功能。
 */
export function setupVideoAutoPause() {
  window.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return;
    if (e.data.includes('{"event":"infoDelivery"') && e.data.includes('"info":{"playerState":1')) {
      const playingIframe = e.source;
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow !== playingIframe) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }
  });
}

/**
 * 设置浮动 YouTube 视频功能。
 */
export async function setupFloatingYouTube() {
  await loadYouTubeAPI();

  const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"], iframe[src*="youtube.com/watch?v="], iframe[src*="youtu.be/"]'))
    .map(iframe => {
      // 确保 enablejsapi=1 已添加
      iframe.src = ensureEnableJsApi(iframe.src);
      return iframe;
    });

  const players = new Map();

  function onPlayerStateChange(event) {
    const iframe = event.target.getIframe();
    players.set(iframe, event.data);
    updateFloatForIframe(iframe);
  }

  iframes.forEach(iframe => {
    const player = new YT.Player(iframe, {
      events: {
        onStateChange: onPlayerStateChange
      }
    });
    players.set(iframe, -1); // 初始化播放器状态
  });

  function updateFloatForIframe(iframe) {
    const state = players.get(iframe);
    if (state === 1 && isIframeOutOfView(iframe)) { // 播放中且出视口
      if (!floatBox || currentFloatSrc !== iframe.src) {
        createFloatBox(iframe.src);
      }
    } else {
      if (floatBox && currentFloatSrc === iframe.src) {
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
    if (!floatBox) return;
    const left = parseInt(floatBox.style.left || 'auto');
    const top = parseInt(floatBox.style.top || 'auto');
    if (!isNaN(left) && !isNaN(top)) {
      floatBox.style.left = Math.min(left, window.innerWidth - floatBox.offsetWidth) + 'px';
      floatBox.style.top = Math.min(top, window.innerHeight - floatBox.offsetHeight) + 'px';
    }
  });
}
