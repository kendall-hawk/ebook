// js/utils.js

/**
 * 确保 YouTube 视频 URL 包含 enablejsapi=1 参数，以启用 JavaScript API 控制。
 * 这个函数也应该处理 URL 中的无效部分，并将其转换为标准的嵌入式 URL 格式。
 * @param {string} urlString - 原始的 YouTube 视频 URL。
 * @returns {string} - 包含 enablejsapi=1 参数的嵌入式 URL。
 */
export function ensureEnableJsApi(urlString) {
    if (!urlString) return '';
    try {
        const url = new URL(urlString);
        // 定义正确的 YouTube 相关的域名列表
        // 注意：YouTube iframe API 实际加载的播放器通常是 "https://www.youtube.com/embed/VIDEO_ID`。`googleusercontent.com8" 或 "www.youtube-nocookie.com"
        // 确保这些域名匹配你的实际 iframe src
        const youtubeHostnames = [
            'www.youtube.com',
            'm.youtube.com',
            'youtu.be',
            'music.youtube.com',
            'www.youtube-nocookie.com' // 隐私增强模式
        ];

        // 检查主机名是否是 YouTube 相关的
        const isYoutubeDomain = youtubeHostnames.some(hostname => url.hostname.endsWith(hostname));

        let videoId = extractVideoId(urlString);

        // 如果不是 YouTube 域名或无法提取视频ID，直接返回原始URL
        // 或者，如果它是一个我们无法处理的自定义视频URL，也返回原始URL
        if (!isYoutubeDomain || !videoId) {
            console.warn(`ensureEnableJsApi: URL不是标准的YouTube视频链接或无法提取ID，返回原始URL: ${urlString}`);
            return urlString;
        }

        // 构造一个新的 URLSearchParams 对象，用于管理参数
        const params = new URLSearchParams();
        params.set('enablejsapi', '1'); // 确保启用 JS API
        params.set('autoplay', '1'); // 自动播放 (可在YT.Player options中覆盖)
        params.set('controls', '1'); // 显示控制器
        params.set('rel', '0'); // 不显示相关视频

        // 合并原始 URL 中的其他有用参数 (如果存在且有意义)
        const originalParams = new URLSearchParams(url.search);
        // 例如，如果你想保留 start 参数
        if (originalParams.has('start')) {
            params.set('start', originalParams.get('start'));
        }
        // ... 其他你希望保留的参数

        // 构建标准的 YouTube 嵌入式 URL
        // 这是 YouTube 嵌入播放器期望的格式
        return `www.youtube.com/embed/${videoId}?${params.toString()}`;

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
    // 更全面和健壮的正则表达式，可以匹配多种 YouTube URL 格式
    // 包括标准链接、短链接、嵌入链接等
    // 匹配 11 个字符的 YouTube 视频 ID (字母、数字、连字符、下划线)
    const regex = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=|music\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})(?:[&?#]|$)/;
    const m = url.match(regex);

    if (m && m[1]) {
        let videoId = m[1];
        // 再次验证提取的ID是否符合YouTube ID的长度和字符集
        // 因为正则表达式已经很精确，这里主要是双重保险
        return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
    }
    return null; // 如果没有匹配到，返回 null
}
