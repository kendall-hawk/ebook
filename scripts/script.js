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
function setupFloatingVideo() {
  let floatContainer = null;
  let currentVideoSrc = null;
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  function createFloatingVideo(iframe) {
    if (floatContainer) return;
    currentVideoSrc = iframe.src;

    floatContainer = document.createElement('div');
    floatContainer.className = 'floating-video';
    floatContainer.style.position = 'fixed';
    floatContainer.style.bottom = '10px';
    floatContainer.style.right = '10px';
    floatContainer.style.width = '320px';
    floatContainer.style.height = '200px';
    floatContainer.style.backgroundColor = '#000';
    floatContainer.style.border = '1px solid #444';
    floatContainer.style.borderRadius = '6px';
    floatContainer.style.zIndex = '10000';
    floatContainer.style.display = 'flex';
    floatContainer.style.flexDirection = 'column';

    floatContainer.innerHTML = `
      <div class="header" style="background:#222; color:#fff; cursor: move; padding: 4px; display: flex; justify-content: space-between; user-select:none;">
        <span>Floating Video</span>
        <span style="cursor:pointer;" id="close-float">×</span>
      </div>
      <iframe src="${currentVideoSrc}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" width="320" height="180"></iframe>
    `;

    document.body.appendChild(floatContainer);

    const header = floatContainer.querySelector('.header');
    const closeBtn = floatContainer.querySelector('#close-float');

    header.addEventListener('mousedown', e => {
      isDragging = true;
      dragOffsetX = e.clientX - floatContainer.getBoundingClientRect().left;
      dragOffsetY = e.clientY - floatContainer.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      let left = e.clientX - dragOffsetX;
      let top = e.clientY - dragOffsetY;
      const maxLeft = window.innerWidth - floatContainer.offsetWidth;
      const maxTop = window.innerHeight - floatContainer.offsetHeight;
      left = Math.min(Math.max(0, left), maxLeft);
      top = Math.min(Math.max(0, top), maxTop);
      floatContainer.style.left = left + 'px';
      floatContainer.style.top = top + 'px';
      floatContainer.style.bottom = 'auto';
      floatContainer.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    closeBtn.addEventListener('click', () => {
      floatContainer.remove();
      floatContainer = null;
      currentVideoSrc = null;
    });
  }

  function removeFloatingVideo() {
    if (floatContainer) {
      floatContainer.remove();
      floatContainer = null;
      currentVideoSrc = null;
    }
  }

  const videoStates = new Map();

  window.addEventListener('message', e => {
    if (typeof e.data !== 'string') return;
    try {
      const data = JSON.parse(e.data);
      if (data.event === 'infoDelivery' && data.info && typeof data.info.playerState !== 'undefined') {
        const iframe = Array.from(document.querySelectorAll('iframe')).find(f => f.contentWindow === e.source);
        if (!iframe) return;
        const state = data.info.playerState;
        videoStates.set(iframe, state);
        checkFloatingCondition(iframe, state);
      }
    } catch (err) {}
  });

  function checkFloatingCondition(iframe, state) {
    const rect = iframe.getBoundingClientRect();
    const outOfView = rect.bottom < 0 || rect.top > window.innerHeight;
    const isPlaying = state === 1;
    if (isPlaying && outOfView) {
      if (!floatContainer) createFloatingVideo(iframe);
    } else if (floatContainer && iframe.src === currentVideoSrc) {
      removeFloatingVideo();
    }
  }

  window.addEventListener('scroll', () => {
    videoStates.forEach((state, iframe) => {
      checkFloatingCondition(iframe, state);
    });
  });
}

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
  setupFloatingVideo();
}

document.addEventListener('DOMContentLoaded', init);