// Load tooltips
async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

// Load chapters
async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}

// Convert Markdown with tooltip links to HTML
function renderMarkdownWithTooltips(md) {
  const html = marked.parse(md);
  return html.replace(/<a href="tooltip:(.+?)">(.+?)<\/a>/g,
    (_, id, text) => `<span class="word" data-tooltip-id="${id}">${text}</span>`);
}

// Show tooltips
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

// Build page
async function init() {
  const tooltipData = await loadTooltips();
  const chapterData = await loadChapters();

  const toc = document.getElementById('toc');
  const chapters = document.getElementById('chapters');
  const tooltipContainer = document.getElementById('tooltips');

  chapterData.chapters.forEach(ch => {
    // Add TOC entry
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    // Chapter title
    const title = document.createElement('h2');
    title.id = ch.id;
    title.textContent = ch.title;
    chapters.appendChild(title);

// Paragraphs
ch.paragraphs.forEach(item => {
  if (typeof item === 'string') {
    const para = document.createElement('p');
    para.innerHTML = renderMarkdownWithTooltips(item);
    chapters.appendChild(para);
  } else if (item.video) {
    const div = document.createElement('div');
    div.className = 'media-block';

    let videoUrl = item.video;

    // Convert youtu.be to youtube embed link
    if (videoUrl.includes('youtu.be')) {
      const videoId = videoUrl.split('/').pop().split('?')[0];
      videoUrl = `https://www.youtube.com/embed/${videoId}`;
    }

    const iframe = document.createElement('iframe');
    iframe.src = videoUrl;
    iframe.width = '560';
    iframe.height = '315';
    iframe.frameBorder = '0';
    iframe.allowFullscreen = true;

    div.appendChild(iframe);
    chapters.appendChild(div);
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

    // Back link
    const back = document.createElement('a');
    back.href = '#top';
    back.className = 'back-link';
    back.textContent = '🔙 Back to Table of Contents';
    chapters.appendChild(back);
  });

  // Tooltips
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