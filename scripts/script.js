// 加载工具提示数据
async function loadTooltips() {
  const response = await fetch('data/tooltips.json');
  return await response.json();
}

// 加载章节数据
async function loadChapters() {
  const response = await fetch('data/chapters.json');
  return await response.json();
}

function renderMarkdownWithTooltips(markdownText, tooltipData) {
  const tooltipWords = Object.keys(tooltipData);
  const wordPattern = /\b\w+\b/g;

  const processedText = markdownText.replace(wordPattern, (match) => {
    const lowerCaseWord = match.toLowerCase();
    return tooltipWords.includes(lowerCaseWord)
      ? `<span data-tooltip-id="${lowerCaseWord}" class="word">${match}</span>`
      : match;
  });

  // 使用 marked 库将处理后的文本转换为 HTML
  return marked.parse(processedText);
}

function setupTooltips(tooltipData) {
  const tooltipContainer = document.getElementById('tooltips');

  document.querySelectorAll('.word').forEach(wordElement => {
    wordElement.addEventListener('click', event => {
      event.stopPropagation();
      const id = wordElement.dataset.tooltipId;
      let tooltip = document.getElementById('tooltip-' + id);

      if (!tooltip) {
        const data = tooltipData[id];
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip-' + id;
        tooltip.className = 'tooltip';
        tooltip.innerHTML = `
          <strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong><br>
          ${data.partOfSpeech ? `<div><strong>词性:</strong> ${data.partOfSpeech}</div>` : ''}
          ${data.definition ? `<div><strong>定义:</strong> ${data.definition}</div>` : ''}
          ${data["Image Description"] ? `<div><strong>图片描述:</strong> ${data["Image Description"]}</div>` : ''}
          ${data.example ? `<div><strong>例句:</strong> <em>${data.example}</em></div>` : ''}
          ${data.image ? `<img src="${data.image}" alt="${id}" style="max-width:100%; margin-top:8px;">` : ''}
        `;
        tooltip.style.position = 'absolute';
        tooltip.style.display = 'none';
        tooltipContainer.appendChild(tooltip);
      }

      // 隐藏其他工具提示，仅显示当前
      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });

      // 切换显示状态
      if (tooltip.style.display === 'block') {
        tooltip.style.display = 'none';
      } else {
        tooltip.style.display = 'block';
        const rect = wordElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();

        let top = window.scrollY + rect.bottom + 6;
        let left = window.scrollX + rect.left;

        // 防止工具提示超出右边界
        if (left + tooltipRect.width > window.innerWidth) {
          left = window.innerWidth - tooltipRect.width - 10;
        }
        // 防止工具提示超出下边界
        if (top + tooltipRect.height > window.scrollY + window.innerHeight) {
          top = window.scrollY + rect.top - tooltipRect.height - 6;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
      }
    });
  });

  // 点击页面空白处关闭所有工具提示
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => (t.style.display = 'none'));
  });
}

function setupVideoAutoPause() {
  window.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    if (event.data.includes('{"event":"infoDelivery"') && event.data.includes('"info":{"playerState":1')) {
      const playingIframe = event.source;
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow !== playingIframe) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }
  });
}

(function() {
  // 加载 YouTube iframe API
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

  // 提取视频 ID
  function extractVideoId(url) {
    const regex = /(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/;
    const match = url.match(regex);
    return match ? match[1] : '';
  }

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
        <span>浮动视频</span>
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

  function isIframeOutOfView(iframe) {
    const rect = iframe.getBoundingClientRect();
    return rect.bottom < 0 || rect.top > window.innerHeight;
  }

  async function setupFloatingYouTube() {
    await loadYouTubeAPI();

    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"]'));

    iframes.forEach(iframe => {
      if (!iframe.src.includes('enablejsapi=1')) {
        const separator = iframe.src.includes('?') ? '&' : '?';
        iframe.src += separator + 'enablejsapi=1';
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
            if (state === YT.PlayerState.PLAYING && isIframeOutOfView(iframe)) {
        if (currentFloatSrc !== iframe.src) {
          removeFloatBox();
          createFloatBox(iframe.src);
        }
      } else if (state !== YT.PlayerState.PLAYING && currentFloatSrc === iframe.src) {
        removeFloatBox();
      }
    }

    // 滚动事件监听：检查所有 iframe 是否需要浮动
    window.addEventListener('scroll', () => {
      iframes.forEach(iframe => {
        const state = players.get(iframe);
        if (state === YT.PlayerState.PLAYING) {
          updateFloatForIframe(iframe);
        }
      });
    });
  }

  // 初始化
  setupFloatingYouTube();
})();

async function main() {
  const [tooltipData, chapterData] = await Promise.all([
    loadTooltips(),
    loadChapters()
  ]);

  const markdownContent = chapterData[0]?.content || '';
  const htmlContent = renderMarkdownWithTooltips(markdownContent, tooltipData);
  document.getElementById('content').innerHTML = htmlContent;

  setupTooltips(tooltipData);
  setupVideoAutoPause();
}

main();