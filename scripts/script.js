// script.js

// --- Helper Functions ---

// 优化后的函数：确保 YouTube URL 包含 enablejsapi=1 参数，且只添加一次
function ensureEnableJsApi(videoUrl) {
  try {
    const url = new URL(videoUrl);
    const params = new URLSearchParams(url.search);
    if (!params.has('enablejsapi')) {
      params.append('enablejsapi', '1');
      url.search = params.toString();
    }
    return url.toString();
  } catch (e) {
    console.error('无效的视频URL:', videoUrl, e);
    return videoUrl; // 返回原始URL或进行其他错误处理
  }
}

function extractVideoId(url) {
  // 正则表达式可匹配多种YouTube链接格式
  const regex = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([^&?/]+)/;
  const m = url.match(regex);
  return m ? m[1] : '';
}

// --- Core Functions ---

// 1. 加载tooltip数据
async function loadTooltips() {
  try {
    const res = await fetch('data/tooltips.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('加载 tooltips 数据失败:', error);
    return {}; // 返回空对象以避免后续错误
  }
}

// 2. 加载章节数据
async function loadChapters() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('加载 chapters 数据失败:', error);
    return { chapters: [] }; // 返回空数组以避免后续错误
  }
}

// 3. 用tooltip包装关键词，渲染markdown
function renderMarkdownWithTooltips(md, tooltipData) {
  const tooltipWords = Object.keys(tooltipData);
  const wordPattern = /\b\w+\b/g;
  // 这里原代码直接替换单词，导致原单词大小写被替换为小写，改为保留原词显示
  const markedWithSpan = md.replace(wordPattern, (match) => {
    const lower = match.toLowerCase();
    return tooltipWords.includes(lower)
      ? `<span data-tooltip-id="${lower}" class="word">${match}</span>` // 保留原单词显示
      : match;
  });

  // 使用marked库渲染Markdown
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
        // 使用模板字面量优化HTML字符串构建
        tooltip = document.createElement('div');
        tooltip.id = `tooltip-${id}`;
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

      // 隐藏其它tooltip，只显示当前
      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });

      // 切换显示隐藏
      if (tooltip.style.display === 'block') {
        tooltip.style.display = 'none';
      } else {
        tooltip.style.display = 'block';
        const rect = word.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = window.scrollY + rect.bottom + 6;
        let left = window.scrollX + rect.left;

        // 防止浮窗超出右边界
        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 10;
        }
        // 防止浮窗超出下边界
        if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
          top = window.scrollY + rect.top - tooltipRect.height - 6;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      }
    });
  });

  // 点击页面空白处关闭所有tooltip
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => (t.style.display = 'none'));
  });
}

// 5. YouTube视频自动暂停
function setupVideoAutoPause() {
  window.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return;
    // 检查消息是否来自YouTube播放器，并且是播放状态 (playerState: 1)
    if (e.data.includes('{"event":"infoDelivery"') && e.data.includes('"info":{"playerState":1')) {
      const playingIframe = e.source;
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow !== playingIframe) {
          // 向非当前播放的iframe发送暂停命令
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }
  });
}

// 6. 浮动小窗口播放YouTube视频
(function() {
  // 1. 加载 YouTube iframe API
  function loadYouTubeAPI() {
    return new Promise(resolve => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        const tag = document.createElement('script');
        // 修正 YouTube API URL
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
      }
    });
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
        <button id="float-close" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer;">&times;</button>
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

    // 筛选出所有YouTube iframe，并确保它们有 enablejsapi=1
    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"], iframe[src*="youtube.com/watch?v="], iframe[src*="youtu.be/"]'))
      .map(iframe => {
        // 使用辅助函数确保 enablejsapi=1 已添加
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
      // YT.PlayerState.PLAYING (1)
      if (state === 1 && isIframeOutOfView(iframe)) {
        // 播放中且出视口，显示浮动
        if (!floatBox || currentFloatSrc !== iframe.src) {
          createFloatBox(iframe.src);
        }
      } else {
        // 不满足条件或停止播放，关闭浮动窗口
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
    // setupFloatingYouTube() 在 init 中调用，不需要在这里重复调用
  });
})();

// 7. 页面初始化入口
async function init() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');

  chapterData.chapters.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

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
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.paddingBottom = '56.25%'; // 16:9 aspect ratio
        wrapper.style.height = '0';
        wrapper.style.overflow = 'hidden';
        wrapper.style.maxWidth = '100%';

        const iframe = document.createElement('iframe');
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

        // 使用统一的 ensureEnableJsApi 处理函数和 extractVideoId
        // 假设 item.video 已经是完整的 YouTube URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID)
        // 或者是一个嵌入 URL (e.g., https://www.youtube.com/embed/VIDEO_ID)
        const videoId = extractVideoId(videoUrl);
        if (videoId) {
            iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`);
        } else {
            // 如果无法提取ID，则尝试使用原始URL，但可能会缺少JS API
            iframe.src = ensureEnableJsApi(videoUrl);
        }

        wrapper.appendChild(iframe);
        chapters.appendChild(wrapper);
      }
    });
  });

  // 绑定tooltip点击事件
  setupTooltips(tooltipData);

  // 视频自动暂停
  setupVideoAutoPause();

  // 浮动视频
  setupFloatingYouTube(); // 确保浮动视频被调用
}

document.addEventListener('DOMContentLoaded', init);
