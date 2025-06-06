// js/chapterRenderer.js
// 导入 renderMarkdownWithTooltips，现在它需要更多参数
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
 * @param {Map<string, number>} wordFrequenciesMap - 词语频率的 Map。
 * @param {number} maxFreq - 词语的最高频率。
 */
export function renderChapters(chapterData, tooltipData, wordFrequenciesMap, maxFreq) {
  const toc = document.getElementById('toc');
  const chaptersContainer = document.getElementById('chapters');

  if (!toc || !chaptersContainer) {
    console.error('未找到 #toc 或 #chapters 容器。');
    return;
  }

  chapterData.chapters.forEach(ch => {
    const link = document.createElement('a');
    link.href = `#${ch.id}`;
    link.textContent = ch.title;
    toc.appendChild(link);

    const title = document.createElement('h2');
    title.id = ch.id;
    title.textContent = ch.title;
    chaptersContainer.appendChild(title);

    ch.paragraphs.forEach(item => {
      if (typeof item === 'string') {
        const para = document.createElement('p');
        // 传递词频数据和最大频率
        para.innerHTML = renderMarkdownWithTooltips(
            item,
            tooltipData,
            wordFrequenciesMap,
            maxFreq
        );
        chaptersContainer.appendChild(para);
      } else if (item.video) {
        // ... (视频渲染逻辑保持不变) ...
        const videoUrl = item.video;
        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
          position: 'relative',
          paddingBottom: '56.25%',
          height: '0',
          overflow: 'hidden',
          maxWidth: '100%',
          marginBottom: '20px'
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
            iframe.src = ensureEnableJsApi(`https://www.youtube.com/embed/${videoId}`);
        } else {
            iframe.src = ensureEnableJsApi(videoUrl);
        }

        wrapper.appendChild(iframe);
        chaptersContainer.appendChild(wrapper);
      }
    });
  });
}
