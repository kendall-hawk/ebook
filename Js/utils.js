// js/utils.js

/**
 * 确保 YouTube URL 包含 enablejsapi=1 参数，且只添加一次。
 * @param {string} videoUrl - 原始的 YouTube 视频 URL。
 * @returns {string} - 处理后的 YouTube 视频 URL。
 */
export function ensureEnableJsApi(videoUrl) {
  try {
    const url = new URL(videoUrl);
    const params = new URLSearchParams(url.search);
    if (!params.has('enablejsapi')) {
      params.append('enablejsapi', '1');
      url.search = params.toString();
    }
    return url.toString();
  } catch (e) {
    console.error('无效的视频URL:', videoUrl, e);
    return videoUrl; // 返回原始URL或进行其他错误处理
  }
}

/**
 * 从各种 YouTube URL 格式中提取视频 ID。
 * @param {string} url - YouTube 视频的 URL。
 * @returns {string} - 提取到的视频 ID，如果没有找到则返回空字符串。
 */
export function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([^&?/]+)/;
  const m = url.match(regex);
  return m ? m[1] : '';
}
