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
      // Toggle display
      document.querySelectorAll('.tooltip').forEach(t => { if (t !== tooltip) t.style.display = 'none'; });
      if (tooltip.style.display === 'block') {
        tooltip.style.display = 'none';
      } else {
        tooltip.style.display = 'block';
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

// Auto pause other YouTube iframes
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
      <div class="video-header">
        <span class="close-btn">×</span>
        <span class="resize-btn">⤢</span>
      </div>
      <iframe src="${src}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>
    `;
    document.body.appendChild(floatContainer);

    const header = floatContainer.querySelector('.video-header');
    header.addEventListener('mousedown', e => {
      isDragging = true;
      offsetX = e.clientX - floatContainer.offsetLeft;
      offsetY = e.clientY - floatContainer.offsetTop;
    });
    document.addEventListener('mousemove', e => {
      if (isDragging) {
        floatContainer.style.left = `${e.clientX - offsetX}px`;
        floatContainer.style.top = `${e.clientY - offsetY}px`;
      }
    });
    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      // Auto snap to edges
      const containerWidth = floatContainer.offsetWidth;
      const containerHeight = floatContainer.offsetHeight;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const left = floatContainer.offsetLeft;
      const top = floatContainer.offsetTop;
      if (left + containerWidth / 2 < windowWidth / 2) {
        floatContainer.style.left = '10px';
      } else {
        floatContainer.style.left = `${windowWidth - containerWidth - 10}px`;
      }
      if (top < 10) {
        floatContainer.style.top = '10px';
      } else if (top + containerHeight > windowHeight - 10) {
        floatContainer.style.top = `${windowHeight - containerHeight - 10}px`;
      }
    });
    floatContainer.querySelector('.close-btn').addEventListener('click', () => {
      floatContainer.remove();
      floatContainer = null;
    });
    const resizeBtn = floatContainer.querySelector('.resize-btn');
    let isLarge = false;
    resizeBtn.addEventListener('click', () => {
      isLarge = !isLarge;
      floatContainer.classList.toggle('large', isLarge);
    });
  }

  window.addEventListener('scroll', () => {
    videos.forEach(iframe => {
      const rect = iframe.getBoundingClientRect();
      if (rect.bottom < 0 && !floatContainer) {
        createFloatingVideo(iframe.src);
        currentVideo = iframe;
      }
    });
    if (currentVideo && floatContainer) {
      const rect = currentVideo.getBoundingClientRect();
      if (rect.top > 0 && rect.bottom < window.innerHeight) {
        floatContainer.remove();
        floatContainer = null;
      }
    }
  });
}

// Main init
async function init() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');
  const tooltipContainer = document.getElementById('tooltips');

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