export async function loadTooltips() {
  const res = await fetch('data/tooltips.json');
  return await res.json();
}

export function setupTooltips(tooltipData) {
  // 保留你已有的绑定逻辑
}