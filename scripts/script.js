// Load vocab data from JSON
let vocabData = {};

fetch('data/data.json')
  .then(response => response.json())
  .then(data => {
    vocabData = data;
  });

const tooltip = document.getElementById('tooltip');

document.querySelectorAll('.word').forEach(word => {
  word.addEventListener('click', (e) => {
    e.stopPropagation();
    const wordKey = word.dataset.word;
    const info = vocabData[wordKey];

    if (!info) return;

    // Fill tooltip
    tooltip.innerHTML = `
      <strong>${wordKey}</strong>: ${info.definition}<br><br>
      <audio controls src="${info.audio}" preload="none"></audio>
    `;

    // Position tooltip
    const rect = word.getBoundingClientRect();
    tooltip.style.top = `${window.scrollY + rect.bottom + 6}px`;
    tooltip.style.left = `${window.scrollX + rect.left}px`;
    tooltip.style.display = 'block';
  });
});

// Hide tooltip when clicking elsewhere
document.addEventListener('click', () => {
  tooltip.style.display = 'none';
});