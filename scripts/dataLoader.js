// dataLoader.js
export async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

export async function loadChapters() {
  const res = await fetch('data/chapters.json');
  return await res.json();
}
