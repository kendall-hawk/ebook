// === 工具提示 & Markdown 渲染 ===

async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

function renderMarkdownWithTooltips(md, tooltipData) {
  const html = marked.parse(md);
  const words = Object.keys(tooltipData);
  if (words.length === 0) return html;
  const regex = new RegExp(`\\b(${words.join('|')})\\b`, 'gi');
  return html.replace(regex, (match) => {
    const wordId = match.toLowerCase();
    return `<span class="word" data-tooltip-id="${wordId}">${match}</span>`;
  });
}

function setupTooltips(tooltipData) {
  const container = document.getElementById('tooltips');

  document.querySelectorAll('.word').forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      let tooltip = document.getElementById('tooltip-' + id);

      // 关闭所有tooltip
      document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');

      if (tooltip) {
        tooltip.style.display = 'block';
      } else {
        const data = tooltipData[id];
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip-' + id;
        tooltip.className = 'tooltip';
        let html = `<strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong><br>`;
        if (data.partOfSpeech) html += `<div><b>Part of Speech:</b> ${data.partOfSpeech}</div>`;
        if (data.definition) html += `<div><b>Definition:</b> ${data.definition}</div>`;
        if (data["Image Description"]) html += `<div><b>Image Description:</b> ${data["Image Description"]}</div>`;
        if (data.example) html += `<div><b>Example:</b> <em>${data.example}</em></div>`;
        if (data.image) html += `<div><img src="${data.image}" alt="${id}" style="max-width:100%;margin-top:8px;"></div>`;

        tooltip.innerHTML = html;
        container.appendChild(tooltip);

        // 位置定位
        const rect = word.getBoundingClientRect();
        tooltip.style.position = 'absolute';
        tooltip.style.top = `${window.scrollY + rect.bottom + 6}px`;
        tooltip.style.left = `${window.scrollX + rect.left}px`;
        tooltip.style.display = 'block';
      }
    });
  });

  // 点击空白关闭所有tooltip
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
  });
}

// === YouTube URL转嵌入格式 ===

function convertYouTubeToEmbedUrl(url) {
  let videoId = '';
  if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1].split('?')[0];
  } else if (url.includes('youtube.com/watch')) {
    const params = new URLSearchParams(url.split('?')[1]);
    videoId = params.get('v');
  } else if (url.includes('youtube.com/embed/')) {
    if (!url.includes('enablejsapi=1')) {
      return url.includes('?') ? `${url}&enablejsapi=1` : `${url}?enablejsapi=1`;
    }
    return url;
  }
  if (videoId) {
    return `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
  }
  return '';
}

// === 浮动视频播放器及逻辑 ===

(function setupFloatingVideo() {
  let floatContainer = null;
  let currentVideo = null;
  let originalParent = null;
  let originalNextSibling = null;
  let isDragging = false;
  let offsetX = 0, offsetY = 0;
  let isLarge = false;

  function isInViewport(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function createFloatContainer() {
    if (floatContainer) return;

    floatContainer = document.createElement('div');
    floatContainer.className = 'floating-video';
    Object.assign(floatContainer.style, {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      width: '320px',
      height: '180px',
      backgroundColor: '#000',
      zIndex: '10000',
      border: '1px solid #444',
      borderRadius: '6px',
      display: 'flex',
      flexDirection: 'column',
    });

    const header = document.createElement('div');
    header.className = 'video-header';
    Object.assign(header.style, {
      cursor: 'move',
      userSelect: 'none',
      background: '#222',
      color: '#fff',
      padding: '4px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '14px',
    });

    const closeBtn = document.createElement('span');
    closeBtn.textContent = '×';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontWeight = 'bold';

    const resizeBtn = document.createElement('span');
    resizeBtn.textContent = '⤢';
    resizeBtn.style.cursor = 'pointer';

    header.appendChild(closeBtn);
    header.appendChild(resizeBtn);
    floatContainer.appendChild(header);
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
      left = Math.max(0, Math.min(left, window.innerWidth - floatContainer.offsetWidth));
      top = Math.max(0, Math.min(top, window.innerHeight - floatContainer.offsetHeight));
      floatContainer.style.left = left + 'px';
      floatContainer.style.top = top + 'px';
      floatContainer.style.bottom = 'auto';
      floatContainer.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; });

    // 关闭按钮
    closeBtn.addEventListener('click', () => {
      restoreVideo();
      removeFloatContainer();
    });

    // 放大缩小
    resizeBtn.addEventListener('click', () => {
      if (!currentVideo) return;
      isLarge = !isLarge;
      if (isLarge) {
        floatContainer.style.width = '560px';
        floatContainer.style.height = '315px';
        currentVideo.width = '560';
        currentVideo.height = '315';
      } else {
        floatContainer.style.width = '320px';
        floatContainer.style.height = '180px';
        currentVideo.width = '320';
        currentVideo.height = '180';
      }
    });
  }

  function removeFloatContainer() {
    if (!floatContainer) return;
    floatContainer.remove();
    floatContainer = null;
  }

  function moveVideoToFloat(video) {
    if (floatContainer) return;
    currentVideo = video;
    originalParent = video.parentNode;
    originalNextSibling = video.nextSibling;

    createFloatContainer();
    floatContainer.appendChild(video);
    video.style.width = '320px';
    video.style.height = '180px';
  }

  function restoreVideo() {
    if (!currentVideo || !originalParent) return;
    if (originalNextSibling) originalParent.insertBefore(currentVideo, originalNextSibling);
    else originalParent.appendChild(currentVideo);
    currentVideo.style.width = '560px';
    currentVideo.style.height = '315px';

    currentVideo = null;
    originalParent = null;
    originalNextSibling = null;
  }

  // 监听滚动，浮动和还原视频
  window.addEventListener('scroll', () => {
    if (!currentVideo) return;
    if (isInViewport(currentVideo)) {
      restoreVideo();
      removeFloatContainer();
    } else {
      if (!floatContainer) moveVideoToFloat(currentVideo);
    }
  });

  // 监听所有 iframe 的 YouTube 播放状态
  window.addEventListener('message', e => {
    if (typeof e.data !== 'string') return;

    if (e.data.includes('"playerState":1')) {
      // 其他视频暂停
      const playingIframe = e.source.frameElement;
      if (!playingIframe) return;

      // 如果当前有浮动视频且不是同一个，先还原
      if (currentVideo && currentVideo !== playingIframe) {
        restoreVideo();
        removeFloatContainer();
        currentVideo = null;
      }
      currentVideo = playingIframe;
      if (!isInViewport(currentVideo)) moveVideoToFloat(currentVideo);

      // 暂停其他 iframe 里的视频
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe === currentVideo) return;
        iframe.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      });
    }
  });

})();