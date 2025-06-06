// youtubeFloatPlayer.js

export function setupYouTubeFloatPlayer() {
  // 1. Load YouTube iframe API
  function loadYouTubeAPI() {
    return new Promise(resolve => {
      if (window.YT && window.YT.Player) {
        resolve();
      } else {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        window.onYouTubeIframeAPIReady = () => resolve();
      }
    });
  }

  // 2. Extract video ID from YouTube URL
  function extractVideoId(url) {
    const regex = /(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/;
    const m = url.match(regex);
    return m ? m[1] : null;
  }

  // 3. Create floating player container and controls
  const floatPlayer = document.createElement('div');
  floatPlayer.id = 'floating-player';
  floatPlayer.style.position = 'fixed';
  floatPlayer.style.bottom = '10px';
  floatPlayer.style.right = '10px';
  floatPlayer.style.width = '320px';
  floatPlayer.style.height = '180px';
  floatPlayer.style.backgroundColor = '#000';
  floatPlayer.style.zIndex = '10000';
  floatPlayer.style.display = 'none';
  floatPlayer.style.border = '1px solid #ccc';
  floatPlayer.style.borderRadius = '8px';
  floatPlayer.style.overflow = 'hidden';
  document.body.appendChild(floatPlayer);

  const playerDiv = document.createElement('div');
  playerDiv.id = 'yt-float-player';
  floatPlayer.appendChild(playerDiv);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '×';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '2px';
  closeBtn.style.right = '6px';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.color = '#fff';
  closeBtn.style.fontSize = '20px';
  closeBtn.style.cursor = 'pointer';
  floatPlayer.appendChild(closeBtn);

  closeBtn.addEventListener('click', () => {
    floatPlayer.style.display = 'none';
    if (player) player.stopVideo();
  });

  let player;
  let currentVideoId = null;

  function playVideo(url) {
    const videoId = extractVideoId(url);
    if (!videoId) return;

    if (!player) {
      player = new YT.Player('yt-float-player', {
        height: '180',
        width: '320',
        videoId: videoId,
        events: {
          onReady: () => {
            player.playVideo();
            floatPlayer.style.display = 'block';
          },
          onStateChange: (event) => {
            // You can handle player state changes if needed
          }
        },
        playerVars: {
          modestbranding: 1,
          rel: 0
        }
      });
    } else if (currentVideoId !== videoId) {
      player.loadVideoById(videoId);
      floatPlayer.style.display = 'block';
    } else {
      floatPlayer.style.display = 'block';
      player.playVideo();
    }
    currentVideoId = videoId;
  }

  // 4. Click event delegation for YouTube links
  document.body.addEventListener('click', e => {
    const target = e.target.closest('a');
    if (!target) return;

    const href = target.href;
    if (!href) return;

    if (href.includes('youtube.com/watch') || href.includes('youtu.be/')) {
      e.preventDefault();
      loadYouTubeAPI().then(() => {
        playVideo(href);
      });
    }
  });
}
