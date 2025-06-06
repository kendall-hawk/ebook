export async function loadTooltips() {
  const res = await fetch('/data/tooltips.json');
  if (!res.ok) throw new Error('Failed to load tooltips');
  return await res.json();
}

export function setupTooltips(tooltipData) {
  const instances = [];
  document.querySelectorAll('.word').forEach(el => {
    const id = el.dataset.tooltipId;
    const content = tooltipData[id?.toLowerCase()];
    if (content) {
      const instance = tippy(el, {
        content,
        allowHTML: true,
        theme: 'light-border',
      });
      instances.push(instance);
    }
  });
  return instances;
}