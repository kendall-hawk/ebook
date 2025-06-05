async function loadJSON(url) {
  const res = await fetch(url);
  return res.json();
}

function createWordElements() {
  const words = document.querySelectorAll('.word');

  words.forEach(word => {
    word.addEventListener('click', e => {
      e.stopPropagation();

      const id = word.dataset.tooltipId;
      const tooltip = document.getElementById(id);

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
}

document.addEventListener('click', () => {
  document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
});

async function init() {
  const chapters = await loadJSON('data/chapters.json');
  const tooltips = await loadJSON('data/tooltips.json');

  // Render TOC
  const toc = document.getElementById('toc');
  chapters.forEach(ch => {
    const a = document.createElement('a');
    a.href = `#${ch.id}`;
    a.textContent = ch.title;
    toc.appendChild(a);
  });

  // Render chapters
  const chaptersDiv = document.getElementById('chapters');
  chapters.forEach(ch => {
    const section = document.createElement('section');
    section.id = ch.id;
    section.innerHTML = `<h2>${ch.title}</h2>${ch.content}<a class="back-link" href="#top">🔙 Back to Table of Contents</a>`;
    chaptersDiv.appendChild(section);
  });

  // Render tooltips
  const tooltipsDiv = document.getElementById('tooltips');
  tooltips.forEach(tp => {
    const div = document.createElement('div');
    div.className = 'tooltip';
    div.id = tp.id;
    div.innerHTML = `<strong>${tp.title}</strong>: ${tp.description}<br><br><audio controls src="${tp.audio}" preload="none"></audio>`;
    tooltipsDiv.appendChild(div);
  });

  createWordElements();
}

init();