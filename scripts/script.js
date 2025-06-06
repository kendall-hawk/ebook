// --- Load tooltip data ---
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// --- Load chapter data ---
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// --- Convert Markdown to HTML and wrap tooltip words ---
function renderMarkdownWithTooltips(md, tooltipData) {
  const html = marked.parse(md);
  const words = Object.keys(tooltipData);
  const escapedWords = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedWords.join('|')})\\b`, 'gi');
  return html.replace(regex, (match) => {
    const wordId = match.toLowerCase();
    return `<span class="word" data-tooltip-id="${wordId}">${match}</span>`;
  });
}

// --- Setup tooltips behavior ---
function setupTooltips(tooltipData) {
  const tooltipContainer = document.getElementById('tooltips');

  document.querySelectorAll('.word').forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      let tooltip = document.getElementById('tooltip-' + id);

      // Hide all other tooltips
      document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');

      if (tooltip) {
        tooltip.style.display = 'block';
      } else {
        const data = tooltipData[id];
        if (!data) return;
        tooltip = document.createElement('div');
        tooltip.id = 'tooltip-' + id;
        tooltip.className = 'tooltip';

        let html = `<strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong><br>`;
        if (data.partOfSpeech) html += `<div><strong>Part of Speech:</strong> ${data.partOfSpeech}</div>`;
        if (data.definition) html += `<div><strong>Definition:</strong> ${data.definition}</div>`;
        if (data["Image Description"]) html += `<div><strong>Image Description:</strong> ${data["Image Description"]}</div>`;
        if (data.example) html += `<div><strong>Example:</strong> <em>${data.example}</em></div>`;
        if (data.image) html += `<div><img src="${data.image}" alt="${id}" class="tooltip-image"></div>`;

        tooltip.innerHTML = html;
        tooltipContainer.appendChild(tooltip);

        const rect = word.getBoundingClientRect();
        tooltip.style.position = 'absolute';

        let top = window.scrollY + rect.bottom + 6;
        let left = window.scrollX + rect.left;
        const tooltipWidth = 300;
        const maxLeft = window.scrollX + window.innerWidth - tooltipWidth - 10;
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

// --- Convert YouTube URLs to embed URLs ---
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

// --- Setup auto pause for YouTube videos ---
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

// --- Setup floating video window ---
function setupFloatingVideo() {
  const videos = document.querySelectorAll('iframe[src*="youtube.com/embed"]');
  if (!videos.length) return;

  let floatContainer = null;

  window.addEventListener('scroll', () => {
    const firstVideo = videos[0];
    const rect = firstVideo.getBoundingClientRect();

    if (rect.bottom < 0) {
      if (!floatContainer) {
        floatContainer = document.createElement('div');
        floatContainer.id = 'floating-video';

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

// --- Main function ---
async function main() {
  const tooltipData = await loadTooltips();
  const chapters = await loadChapters();

  if (chapters.length > 0) {
    const md = chapters[0].content || '';
    const html = renderMarkdownWithTooltips(md, tooltipData);
    document.getElementById('content').innerHTML = html;
  }

  setupTooltips(tooltipData);
  setupVideoAutoPause();
  setupFloatingVideo();
}

main();