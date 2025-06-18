// js/utils.js (最终整合版：包含 ensureEnableJsApi, extractVideoId, tokenizeText)

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
        // 注意：您提供的这些主机名 'www.youtube.com' 等
        // 看起来不像是标准的 YouTube 嵌入域名。
        // 标准的 YouTube 嵌入域名通常是 "www.youtube.com" 或 "www.youtube-nocookie.com"。
        // 我将在这里保留您提供的逻辑，但建议您根据实际的 YouTube 嵌入 URL 检查并修正这些域名。
        const validYoutubeHostnames = [
            'www.youtube.com',
            'youtube.com',
            'm.youtube.com',
            'youtu.be',
            'www.youtube-nocookie.com',
            // 如果您确定需要，可以保留以下非标准域名，但它们看起来不寻常
            'googleusercontent.com' // 这是一个非常宽泛的匹配，可能需要更精确
        ];
        
        // 简化检查，只要 URL 包含 'youtube.com' 或 'youtu.be'，就认为是 YouTube 链接
        // 这样可以避免列举所有子域名，且更健壮
        const isYoutubeUrl = url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be');

        if (!isYoutubeUrl) {
            // 如果不是 YouTube 域名，直接返回原URL
            return urlString;
        }

        const params = new new URLSearchParams(url.search);
        if (!params.has('enablejsapi')) {
            params.set('enablejsapi', '1');
            url.search = params.toString();
        }
        return url.toString();
    } catch (e) {
        console.error('ensureEnableJsApi: 无效的视频URL或处理出错:', urlString, e);
        return urlString; // 返回原始URL以防出错
    }
}

/**
 * 从各种 YouTube URL 格式中提取视频 ID。
 * @param {string} url - YouTube 视频的 URL。
 * @returns {string|null} - 提取到的视频 ID，如果没有找到则返回 null。
 */
export function extractVideoId(url) {
    if (!url) return null;
    // 这是一个更全面和健壮的正则表达式，可以匹配多种 YouTube URL 格式
    // 包括标准链接、短链接、嵌入链接、移动版链接、YouTube Music 链接等
    const regex = /(?:youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtu\.be\/|m\.youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/;
    const m = url.match(regex);

    // 确保返回的ID是干净的，没有额外的查询参数或哈希
    if (m && m[1]) {
        let videoId = m[1];
        // YouTube 视频 ID固定为11个字符，通常不会包含 '?' 或 '#'
        // 但以防万一，还是保留移除逻辑。
        // 例如：https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share -> dQw4w9WgXcQ
        // 或 https://youtu.be/dQw4w9WgXcQ?t=10 -> dQw4w9WgXcQ
        const queryParamIndex = videoId.indexOf('?');
        if (queryParamIndex !== -1) {
            videoId = videoId.substring(0, queryParamIndex);
        }
        const hashIndex = videoId.indexOf('#');
        if (hashIndex !== -1) {
            videoId = videoId.substring(0, hashIndex);
        }
        return videoId.length === 11 ? videoId : null; // 额外验证ID长度
    }
    return null; // 如果没有匹配到，返回 null
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

  if (!sentence) return tokens; // 处理空字符串输入

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
