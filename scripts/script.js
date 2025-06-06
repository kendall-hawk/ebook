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
  // Escape special regex chars in words
  const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
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

        // 基本top定位
        let top = window.scrollY + rect.bottom + 6;
        // 计算left，防止溢出右边界
        let left = window.scrollX + rect.left;
        const tooltipWidth = 300; // 估计tooltip宽度（可根据实际调整或动态测量）
        const maxLeft = window.scrollX + window.innerWidth - tooltipWidth - 10; // 右边距10px缓冲
        if (left > maxLeft) left = maxLeft;

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.style.width = tooltipWidth + 'px';
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
      if (!iframe.src.includes('enablejsapi=1')) {
        iframe.src += iframe.src.includes('?') ? '&enablejsapi=1' : '?enablejsapi=1';
      }
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

  window.addEventListener('scroll', () => {
    // 简单示范：当滚动超出第一个视频的位置，显示小悬浮窗
    const firstVideo = videos[0];
    const rect = firstVideo.getBoundingClientRect();

    if (rect.bottom < 0) {
      if (!floatContainer) {
        floatContainer = document.createElement('div');
        floatContainer.id = 'floating-video';
        floatContainer.style.position = 'fixed';
        floatContainer.style.bottom = '10px';
        floatContainer.style.right = '10px';
        floatContainer.style.width = '320px';
        floatContainer.style.height = '180px';
        floatContainer.style.zIndex = 10000;
        floatContainer.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
        floatContainer.style.background = '#000';

        // 复制iframe到浮动窗口
        const clone = firstVideo.cloneNode(true);
        clone.style.width = '100%';
        clone.style.height = '100%';
        floatContainer.appendChild(clone);

        document.body.appendChild(floatContainer);
      }
    } else {
      if (floatContainer) {
        floatContainer.remove();
        floatContainer = null;
      }
    }
  });
}