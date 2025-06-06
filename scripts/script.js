// script.js

// 1. Load tooltip data
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// 2. Load chapter data
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// 3. Render markdown with tooltips
function renderMarkdownWithTooltips(md, tooltipData) {
  const words = Object.keys(tooltipData);
  const pattern = /\b\w+\b/g;
  const html = md.replace(pattern, (word) => {
    const lower = word.toLowerCase();
    return words.includes(lower)
      ? `<span class="word" data-tooltip-id="${lower}">${word}</span>`
      : word;
  });
  return marked.parse(html);
}

// 4. Setup tooltips
function setupTooltips(tooltipData) {
  const container = document.getElementById('tooltips');
  document.querySelectorAll('.word').forEach(word => {
    word.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      let tip = document.getElementById('tooltip-' + id);

      // Create tooltip if not exist
      if (!tip) {
        const data = tooltipData[id];
        tip = document.createElement('div');
        tip.id = 'tooltip-' + id;
        tip.className = 'tooltip';
        tip.innerHTML = `
          <strong>${id}</strong><br>
          ${data.partOfSpeech ? `<div><strong>Part of Speech:</strong> ${data.partOfSpeech}</div>` : ''}
          ${data.definition ? `<div><strong>Definition:</strong> ${data.definition}</div>` : ''}
          ${data["Image Description"] ? `<div><strong>Image Description:</strong> ${data["Image Description"]}</div>` : ''}
          ${data.example ? `<div><strong>Example:</strong> <em>${data.example}</em></div>` : ''}
          ${data.image ? `<img src="${data.image}" alt="${id}" style="max-width:100%; margin-top:8px;">` : ''}
        `;
        tip.style.position = 'absolute';
        tip.style.display = 'none';
        container.appendChild(tip);
      }

      // Hide others
      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tip) t.style.display = 'none';
      });

      // Toggle tooltip
      if (tip.style.display === 'block') {
        tip.style.display = 'none';
      } else {
        tip.style.display = 'block';
        const rect = word.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        let top = window.scrollY + rect.bottom + 6;
        let left = window.scrollX + rect.left;

        if (left + tipRect.width > window.innerWidth) {
          left = window.innerWidth - tipRect.width - 10;
        }
        if (top + tipRect.height > window.scrollY + window.innerHeight) {
          top = window.scrollY + rect.top - tipRect.height - 6;
        }

        tip.style.top = `${top}px`;
        tip.style.left = `${left}px`;
      }
    });
  });

  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => (t.style.display = 'none'));
  });
}

// 5. Pause all other YouTube videos
function setupVideoAutoPause() {
  window.addEventListener('message', (e) => {
    if (typeof e.data !== 'string') return;
    if (e.data.includes('"playerState":1')) {
      const active = e.source;
      document.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.contentWindow !== active) {
          iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      });
    }
  });
}

// 6. Floating YouTube player
(function () {
  let floatBox = null, floatPlayer = null, currentSrc = null;
  let dragging = false, offsetX = 0, offsetY = 0;

  function loadYouTubeAPI() {
    return new Promise(resolve => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = resolve;
      }
    });
  }

  function extractId(url) {
    const match = url.match(/(?:embed\/|watch\?v=|youtu\.be\/)([^&?/]+)/);
    return match ? match[1] : '';
  }

  function createFloatBox(videoUrl) {
    if (floatBox) return;
    floatBox = document.createElement('div');
    floatBox.style.cssText = `
      position:fixed;width:320px;height:180px;bottom:10px;right:10px;
      background:#000;border:1px solid #444;border-radius:6px;z-index:9999;
      display:flex;flex-direction:column;cursor:move;user-select:none;
    `;
    floatBox.innerHTML = `
      <div style="background:#222;color:#fff;padding:4px;display:flex;justify-content:space-between;align-items:center;">
        <span>Floating Video</span>
        <button style="background:none;border:none;color:#fff;font-size:20px;cursor:pointer;">×</button>
      </div>
      <div id="float-player" style="flex-grow:1;"></div>
    `;
    document.body.appendChild(floatBox);

    floatBox.querySelector('button').addEventListener('click', removeFloatBox);

    const header = floatBox.firstElementChild;
    header.addEventListener('mousedown', e => {
      dragging = true;
      offsetX = e.clientX - floatBox.getBoundingClientRect().left;
      offsetY = e.clientY - floatBox.getBoundingClientRect().top;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const left = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - 320));
      const top = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - 180));
      floatBox.style.left = `${left}px`;
      floatBox.style.top = `${top}px`;
      floatBox.style.bottom = 'auto';
      floatBox.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => (dragging = false));

    floatPlayer = new YT.Player('float-player', {
      height: '180',
      width: '320',
      videoId: extractId(videoUrl),
      playerVars: { autoplay: 1 },
      events: { onReady: e => e.target.playVideo() }
    });
    currentSrc = videoUrl;
  }

  function removeFloatBox() {
    if (floatPlayer) floatPlayer.destroy();
    if (floatBox) floatBox.remove();
    floatBox = null;
    floatPlayer = null;
    currentSrc = null;
  }

  function isOutOfView(el) {
    const rect = el.getBoundingClientRect();
    return rect.bottom < 0 || rect.top > window.innerHeight;
  }

  async function setupFloatingPlayer() {
    await loadYouTubeAPI();

    const iframes = Array.from(document.querySelectorAll('iframe[src*="youtube.com/embed/"]'));
    const players = new Map();

    iframes.forEach(iframe => {
      if (!iframe.src.includes('enablejsapi=1')) {
        iframe.src += (iframe.src.includes('?') ? '&' : '?') + 'enablejsapi=1';
      }

      const player = new YT.Player(iframe, {
        events: {
          onStateChange: (e) => {
            players.set(iframe, e.data);
            updateFloat(iframe, e.data);
          }
        }
      });
      players.set(iframe, -1);
    });

    function updateFloat(iframe, state) {
      if (state === 1 && isOutOfView(iframe)) {
        if (!floatBox || currentSrc !== iframe.src) {
          createFloatBox(iframe.src);
        }
      } else {
        if (floatBox && currentSrc === iframe.src) {
          removeFloatBox();
        }
      }
    }

    window.addEventListener('scroll', () => {
      players.forEach((state, iframe) => updateFloat(iframe, state));
    });

    window.addEventListener('resize', () => {
      if (!floatBox) return;
      const left = parseInt(floatBox.style.left || '10');
      const top = parseInt(floatBox.style.top || '10');
      floatBox.style.left = Math.min(left, window.innerWidth - 320) + 'px';
      floatBox.style.top = Math.min(top, window.innerHeight - 180) + 'px';
    });
  }

  document.addEventListener('DOMContentLoaded', setupFloatingPlayer);
})();

// 7. Initialize page
async function init() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();
  const toc = document.getElementById('toc');
  const content = document.getElementById('chapters');

  chapterData.chapters.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    const h2 = document.createElement('h2');
    h2.id = ch.id;
    h2.textContent = ch.title;
    content.appendChild(h2);

    ch.paragraphs.forEach(p => {
      if (typeof p === 'string') {
        const para = document.createElement('p');
        para.innerHTML = renderMarkdownWithTooltips(p, tooltipData);
        content.appendChild(para);
      } else if (p.video) {
        const wrapper = document.createElement('div');
        wrapper.style = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;max-width:100%;';
        const iframe = document.createElement('iframe');
        iframe.style = 'position:absolute;top:0;left:0;width:100%;height:100%;';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        const videoId = extractId(p.video);
        iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
        wrapper.appendChild(iframe);
        content.appendChild(wrapper);
      }
    });
  });

  setupTooltips(tooltipData);
  setupVideoAutoPause();
}

// Run
init();