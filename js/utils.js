// js/utils.js

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
        // 确保主机名是 YouTube 相关的
        if (!['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
            // 如果不是 YouTube 域名，可能是一个自定义的视频URL，直接返回原URL
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
    // 包括标准链接、短链接、嵌入链接等
    const regex = /(?:youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=)|youtu\.be\/|m\.youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=)([^&?/]+)/;
    const m = url.match(regex);

    // 确保返回的ID是干净的，没有额外的查询参数或哈希
    if (m && m[1]) {
        let videoId = m[1];
        // 移除任何 # 或 ? 后面跟着的额外参数
        const queryParamIndex = videoId.indexOf('?');
        if (queryParamIndex !== -1) {
            videoId = videoId.substring(0, queryParamIndex);
        }
        const hashIndex = videoId.indexOf('#');
        if (hashIndex !== -1) {
            videoId = videoId.substring(0, hashIndex);
        }
        return videoId;
    }
    return null; // 如果没有匹配到，返回 null
}
