// script.js

// 1. 加载tooltip数据
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// 2. 加载章节数据
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// 3. 用tooltip包装关键词，渲染markdown
function renderMarkdownWithTooltips(md, tooltipData) {
  const tooltipWords = Object.keys(tooltipData);
  const wordPattern = /\b\w+\b/g;
  const markedWithSpan = md.replace(wordPattern, (match) => {
    const lower = match.toLowerCase();
    return tooltipWords.includes(lower)
      ? `<span data-tooltip-id="${lower}" class="word">${match}</span>`
      : match;
  });

  return marked.parse(markedWithSpan);
}

// 4. 给所有词绑定点击弹出tooltip
function setupTooltips(tooltipData) {
  const tooltipContainer = document.getElementById('tooltips');
  document.querySelectorAll('.word').forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      let tooltip = document.getElementById('tooltip-' + id);
      if (!tooltip) {
        const data = tooltipData[id];
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip-' + id;
        tooltip.className = 'tooltip';
        tooltip.innerHTML = `
          <strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong><br>
          ${data.partOfSpeech ? `<div><strong>Part of Speech:</strong> ${data.partOfSpeech}</div>` : ''}
          ${data.definition ? `<div><strong>Definition:</strong> ${data.definition}</div>` : ''}
          ${data["Image Description"] ? `<div><strong>Image Description:</strong> ${data["Image Description"]}</div>` : ''}
          ${data.example ? `<div><strong>Example:</strong> <em>${data.example}</em></div>` : ''}
          ${data.image ? `<img src="${data.image}" alt="${id}" style="max-width:100%; margin-top:8px;">` : ''}
        `;
        tooltip.style.position = 'absolute';
        tooltip.style.display = 'none';
        tooltipContainer.appendChild(tooltip);
      }

      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });

      if (tooltip.style.display === 'block') {
        tooltip.style.display = 'none';
      } else {
        tooltip.style.display = 'block';
        const rect = word.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = window.scrollY + rect.bottom + 6;
        let left = window.scrollX + rect.left;

        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
          top = window.scrollY + rect.top - tooltipRect.height - 6;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => (t.style.display = 'none'));
  });
}

// 5. YouTube视频自动暂停
function setupVideoAutoPause() {
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

// 6. 浮动小窗口播放YouTube视频
// script.js - 完整浮动YouTube视频实现

(function() {
  // 1. 加载 YouTube iframe API
  function loadYouTubeAPI() {
    return new Promise(resolve => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
      }
    });
  }

  // 2. 提取视频ID函数
  function extractVideoId(url) {
    const regex = /(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/;
    const m = url.match(regex);
    return m ? m[1] : '';
  }

  // 3. 创建浮动窗口及拖拽功能
  let floatBox = null;
  let floatPlayer = null;
  let currentFloatSrc = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function createFloatBox(videoSrc) {
    if (floatBox) return;

    floatBox = document.createElement('div');
    floatBox.style.position = 'fixed';
    floatBox.style.width = '320px';
    floatBox.style.height = '180px';
    floatBox.style.bottom = '10px';
    floatBox.style.right = '10px';
    floatBox.style.backgroundColor = '#000';
    floatBox.style.border = '1px solid #444';
    floatBox.style.borderRadius = '6px';
    floatBox.style.zIndex = '9999';
    floatBox.style.display = 'flex';
    floatBox.style.flexDirection = 'column';
    floatBox.style.cursor = 'move';
    floatBox.style.userSelect = 'none';

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

  // 4. 检测iframe是否完全出视口
  function isIframeOutOfView(iframe) {
    const rect = iframe.getBoundingClientRect();
    return rect.bottom < 0 || rect.top > window.innerHeight;
  }

  // 5. 监控播放状态和滚动，控制浮动窗口显示隐藏
  async function setupFloatingYouTube() {
    await loadYouTubeAPI();

    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"]'));

    iframes.forEach(iframe => {
      if (!iframe.src.includes('enablejsapi=1')) {
        const sep = iframe.src.includes('?') ? '&' : '?';
        iframe.src += sep + 'enablejsapi=1';
      }
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
      players.set(iframe, -1);
    });

    function updateFloatForIframe(iframe) {
      const state = players.get(iframe);
      if (state === 1 && isIframeOutOfView(iframe)) {
        // 播放中且出视口，显示浮动
        if (!floatBox || currentFloatSrc !== iframe.src) {
          createFloatBox(iframe.src);
        }
      } else {
        // 不满足条件关闭浮动窗口
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

  document.addEventListener('DOMContentLoaded', () => {
    setupFloatingYouTube();
  });
})();

// 7. 页面初始化入口
async function init() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  // 生成目录和章节内容
  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');

  chapterData.chapters.forEach(ch => {
    // 目录
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    // 章节标题
    const title = document.createElement('h2');
    title.id = ch.id;
    title.textContent = ch.title;
    chapters.appendChild(title);

    ch.paragraphs.forEach(item => {
      if (typeof item === 'string') {
        const para = document.createElement('p');
        para.innerHTML = renderMarkdownWithTooltips(item, tooltipData);
        chapters.appendChild(para);
      } else if (item.video) {
        const videoUrl = item.video;
        const iframe = document.createElement('iframe');
        iframe.width = '560';
        iframe.height = '315';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        if (videoUrl.includes('youtu.be')) {
          const videoId = videoUrl.split('/').pop().split('?')[0];
          iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
        } else if (videoUrl.includes('youtube.com/watch')) {
          const urlParams = new URLSearchParams(videoUrl.split('?')[1]);
          const videoId = urlParams.get('v');
          iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
        } else {
          iframe.src = videoUrl; // 其他链接直接用
        }
        chapters.appendChild(iframe);
      }
    });
  });

  // 绑定tooltip点击事件
  setupTooltips(tooltipData);

  // 视频自动暂停
  setupVideoAutoPause();

  // 浮动视频
  setupFloatingYouTube();
}

document.addEventListener('DOMContentLoaded', init);