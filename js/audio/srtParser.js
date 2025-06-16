// js/audio/srtParser.js

export function parseSRT(srtContent) {
  const entries = [];
  const blocks = srtContent.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length >= 2) {
      const timeLine = lines[1];
      const textLines = lines.slice(2);
      const text = textLines.join(' ').trim();

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
