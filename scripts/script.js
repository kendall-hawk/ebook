// --- 悬浮视频播放功能代码 START ---

function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return rect.bottom > 0 && rect.top < window.innerHeight;
}

let floatContainer = null;
let currentVideo = null;
let originalParent = null;
let originalNextSibling = null;
let isDragging = false;
let offsetX = 0;
let offsetY = 0;

function createFloatingContainer() {
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
  closeBtn.className = 'close-btn';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.fontWeight = 'bold';
  closeBtn.textContent = '×';

  const resizeBtn = document.createElement('span');
  resizeBtn.className = 'resize-btn';
  resizeBtn.style.cursor = 'pointer';
  resizeBtn.textContent = '⤢';

  header.appendChild(closeBtn);
  header.appendChild(resizeBtn);
  floatContainer.appendChild(header);
  document.body.appendChild(floatContainer);

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    offsetX = e.clientX - floatContainer.getBoundingClientRect().left;
    offsetY = e.clientY - floatContainer.getBoundingClientRect().top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
      left = Math.max(0, Math.min(left, window.innerWidth - floatContainer.offsetWidth));
      top = Math.max(0, Math.min(top, window.innerHeight - floatContainer.offsetHeight));
      floatContainer.style.left = left + 'px';
      floatContainer.style.top = top + 'px';
      floatContainer.style.bottom = 'auto';
      floatContainer.style.right = 'auto';
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  closeBtn.addEventListener('click', () => {
    restoreVideo();
    removeFloatingContainer();
  });

  let isLarge = false;
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

function removeFloatingContainer() {
  if (!floatContainer) return;
  floatContainer.remove();
  floatContainer = null;
}

function moveVideoToFloating(video) {
  if (floatContainer) return;
  currentVideo = video;
  originalParent = video.parentNode;
  originalNextSibling = video.nextSibling;

  createFloatingContainer();

  floatContainer.appendChild(video);
  video.style.width = '320px';
  video.style.height = '180px';
}

function restoreVideo() {
  if (!currentVideo || !originalParent) return;
  if (originalNextSibling) {
    originalParent.insertBefore(currentVideo, originalNextSibling);
  } else {
    originalParent.appendChild(currentVideo);
  }
  currentVideo.style.width = '560px';
  currentVideo.style.height = '315px';

  currentVideo = null;
  originalParent = null;
  originalNextSibling = null;
}

window.addEventListener('scroll', () => {
  if (!currentVideo) return;
  if (isInViewport(currentVideo)) {
    restoreVideo();
    removeFloatingContainer();
  } else {
    if (!floatContainer) {
      moveVideoToFloating(currentVideo);
    }
  }
});

window.addEventListener('message', (e) => {
  if (typeof e.data !== 'string') return;

  if (e.data.includes('"playerState":1')) {
    const playingIframe = e.source.frameElement;
    if (!playingIframe) return;

    if (currentVideo && currentVideo !== playingIframe) {
      restoreVideo();
      removeFloatingContainer();
      currentVideo = null;
    }

    currentVideo = playingIframe;

    if (!isInViewport(currentVideo)) {
      moveVideoToFloating(currentVideo);
    }

    document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(iframe => {
      if (iframe !== currentVideo) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      }
    });
  }

  if (e.data.includes('"playerState":2') || e.data.includes('"playerState":0')) {
    if (currentVideo) {
      restoreVideo();
      removeFloatingContainer();
      currentVideo = null;
    }
  }
});

document.querySelectorAll('iframe[src*="youtube.com/embed"]').forEach(iframe => {
  if (!iframe.src.includes('enablejsapi=1')) {
    iframe.src += (iframe.src.includes('?') ? '&' : '?') + 'enablejsapi=1';
  }
});

// --- 悬浮视频播放功能代码 END ---

你把这两个合一起不行吗？都多少遍了？

// Load tooltip data
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// Load chapter data
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// Convert Markdown to HTML and auto-wrap tooltip words
function renderMarkdownWithTooltips(md, tooltipData) {
  const html = marked.parse(md);
  const words = Object.keys(tooltipData);
  const regex = new RegExp(`\\b(${words.join('|')})\\b`, 'gi');
  return html.replace(regex, (match) => {
    const wordId = match.toLowerCase();
    return `<span class="word" data-tooltip-id="${wordId}">${match}</span>`;
  });
}

// Setup tooltips behavior
function setupTooltips(tooltipData) {
  const tooltipContainer = document.getElementById('tooltips');

  document.querySelectorAll('.word').forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      let tooltip = document.getElementById('tooltip-' + id);

      // Hide all others first
      document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');

      if (tooltip) {
        tooltip.style.display = 'block';
      } else {
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
        tooltipContainer.appendChild(tooltip);

        const rect = word.getBoundingClientRect();
        tooltip.style.position = 'absolute';
        tooltip.style.top = `${window.scrollY + rect.bottom + 6}px`;
        tooltip.style.left = `${window.scrollX + rect.left}px`;
        tooltip.style.display = 'block';
      }
    });
  });

  // Hide tooltips on document click
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
  });
}

// Convert any YouTube URL to embeddable format
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

// Auto pause other YouTube iframes
function setupVideoAutoPause() {
  const iframes = document.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    if (iframe.src.includes('youtube.com/embed')) {
      iframe.src += iframe.src.includes('?') ? '&enablejsapi=1' : '?enablejsapi=1';
    }
  });

  window.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return;

    if (e.data.includes('"playerState":1')) {
      const playingIframe = e.source;
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow !== playingIframe) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }
  });
}

// Floating video small window
function setupFloatingVideo() {
  const videos = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
  if (!videos.length) return;

  let floatContainer = null;
  let currentVideo = null;
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  function createFloatingVideo(src) {
    if (floatContainer) return;

    floatContainer = document.createElement('div');
    floatContainer.className = 'floating-video';
    floatContainer.innerHTML = `
      <div class="video-header" style="cursor: move; user-select: none; background:#222; color:#fff; padding:4px; display:flex; justify-content: space-between; align-items:center;">
        <span class="close-btn" style="cursor:pointer; font-weight:bold;">×</span>
        <span class="resize-btn" style="cursor:pointer;">⤢</span>
      </div>
      <iframe src="${src}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" width="320" height="180"></iframe>
    `;
    floatContainer.style.position = 'fixed';
    floatContainer.style.bottom = '10px';
    floatContainer.style.right = '10px';
    floatContainer.style.width = '320px';
    floatContainer.style.height = '200px';
    floatContainer.style.backgroundColor = '#000';
    floatContainer.style.zIndex = '1000';
    floatContainer.style.border = '1px solid #444';
    floatContainer.style.borderRadius = '6px';
    document.body.appendChild(floatContainer);

    const header = floatContainer.querySelector('.video-header');
    header.addEventListener('mousedown', e => {
      isDragging = true;
      offsetX = e.clientX - floatContainer.getBoundingClientRect().left;
      offsetY = e.clientY - floatContainer.getBoundingClientRect().top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (isDragging) {
        let left = e.clientX - offsetX;
        let top = e.clientY - offsetY;
        floatContainer.style.left = Math.max(0, left) + 'px';
        floatContainer.style.top = Math.max(0, top) + 'px';
        floatContainer.style.bottom = 'auto';
        floatContainer.style.right = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });

    floatContainer.querySelector('.close-btn').addEventListener('click', () => {
      floatContainer.remove();
      floatContainer = null;
      currentVideo = null;
    });

    const resizeBtn = floatContainer.querySelector('.resize-btn');
    let isLarge = false;
    resizeBtn.addEventListener('click', () => {
      isLarge = !isLarge;
      const iframe = floatContainer.querySelector('iframe');
      if (isLarge) {
        floatContainer.style.width = '560px';
        floatContainer.style.height = '315px';
        iframe.width = '560';
        iframe.height = '315';
      } else {
        floatContainer.style.width = '320px';
        floatContainer.style.height = '200px';
        iframe.width = '320';
        iframe.height = '180';
      }
    });
  }

  window.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return;

    if (e.data.includes('"playerState":1')) {
      if (floatContainer) floatContainer.remove();
      floatContainer = null;
      currentVideo = Array.from(videos).find(v => v.contentWindow === e.source);
      if (currentVideo) createFloatingVideo(currentVideo.src);
    }

    if (e.data.includes('"playerState":2') || e.data.includes('"playerState":0')) {
      if (floatContainer) {
        floatContainer.remove();
        floatContainer = null;
        currentVideo = null;
      }
    }
  });

  window.addEventListener('scroll', () => {
    if (!floatContainer || !currentVideo) return;
    const rect = currentVideo.getBoundingClientRect();
    if (rect.bottom >= 0 && rect.top <= window.innerHeight) {
      floatContainer.remove();
      floatContainer = null;
      currentVideo = null;
    }
  });
}

// Main init
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
        const div = document.createElement('div');
        div.className = 'media-block';

        const embedUrl = convertYouTubeToEmbedUrl(item.video);
        if (embedUrl) {
          const iframe = document.createElement('iframe');
          iframe.src = embedUrl;
          iframe.width = '560';
          iframe.height = '315';
          iframe.frameBorder = '0';
          iframe.setAttribute('allowfullscreen', '');
          iframe.setAttribute('allow', 'autoplay; encrypted-media');
          div.appendChild(iframe);
          chapters.appendChild(div);
        }
      } else if (item.audio) {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.src = item.audio;
        chapters.appendChild(audio);
      } else if (item.image) {
        const img = document.createElement('img');
        img.src = item.image;
        img.alt = 'Image';
        img.className = 'media-image';
        chapters.appendChild(img);
      }
    });

    const back = document.createElement('a');
    back.href = '#top';
    back.className = 'back-link';
    back.textContent = '🔙 Back to Table of Contents';
    chapters.appendChild(back);
  });

  setupTooltips(tooltipData);
  setupVideoAutoPause();
  setupFloatingVideo();
}

init();