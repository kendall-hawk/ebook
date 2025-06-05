Promise.all([
  fetch('data/chapters.json').then(res => res.json()),
  fetch('data/tooltips.json').then(res => res.json())
]).then(([chapterData, tooltipData]) => {
  const toc = document.getElementById('toc');
  const chaptersContainer = document.getElementById('chapters');
  const tooltipsContainer = document.getElementById('tooltips');

  // Render chapters and TOC
  chapterData.chapters.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    const chapterEl = document.createElement('div');
    chapterEl.id = ch.id;

    const title = document.createElement('h2');
    title.innerHTML = ch.title;

    const toggle = document.createElement('div');
    toggle.className = 'toggle-btn';
    toggle.textContent = '[ Show / Hide ]';
    toggle.onclick = () => {
      content.style.display = content.style.display === 'none' ? 'block' : 'none';
    };

    const content = document.createElement('div');
    content.className = 'chapter-content';
    ch.paragraphs.forEach(p => {
      const para = document.createElement('p');
      para.innerHTML = p;
      content.appendChild(para);
    });

    chapterEl.appendChild(title);
    chapterEl.appendChild(toggle);
    chapterEl.appendChild(content);
    chaptersContainer.appendChild(chapterEl);
  });

  // Render tooltips
  for (const [id, data] of Object.entries(tooltipData)) {
    const tip = document.createElement('div');
    tip.id = `tooltip-${id}`;
    tip.className = 'tooltip';
    tip.innerHTML = `<strong>${id}</strong>: ${data.text}<br><br>
      <audio controls src="${data.audio}" preload="none"></audio>`;
    tooltipsContainer.appendChild(tip);
  }

  // Tooltip event
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip').forEach(t => t.style.display = 'none');
  });

  document.addEventListener('click', e => {
    if (e.target.classList.contains('word')) {
      e.stopPropagation();
      const id = e.target.dataset.tooltipId;
      const tooltip = document.getElementById(`tooltip-${id}`);
      document.querySelectorAll('.tooltip').forEach(t => {
        if (t !== tooltip) t.style.display = 'none';
      });

      if (tooltip.style.display === 'block') {
        tooltip.style.display = 'none';
      } else {
        const rect = e.target.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.top = `${window.scrollY + rect.bottom + 6}px`;
        tooltip.style.left = `${window.scrollX + rect.left}px`;
      }
    }
  });
});