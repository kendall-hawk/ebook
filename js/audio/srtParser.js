export function parseSRT(srtContent, options = {}) {
  const {
    removeHtml = true,     // 可选：去除 <i> 等标签
    ignoreEmpty = true     // 可选：忽略空字幕
  } = options;

  const entries = [];

  // 去除 UTF-8 BOM
  srtContent = srtContent.replace(/^\uFEFF/, '');

  // 分块：支持 \r\n / \n / \r
  const blocks = srtContent.trim().split(/\r?\n\s*\r?\n/);

  for (const block of blocks) {
    const lines = block.trim().split(/\r?\n/);
    if (lines.length >= 2) {
      const timeLine = lines[1];
      const textLines = lines.slice(2);

      // 合并多行文本
      let text = textLines.join(' ').trim();

      if (removeHtml) {
        text = text.replace(/<\/?[^>]+>/g, ''); // 移除 HTML 标签
      }

      if (ignoreEmpty && text === '') continue;

      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
      const start = parseTimeToSeconds(startStr);
      const end = parseTimeToSeconds(endStr);

      entries.push({ start, end, text });
    }
  }

  return entries;
}

function parseTimeToSeconds(timeStr) {
  const [hours, minutes, rest] = timeStr.split(':');
  const [seconds, milliseconds] = rest.split(',');

  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10) +
    parseInt(milliseconds, 10) / 1000
  );
}