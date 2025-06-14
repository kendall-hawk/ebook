// js/youtube.js
import { ensureEnableJsApi, extractVideoId } from './utils.js';

// 定义一个阈值，小于此宽度被认为是移动设备，不显示浮动视频
const MOBILE_WIDTH_THRESHOLD = 768; // 可以根据需要调整

class YouTubeFloatingPlayerManager {
    constructor() {
        this.floatBox = null;
        this.floatPlayer = null;
        this.currentFloatSrc = null; // 用于存储当前浮动视频的原始 src
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.players = new Map(); // 存储 iframe -> YT.Player 实例，而不是 playerState
        this._messageListenerAdded = false; // 标记是否已添加 message 监听器

        // 绑定事件处理函数到实例，确保 this 指向正确
        this._handleMouseMove = this._handleMouseMove.bind(this);
        this._handleMouseUp = this._handleMouseUp.bind(this);
        this._handleResize = this._handleResize.bind(this);
        this._handleScroll = this._handleScroll.bind(this);
        this._handleVideoStateChange = this._handleVideoStateChange.bind(this);
        this._handlePlayerMessage = this._handlePlayerMessage.bind(this);
        this._handleMouseDown = this._handleMouseDown.bind(this); // 新增绑定
        this._handleCloseClick = this._handleCloseClick.bind(this); // 新增绑定
    }

    /**
     * 加载 YouTube iframe API。
     * @returns {Promise<void>}
     */
    loadYouTubeAPI() {
        return new Promise(resolve => {
            // 如果 API 已经加载，直接解决 Promise
            if (window.YT && window.YT.Player) {
                resolve();
                return;
            }

            // 检查是否已经存在 YouTube API 脚本标签，避免重复添加
            const existingScript = document.querySelector('script[src="https://www.youtube.com/embed/VIDEO_ID`。`googleusercontent.com7`。请务必修正这些"]');
            if (!existingScript) {
                const tag = document.createElement('script');
                // !!! 关键修正 !!! 使用正确的 YouTube API URL
                tag.src = 'https://www.youtube.com/embed/VIDEO_ID`。`googleusercontent.com7`。请务必修正这些';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            }

            // 当 YouTube API 准备好时，会调用这个全局函数
            window.onYouTubeIframeAPIReady = () => resolve();
        });
    }

    /**
     * 创建浮动视频框。
     * @param {string} videoSrc - 视频的原始 URL。
     */
    createFloatBox(videoSrc) {
        // 如果是移动设备，不创建浮动视频框
        if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
            return;
        }

        // 如果已经存在浮动框，并且是同一个视频，则直接返回
        if (this.floatBox && this.currentFloatSrc === videoSrc) {
            return;
        }
        // 如果存在但不是同一个视频，则先移除旧的
        if (this.floatBox) {
            this.removeFloatBox();
        }

        this.floatBox = document.createElement('div');
        this.floatBox.classList.add('floating-video');

        // 只有少数需要动态修改或 JS 独有的样式保留 inline
        // userSelect 已经在 CSS 中设置
        // floatBox.style.userSelect = 'none';

        this.floatBox.innerHTML = `
            <div class="video-header">
                <span>Floating Video</span>
                <button class="close-btn">×</button>
            </div>
            <div id="float-player" style="flex-grow:1; width:100%;"></div>
        `;

        document.body.appendChild(this.floatBox);

        // 绑定拖动事件
        const header = this.floatBox.querySelector('.video-header');
        if (header) {
            header.addEventListener('mousedown', this._handleMouseDown);
        }

        // 绑定关闭按钮事件
        const closeBtn = this.floatBox.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', this._handleCloseClick);
        }

        // 确保 videoSrc 是正确的 YouTube 嵌入 URL，并且提取 videoId
        const videoId = extractVideoId(videoSrc);
        if (!videoId) {
            console.error('无法从 URL 提取 YouTube 视频 ID，无法创建浮动视频:', videoSrc);
            this.removeFloatBox();
            return;
        }

        // YT.Player 的第三个参数是 ID，这里是 'float-player' 元素的 ID
        this.floatPlayer = new YT.Player('float-player', {
            height: '180', // 这些宽高会作为 iframe 的默认宽高，但会被 CSS 或父容器 flex 覆盖
            width: '320',
            videoId: videoId, // 使用提取的视频 ID
            playerVars: {
                autoplay: 1,
                controls: 1,
                enablejsapi: 1, // 确保这个参数在 playerVars 中
                rel: 0 // 不显示相关视频
            },
            events: {
                onReady: event => {
                    event.target.playVideo();
                },
                onStateChange: this._handleVideoStateChange // 浮动播放器也需要状态变化监听
            }
        });

        this.currentFloatSrc = videoSrc;
    }

    /**
     * 移除浮动视频框。
     */
    removeFloatBox() {
        if (this.floatPlayer) {
            this.floatPlayer.destroy(); // 销毁 YouTube 播放器实例
            this.floatPlayer = null;
        }
        if (this.floatBox) {
            // 移除事件监听器，防止内存泄漏
            const header = this.floatBox.querySelector('.video-header');
            if (header) {
                header.removeEventListener('mousedown', this._handleMouseDown);
            }
            const closeBtn = this.floatBox.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.removeEventListener('click', this._handleCloseClick);
            }
            document.removeEventListener('mousemove', this._handleMouseMove);
            document.removeEventListener('mouseup', this._handleMouseUp);

            this.floatBox.remove(); // 从 DOM 中移除元素
            this.floatBox = null;
            this.currentFloatSrc = null;
        }
    }

    // 事件处理函数
    _handleMouseDown(e) {
        if (!this.floatBox) return; // 再次检查 floatBox 是否存在
        this.isDragging = true;
        const rect = this.floatBox.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        e.preventDefault(); // 防止拖动时选中文字

        // 绑定拖动事件到 document，确保鼠标离开浮动框也能继续拖动
        document.addEventListener('mousemove', this._handleMouseMove);
        document.addEventListener('mouseup', this._handleMouseUp);
    }

    _handleMouseMove(e) {
        if (!this.isDragging || !this.floatBox) return;
        let left = e.clientX - this.dragOffsetX;
        let top = e.clientY - this.dragOffsetY;

        // 限制浮动框在视口内
        // 考虑到可能的边框和阴影，可以留一些余量
        left = Math.min(Math.max(0, left), window.innerWidth - this.floatBox.offsetWidth - 5);
        top = Math.min(Math.max(0, top), window.innerHeight - this.floatBox.offsetHeight - 5);

        this.floatBox.style.left = `${left}px`;
        this.floatBox.style.top = `${top}px`;
        // 拖动后清除 bottom/right，以免冲突
        this.floatBox.style.bottom = 'auto';
        this.floatBox.style.right = 'auto';
    }

    _handleMouseUp() {
        this.isDragging = false;
        // 移除鼠标移动和抬起监听器
        document.removeEventListener('mousemove', this._handleMouseMove);
        document.removeEventListener('mouseup', this._handleMouseUp);
    }

    _handleCloseClick() {
        this.removeFloatBox();
    }

    /**
     * 判断 iframe 是否完全超出视口。
     * @param {HTMLIFrameElement} iframe - 要检查的 iframe 元素。
     * @returns {boolean} - 如果 iframe 完全超出视口则返回 true。
     */
    isIframeOutOfView(iframe) {
        const rect = iframe.getBoundingClientRect();
        // 当 iframe 顶部在视口底部以下，或者 iframe 底部在视口顶部以上时，认为其超出视口
        // 同时考虑左右边界
        return rect.top >= window.innerHeight || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.right <= 0;
    }

    /**
     * 设置 YouTube 视频的自动暂停功能。
     * 当一个视频开始播放时，暂停其他所有视频。
     */
    setupVideoAutoPause() {
        if (!this._messageListenerAdded) {
            window.addEventListener('message', this._handlePlayerMessage);
            this._messageListenerAdded = true;
        }
    }

    _handlePlayerMessage(e) {
        // 确保消息来自 YouTube iframe
        // !!! 关键修正 !!! 使用正确的 YouTube 域名
        if (e.origin !== 'https://www.youtube.com/embed/VIDEO_ID`。`googleusercontent.com8' && e.origin !== 'https://www.youtube.com/embed/VIDEO_ID`。`googleusercontent.com9') {
            return;
        }

        // 解析 YouTube playerState 消息
        try {
            const data = JSON.parse(e.data);
            if (data.event === 'infoDelivery' && data.info && data.info.playerState === 1) { // playerState 1 是播放中
                const playingIframe = e.source; // 正在播放的 iframe 的内容窗口

                // 遍历所有已知的 YT.Player 实例
                this.players.forEach((playerInstance, iframeElement) => {
                    if (iframeElement.contentWindow !== playingIframe) {
                        // 如果不是正在播放的 iframe，则发送暂停指令
                        playerInstance.pauseVideo(); // 直接调用 YT.Player API 的 pauseVideo 方法
                    }
                });

                // 也要暂停浮动播放器，如果它正在播放且不是当前主播放器
                if (this.floatPlayer && this.floatPlayer.getPlayerState() === 1 && this.floatPlayer.getIframe().contentWindow !== playingIframe) {
                    this.floatPlayer.pauseVideo();
                }
            }
        } catch (error) {
            // 忽略非 JSON 格式的消息或解析错误
            // console.warn('无法解析 YouTube API 消息:', e.data, error);
        }
    }

    /**
     * 设置浮动 YouTube 视频功能。
     * 监听页面滚动和视频播放状态，当主视频滚动出视口时，在桌面端显示浮动视频。
     */
    async setupFloatingYouTube() {
        await this.loadYouTubeAPI(); // 确保 API 已加载

        // 如果是移动设备，直接返回，不设置浮动视频功能
        if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
            console.info("检测到移动设备，不启用浮动视频功能。");
            this.removeFloatBox(); // 确保浮动视频被移除
            return;
        }

        // 查找所有 YouTube iframes
        const iframes = Array.from(document.querySelectorAll('iframe[src*="https://www.youtube.com/embed/"]')) // 修正 URL
            .map(iframe => {
                // 确保 iframe 的 src 包含 enablejsapi=1，并转换为嵌入式格式
                iframe.src = ensureEnableJsApi(iframe.src);
                return iframe;
            });

        // 为每个 iframe 创建 YT.Player 实例，并监听状态变化
        iframes.forEach(iframe => {
            // 只有当该 iframe 还没有对应的 YT.Player 实例时才创建
            if (!this.players.has(iframe)) {
                const player = new YT.Player(iframe, {
                    events: {
                        onStateChange: this._handleVideoStateChange
                    }
                });
                this.players.set(iframe, player); // 存储 YT.Player 实例
            }
        });

        // 移除旧的全局事件监听器，防止重复绑定
        window.removeEventListener('scroll', this._handleScroll);
        window.removeEventListener('resize', this._handleResize);

        // 绑定新的全局事件监听器
        window.addEventListener('scroll', this._handleScroll);
        window.addEventListener('resize', this._handleResize);

        // 初始加载时也检查一下
        this._handleScroll(); // 触发一次滚动检查
    }

    _handleVideoStateChange(event) {
        const currentIframe = event.target.getIframe(); // 获取事件对应的 iframe 元素
        const playerState = event.data; // 获取播放器状态

        // 只有当状态为播放 (1) 或暂停 (2) 时才检查浮动视频逻辑
        // 因为 YT.Player 实例已经存储，_updateFloatForIframe 会直接访问实例方法
        this._updateFloatForIframe(currentIframe, playerState);
    }

    // 根据 iframe 的播放状态和是否超出视口来更新浮动视频框
    _updateFloatForIframe(iframe, playerState) {
        // 如果是移动设备，不显示浮动视频
        if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
            this.removeFloatBox(); // 确保浮动视频被移除
            return;
        }

        const videoId = extractVideoId(iframe.src); // 提取视频 ID
        if (!videoId) return;

        const currentIframePlayer = this.players.get(iframe);
        if (!currentIframePlayer) return;

        // 获取最新的播放状态，因为 playerState 可能只在特定事件中更新
        const actualPlayerState = currentIframePlayer.getPlayerState();

        // 当视频正在播放 (state === 1) 且完全超出视口时
        if (actualPlayerState === 1 && this.isIframeOutOfView(iframe)) {
            // 如果没有浮动框，或者浮动框中的视频不是当前播放的视频，则创建/更新浮动框
            if (!this.floatBox || this.currentFloatSrc !== iframe.src) {
                this.createFloatBox(iframe.src);
                // 确保浮动播放器在创建后立即播放
                if (this.floatPlayer) {
                    this.floatPlayer.playVideo();
                }
            }
        } else {
            // 如果视频不在播放，或者在视口内，或者当前浮动框就是这个视频（且它已停止播放/在视口内）
            // 并且浮动框确实存在且当前正在播放这个视频
            if (this.floatBox && this.currentFloatSrc === iframe.src) {
                this.removeFloatBox();
            }
        }
    }

    _handleScroll() {
        // 在滚动时，迭代所有已知的播放器，并根据它们的状态和位置更新浮动视频
        this.players.forEach((playerInstance, iframe) => {
            this._updateFloatForIframe(iframe, playerInstance.getPlayerState()); // 传入当前状态
        });
    }

    _handleResize() {
        if (window.innerWidth < MOBILE_WIDTH_THRESHOLD) {
            this.removeFloatBox(); // 移动端直接移除浮动视频
        } else {
            // 如果是桌面端，并且之前有浮动视频，重新调整位置
            if (this.floatBox) {
                const rect = this.floatBox.getBoundingClientRect();
                let left = rect.left;
                let top = rect.top;

                // 限制浮动框在视口内
                left = Math.min(Math.max(0, left), window.innerWidth - rect.width - 5);
                top = Math.min(Math.max(0, top), window.innerHeight - rect.height - 5);

                this.floatBox.style.left = `${left}px`;
                this.floatBox.style.top = `${top}px`;
                this.floatBox.style.bottom = 'auto'; // 清除冲突样式
                this.floatBox.style.right = 'auto';
            }
        }
    }
}

// 导出 YouTubeFloatingPlayerManager 的一个单例实例
export const youtubePlayerManager = new YouTubeFloatingPlayerManager();

// 导出常用方法，以便 main.js 可以方便地导入和使用
export const setupFloatingYouTube = youtubePlayerManager.setupFloatingYouTube.bind(youtubePlayerManager);
export const setupVideoAutoPause = youtubePlayerManager.setupVideoAutoPause.bind(youtubePlayerManager);
