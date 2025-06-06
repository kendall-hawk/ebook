// === 原有代码部分 ===

// 加载提示词数据
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// 加载章节数据
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// Markdown转HTML并包裹提示词
function renderMarkdownWithTooltips(md, tooltipData) {
  const tooltipWords = Object.keys(tooltipData);
  const wordPattern = /\b\w+\b/g;

  const markedWithSpan = md.replace(wordPattern, (match) => {
    const lower = match.toLowerCase();
    return tooltipWords.includes(lower)
      ? `<span data-word="${lower}">${match}</span>`
      : match;
  });

  const html = marked.parse(markedWithSpan);

  const container = document.createElement('div');
  container.innerHTML = html;

  container.querySelectorAll('span[data-word]').forEach(span => {
    const id = span.dataset.word;
    span.classList.add('word');
    span.setAttribute('data-tooltip-id', id);
    span.removeAttribute('data-word');
  });

  return container.innerHTML;
}

// 设置提示词点击弹窗
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
        let html = `<strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong><br>`;
        if (data.partOfSpeech) html += `<div><strong>Part of Speech:</strong> ${data.partOfSpeech}</div>`;
        if (data.definition) html += `<div><strong>Definition:</strong> ${data.definition}</div>`;
        if (data["Image Description"]) html += `<div><strong>Image Description:</strong> ${data["Image Description"]}</div>`;
        if (data.example) html += `<div><strong>Example:</strong> <em>${data.example}</em></div>`;
        if (data.image) html += `<div><img src="${data.image}" alt="${id}" class="tooltip-image" style="max-width:100%;margin-top:8px;"></div>`;
        tooltip.innerHTML = html;
        tooltip.style.position = 'absolute';
        tooltip.style.display = 'none';
        tooltipContainer.appendChild(tooltip);
      }

      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });

      tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';

      if (tooltip.style.display === 'block') {
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

        tooltip.style.top = `${Math.max(0, top)}px`;
        tooltip.style.left = `${Math.max(0, left)}px`;
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
  });
}

// 设置视频自动暂停（互斥播放）
function setupVideoAutoPause() {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    if (iframe.src.includes('youtube.com/embed')) {
      iframe.addEventListener('load', () => {
        iframe.contentWindow.postMessage('{"event":"listening","id":0}', '*');
      });
    }
  });
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

// === 新增浮动窗口功能整合开始 ===

function setupFloatingVideo() {
  let floatContainer = null;
  let currentVideo = null;
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function createFloatingVideo(iframe) {
    if (floatContainer) return; // 已存在就不重复创建

    floatContainer = document.createElement('div');
    currentVideo = iframe;
    floatContainer.className = 'floating-video';
    floatContainer.style.position = 'fixed';
    floatContainer.style.bottom = '10px';
    floatContainer.style.right = '10px';
    floatContainer.style.width = '320px';
    floatContainer.style.height = '200px';
    floatContainer.style.backgroundColor = '#000';
    floatContainer.style.zIndex = '10000';
    floatContainer.style.border = '1px solid #444';
    floatContainer.style.borderRadius = '6px';
    floatContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.7)';
    floatContainer.style.display = 'flex';
    floatContainer.style.flexDirection = 'column';

    // 头部栏(拖拽+关闭+缩放)
    const header = document.createElement('div');
    header.className = 'video-header';
    header.style.cssText = 'cursor: move; user-select: none; background:#222; color:#fff; padding:4px; display:flex; justify-content: space-between; align-items:center;';
    header.innerHTML = `<span class="close-btn" style="cursor:pointer; font-weight:bold;">×</span><span class="resize-btn" style="cursor:pointer;">⤢</span>`;
    floatContainer.appendChild(header);

    // iframe复制
    const floatIframe = document.createElement('iframe');
    floatIframe.src = iframe.src;
    floatIframe.frameBorder = '0';
    floatIframe.allowFullscreen = true;
    floatIframe.allow = 'autoplay; encrypted-media';
    floatIframe.width = 320;
    floatIframe.height = 180;
    floatIframe.style.flex = '1';
    floatContainer.appendChild(floatIframe);

    document.body.appendChild(floatContainer);

    // 拖拽逻辑
    header.addEventListener('mousedown', e => {
      isDragging = true;
      offsetX = e.clientX - floatContainer.getBoundingClientRect().left;
      offsetY = e.clientY - floatContainer.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
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

    // 关闭按钮
    header.querySelector('.close-btn').addEventListener('click', () => {
      floatContainer.remove();
      floatContainer = null;
      currentVideo = null;
    });

    // 缩放按钮
    const resizeBtn = header.querySelector('.resize-btn');
    let isLarge = false;
    resizeBtn.addEventListener('click', () => {
      isLarge = !isLarge;
      if (isLarge) {
        floatContainer.style.width = '560px';
        floatContainer.style.height = '335px';
        floatIframe.width = 560;
        floatIframe.height = 315;
      } else {
        floatContainer.style.width = '320px';
        floatContainer.style.height = '200px';
        floatIframe.width = 320;
        floatIframe.height = 180;
      }
    });
  }

  function removeFloatingVideo() {
    if (floatContainer) {
      floatContainer.remove();
      floatContainer = null;
      currentVideo = null;
    }
  }

  // 监听YouTube iframe消息，判断播放状态和位置
  window.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'infoDelivery' && data.info && typeof data.info.playerState !== 'undefined') {
        const state = data.info.playerState; // 1=playing, 0=ended, 2=paused
        const iframe = Array.from(document.querySelectorAll('iframe')).find(f => f.contentWindow === event.source);
        if (!iframe) return;
        const rect = iframe.getBoundingClientRect();
        const outOfView = rect.bottom < 0 || rect.top > window.innerHeight;
        const isPlaying = state === 1;
        if (isPlaying && outOfView) {
          if (!floatContainer) createFloatingVideo(iframe);
        } else {
          if (floatContainer && iframe.src === currentVideo?.src) {
            removeFloatingVideo();
          }
        }
      }
    } catch (e) {}
  });
}

// === 初始化入口 ===
async function init() {
  const tooltipData = await loadTooltips();
  const chapters = await loadChapters();

  // 示例：加载第一章内容，渲染带提示词的html
  const chapterContentMarkdown = chapters[0].content;
  const html = renderMarkdownWithTooltips(chapterContentMarkdown, tooltipData);
  document.getElementById('content').innerHTML = html;

  setupTooltips(tooltipData);
  setupVideoAutoPause();

  // 新增浮动视频功能初始化
  setupFloatingVideo();
}

// 页面加载后调用init
window.addEventListener('DOMContentLoaded', init);