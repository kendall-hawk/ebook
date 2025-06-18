// js/utils.js (最终整合版：包含 ensureEnableJsApi, extractVideoId, tokenizeText, parseSRT)

/**
 * 确保 YouTube 视频 URL 包含 enablejsapi=1 参数，以启用 JavaScript API 控制。
 * 这个函数也应该处理 URL 中的无效部分。
 * @param {string} urlString - 原始的 YouTube 视频 URL。
 * @returns {string} - 包含 enablejsapi=1 参数的 URL。
 */
export function ensureEnableJsApi(urlString) {
    if (!urlString) return '';
    try {
        const url = new URL(urlString);
        
        // 检查主机名是否是 YouTube 相关的。
        const isYoutubeRelatedHost = url.hostname.includes('youtube.com') ||
                                     url.hostname.includes('youtu.be') ||
                                     url.hostname.includes('youtube-nocookie.com') ||
                                     // Add specific googleusercontent.com subdomains if they are strictly used
                                     url.hostname.includes('youtube.com') ||
                                     url.hostname.includes('youtu.be');

        if (!isYoutubeRelatedHost) {
            // If not a YouTube domain, return the original URL as is.
            return urlString;
        }

        const params = new URLSearchParams(url.search);
        if (!params.has('enablejsapi')) {
            params.set('enablejsapi', '1');
            url.search = params.toString();
        }
        return url.toString();
    } catch (e) {
        console.error('ensureEnableJsApi: 无效的视频URL或处理出错:', urlString, e);
        return urlString; // Return original URL on error
    }
}

/**
 * 从各种 YouTube URL 格式中提取视频 ID。
 * @param {string} url - YouTube 视频的 URL。
 * @returns {string|null} - 提取到的视频 ID，如果没有找到则返回 null。
 */
export function extractVideoId(url) {
    if (!url) return null;
    // A comprehensive regex to match various YouTube URL formats
    const regex = /(?:youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtu\.be\/|m\.youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;
    const m = url.match(regex);

    // Ensure the returned ID is clean, without extra query parameters or hashes
    if (m && m[1]) {
        let videoId = m[1];
        // YouTube video IDs are fixed at 11 characters.
        // The regex is designed to capture only the 11-character ID.
        // The extra removal logic below is mostly for defensive programming,
        // as the regex should prevent it.
        const queryParamIndex = videoId.indexOf('?');
        if (queryParamIndex !== -1) {
            videoId = videoId.substring(0, queryParamIndex);
        }
        const hashIndex = videoId.indexOf('#');
        if (hashIndex !== -1) {
            videoId = videoId.substring(0, hashIndex);
        }
        return videoId.length === 11 ? videoId : null; // Validate ID length
    }
    return null; // Return null if no match
}

/**
 * 将句子分词为 { word, indexInText, length } 的数组
 * - 支持英文、数字、标点
 * - 支持中英文混排
 * - 保留 indexInText 和 length 便于高亮与匹配
 * - 包含空格作为独立的 token
 * @param {string} sentence - 输入的句子字符串
 * @returns {Array<{word: string, indexInText: number, length: number}>} - 词语数组
 */
export function tokenizeText(sentence) {
  const tokens = [];
  // Revised regex:
  // 1. Matches one or more whitespace characters (e.g., ' ', '\t', '\n')
  // 2. OR matches a sequence of Unicode letters or numbers, optionally with internal apostrophes/single quotes.
  //    `\p{L}` matches any Unicode letter, `\p{N}` matches any Unicode number.
  // 3. OR matches a single Chinese character (Han script).
  // 4. OR matches common punctuation marks (each as a single token).
  // `u` flag is essential for Unicode property escapes (\p{L}, \p{N}, \p{Script=Han}).
  // `g` flag for global matching (find all matches).
  const regex = /\s+|[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?|[\p{Script=Han}]|[.,!?;:"“”‘’…—\-]/gu;
  let match;

  if (!sentence) return tokens; // Handle empty string input

  while ((match = regex.exec(sentence)) !== null) {
    // Only push if it's not an empty match (regex should prevent this, but good defensive programming)
    if (match[0].length > 0) {
      tokens.push({
        word: match[0],
        indexInText: match.index,
        length: match[0].length
      });
    }
  }

  return tokens;
}

/**
 * 解析 SRT 字幕文本为 JavaScript 对象数组。
 * @param {string} srtText - SRT 格式的字幕文本。
 * @returns {Array<Object>} - 包含 id, start, end, text 属性的字幕对象数组。
 */
export function parseSRT(srtText) {
    const subtitles = [];
    // Split by two or more newlines to separate subtitle blocks
    const blocks = srtText.trim().split(/\r?\n\s*\r?\n/);

    blocks.forEach(block => {
        const lines = block.split(/\r?\n/);
        if (lines.length >= 3) {
            const id = parseInt(lines[0].trim(), 10);
            const timecodes = lines[1].trim();
            const text = lines.slice(2).join(' ').trim();

            const [startStr, endStr] = timecodes.split(' --> ');

            const parseTime = (timeStr) => {
                const parts = timeStr.split(':');
                const hours = parseInt(parts[0], 10);
                const minutes = parseInt(parts[1], 10);
                const [seconds, milliseconds] = parts[2].split(',').map(Number);
                return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
            };

            subtitles.push({
                id: id,
                start: parseTime(startStr),
                end: parseTime(endStr),
                text: text
            });
        }
    });
    return subtitles;
}
