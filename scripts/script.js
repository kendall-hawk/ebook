// 全局播放器列表与计数器
let playerCount = 0;
const allYouTubePlayers = [];

// 加载 tooltip 数据
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// 加载章节数据
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// 将带 tooltip 的 Markdown 转为 HTML
function renderMarkdownWithTooltips(md) {
  const html = marked.parse(md);
  return html.replace(/<a href="tooltip:(.+?)">(.+?)<\/a>/g,
    (_, id, text) => `<span class="word" data-tooltip-id="${id}">${text}</span>`);
}

// 初始化 tooltip 显示
function setupTooltips() {
  const words = document.querySelectorAll('.word');
  words.forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();
      const id = word.dataset.tooltipId;
      const tooltip = document.getElementById('tooltip-' + id);
      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });
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

// 创建 YouTube 播放器
function createYouTubePlayer(videoId, container) {
  const playerId = `youtube-player-${playerCount++}`;
  const div = document.createElement('div');
  div.id = playerId;
  container.appendChild(div);

  const player = new YT.Player(playerId, {
    videoId: videoId,
    events: {
      onStateChange: (event) => {
        if (event.data === 1) { // 播放时
          container.scrollIntoView({ behavior: 'smooth', block: 'center' });
          allYouTubePlayers.forEach(p => {
            if (p !== player && p.pauseVideo) {
              p.pauseVideo();
            }
          });
        }
      }
    }
  });

  allYouTubePlayers.push(player);
}

// 初始化页面
async function init() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');
  const tooltipContainer = document.getElementById('tooltips');

  chapterData.chapters.forEach(ch => {
    // TOC
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    // 标题
    const title = document.createElement('h2');
    title.id = ch.id;
    title.textContent = ch.title;
    chapters.appendChild(title);

    // 内容
    ch.paragraphs.forEach(item => {
      if (typeof item === 'string') {
        const para = document.createElement('p');
        para.innerHTML = renderMarkdownWithTooltips(item);
        chapters.appendChild(para);
      } else if (item.video) {
        const div = document.createElement('div');
        div.className = 'media-block';

        let videoUrl = item.video;
        let videoId = '';

        // 处理 youtu.be 短链接
        if (videoUrl.includes('youtu.be')) {
          videoId = videoUrl.split('/').pop().split('?')[0];
        } else if (videoUrl.includes('youtube.com/watch')) {
          const urlParams = new URLSearchParams(videoUrl.split('?')[1]);
          videoId = urlParams.get('v');
        }

        if (videoId) {
          const playerContainer = document.createElement('div');
          div.appendChild(playerContainer);
          chapters.appendChild(div);

          createYouTubePlayer(videoId, playerContainer);
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

  // tooltip 显示
  for (const id in tooltipData) {
    const div = document.createElement('div');
    div.id = 'tooltip-' + id;
    div.className = 'tooltip';
    div.innerHTML = `
      <strong>${id.charAt(0).toUpperCase() + id.slice(1)}</strong>: ${tooltipData[id].definition}
      <br><br>
      <audio controls src="${tooltipData[id].audio}" preload="none"></audio>
    `;
    tooltipContainer.appendChild(div);
  }

  setupTooltips();
}

init();