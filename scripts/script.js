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
  return html.replace(/\b([a-zA-Z]+)\b/g, (match) => {
    const word = match.toLowerCase();
    if (words.includes(word)) {
      return `<span class="word" data-tooltip-id="${word}">${match}</span>`;
    }
    return match;
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
        tooltipContainer.appendChild(tooltip);
      }
      document.querySelectorAll('.tooltip').forEach(t => { if (t !== tooltip) t.style.display = 'none'; });
      tooltip.style.display = tooltip.style.display === 'block' ? 'none' : 'block';

      if (tooltip.style.display === 'block') {
        const rect = word.getBoundingClientRect();
        tooltip.style.top = `${window.scrollY + rect.bottom + 6}px`;
        tooltip.style.left = `${window.scrollX + rect.left}px`;
      }
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
  });
}

// Setup auto-pause other YouTube iframes
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

// Setup floating video
function setupFloatingVideo() {
  let floatContainer = null;
  let currentVideo = null;
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  const videoStates = new Map();

  function createFloatingVideo(iframe) {
    if (floatContainer) return;

    floatContainer = document.createElement('div');
    currentVideo = iframe;
    floatContainer.className = 'floating-video';
    floatContainer.innerHTML = `
      <div class="video-header" style="cursor: move; user-select: none; background:#222; color:#fff; padding:4px; display:flex; justify-content: space-between; align-items:center;">
        <span class="close-btn" style="cursor:pointer; font-weight:bold;">×</span>
        <span class="resize-btn" style="cursor:pointer;">⤢</span>
      </div>
      <iframe src="${iframe.src}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media" width="320" height="180"></iframe>
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
        const maxLeft = window.innerWidth - floatContainer.offsetWidth;
        const maxTop = window.innerHeight - floatContainer.offsetHeight;
        left = Math.min(Math.max(0, left), maxLeft);
        top = Math.min(Math.max(0, top), maxTop);
        floatContainer.style.left = left + 'px';
        floatContainer.style.top = top + 'px';
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
      const w = isLarge ? 560 : 320;
      const h = isLarge ? 315 : 180;
      floatContainer.style.width = `${w}px`;
      floatContainer.style.height = `${h + 20}px`;
      const iframe = floatContainer.querySelector('iframe');
      iframe.width = w;
      iframe.height = h;
    });
  }

  function removeFloatingVideo() {
    if (floatContainer) {
      floatContainer.remove();
      floatContainer = null;
      currentVideo = null;
    }
  }

  window.addEventListener('message', (event) => {
    if (typeof event.data !== 'string') return;
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'infoDelivery' && data.info && typeof data.info.playerState !== 'undefined') {
        const state = data.info.playerState;
        const iframe = Array.from(document.querySelectorAll('iframe')).find(f => f.contentWindow === event.source);
        if (iframe) {
          videoStates.set(iframe, state);
          checkFloatingCondition(iframe, state);
        }
      }
    } catch (e) {}
  });

  function checkFloatingCondition(iframe, state) {
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

  window.addEventListener('scroll', () => {
    videoStates.forEach((state, iframe) => {
      checkFloatingCondition(iframe, state);
    });
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

        let videoUrl = item.video;
        let videoId = '';

        if (videoUrl.includes('youtu.be')) {
          videoId = videoUrl.split('/').pop().split('?')[0];
        } else if (videoUrl.includes('youtube.com/watch')) {
          const urlParams = new URLSearchParams(videoUrl.split('?')[1]);
          videoId = urlParams.get('v');
        }

        if (videoId) {
          const iframe = document.createElement('iframe');
          iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
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
}

init().then(setupFloatingVideo);