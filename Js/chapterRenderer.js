// js/chapterRenderer.js
import { renderMarkdownWithTooltips } from './tooltip.js';
import { ensureEnableJsApi, extractVideoId } from './utils.js';

/**
 * 加载章节数据。
 * @returns {Promise<Object>} - 章节数据对象。
 */
export async function loadChapters() {
  try {
    const res = await fetch('data/chapters.json');
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('加载 chapters 数据失败:', error);
    return { chapters: [] };
  }
}

/**
 * 渲染章节内容到 DOM。
 * @param {Object} chapterData - 章节数据。
 * @param {Object} tooltipData - tooltips 数据。
 */
export function renderChapters(chapterData, tooltipData) {
  const toc = document.getElementById('toc');
  const chaptersContainer = document.getElementById('chapters');

  if (!toc || !chaptersContainer) {
    console.error('未找到 #toc 或 #chapters 容器。');
    return;
  }

  chapterData.chapters.forEach(ch => {
    // 目录链接
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    // 章节标题
    const title = document.createElement('h2');
    title.id = ch.id;
    title.textContent = ch.title;
    chaptersContainer.appendChild(title);

    // 章节内容（段落或视频）
    ch.paragraphs.forEach(item => {
      if (typeof item === 'string') {
        const para = document.createElement('p');
        para.innerHTML = renderMarkdownWithTooltips(item, tooltipData);
        chaptersContainer.appendChild(para);
      } else if (item.video) {
        const videoUrl = item.video;
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
          position: 'relative',
          paddingBottom: '56.25%', // 16:9 aspect ratio
          height: '0',
          overflow: 'hidden',
          maxWidth: '100%',
        });

        const iframe = document.createElement('iframe');
        Object.assign(iframe.style, {
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
        });
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

        const videoId = extractVideoId(videoUrl);
        if (videoId) {
            // 使用标准的 YouTube 嵌入 URL 格式
            iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`);
        } else {
            // 如果无法提取ID，尝试使用原始URL，并确保 JS API 参数
            iframe.src = ensureEnableJsApi(videoUrl);
        }

        wrapper.appendChild(iframe);
        chaptersContainer.appendChild(wrapper);
      }
    });
  });
}
