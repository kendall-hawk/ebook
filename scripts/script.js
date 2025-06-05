let tooltip = document.getElementById('tooltip');
let wordData = {};

// Load JSON data
fetch('data/data.json')
  .then(response => response.json())
  .then(data => {
    wordData = data;

    // Add event listeners to words
    document.querySelectorAll('.word').forEach(word => {
      word.addEventListener('click', e => {
        e.stopPropagation();
        const key = word.dataset.word;
        const entry = wordData[key];

        if (!entry) return;

        tooltip.innerHTML = `
          <strong>${key}</strong>: ${entry.definition}<br><br>
          <audio controls src="${entry.audio}" preload="none"></audio>
        `;

        const rect = word.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.top = `${window.scrollY + rect.bottom + 6}px`;
        tooltip.style.left = `${window.scrollX + rect.left}px`;
      });
    });
  });

// Hide tooltip when clicking elsewhere
document.addEventListener('click', () => {
  tooltip.style.display = 'none';
});