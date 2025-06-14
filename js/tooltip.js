// js/tooltip.js

// 封装 Tooltip 逻辑的类
class TooltipManager {
    constructor() {
        this._internalTooltipsData = {}; // 存储加载的 Tooltip 数据
        this._tooltipDiv = null; // Tooltip 元素
        this._currentHideTimeout = null; // 隐藏 Tooltip 的定时器
        this._currentActiveTooltipSpan = null; // 当前激活的 Tooltip 词语 span

        // 绑定事件处理函数到实例
        this._handleMouseOver = this._handleMouseOver.bind(this);
        this._handleMouseOut = this._handleMouseOut.bind(this);
        this._handleMouseMove = this._handleMouseMove.bind(this);
    }

    /**
     * 从 JSON 文件加载 Tooltip 数据。
     * @param {string} filePath - Tooltip JSON 文件的路径。
     * @returns {Promise<Object>} - 加载的 Tooltip 数据。
     */
    async loadTooltips(filePath = 'data/tooltips.json') {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this._internalTooltipsData = await response.json();
            console.log('Tooltip 数据加载成功:', this._internalTooltipsData);
            return this._internalTooltipsData;
        } catch (error) {
            console.error('加载 Tooltip 数据失败:', error);
            return {};
        }
    }

    /**
     * 设置全局 Tooltip 事件监听器。
     * 应该在 DOM 准备好后或新内容加载后调用。
     */
    setupTooltips() {
        if (!this._tooltipDiv) {
            this._tooltipDiv = document.getElementById('react-tooltips');
            if (!this._tooltipDiv) {
                console.error('未找到 Tooltip 容器 #react-tooltips。');
                return;
            }
            // 阻止 Tooltip 本身的鼠标事件，使其不干扰词语的 mouseout/mouseover
            this._tooltipDiv.addEventListener('mouseover', () => clearTimeout(this._currentHideTimeout));
            this._tooltipDiv.addEventListener('mouseout', this._handleMouseOut);
        }

        // 使用事件委托，将监听器添加到 #chapters 容器
        const chaptersContainer = document.getElementById('chapters');
        if (chaptersContainer) {
            // 移除旧的监听器，防止重复绑定
            chaptersContainer.removeEventListener('mouseover', this._handleMouseOver);
            chaptersContainer.removeEventListener('mouseout', this._handleMouseOut);
            chaptersContainer.removeEventListener('mousemove', this._handleMouseMove);

            // 添加新的监听器
            chaptersContainer.addEventListener('mouseover', this._handleMouseOver);
            chaptersContainer.addEventListener('mouseout', this._handleMouseOut);
            chaptersContainer.addEventListener('mousemove', this._handleMouseMove);
        } else {
            console.warn('未找到 #chapters 容器，无法设置 Tooltip 事件监听。');
        }
    }

    /**
     * 处理鼠标悬停事件，显示 Tooltip。
     * @param {MouseEvent} e
     */
    _handleMouseOver(e) {
        const target = e.target;
        if (target && target.classList.contains('word')) {
            clearTimeout(this._currentHideTimeout); // 清除任何即将隐藏的定时器

            if (this._currentActiveTooltipSpan !== target) {
                // 如果是新的词语，则隐藏旧的 Tooltip 并显示新的
                this._hideTooltip();
                this._currentActiveTooltipSpan = target;
                const tooltipId = target.dataset.tooltipId;
                if (tooltipId && this._internalTooltipsData[tooltipId]) {
                    this._showTooltip(target, this._internalTooltipsData[tooltipId]);
                }
            }
        } else if (this._currentActiveTooltipSpan && !this._tooltipDiv.contains(target)) {
            // 如果鼠标从词语移开，但不在 Tooltip 内部，则开始隐藏 Tooltip
            this._currentHideTimeout = setTimeout(() => this._hideTooltip(), 100);
        }
    }

    /**
     * 处理鼠标移出事件，隐藏 Tooltip。
     * @param {MouseEvent} e
     */
    _handleMouseOut(e) {
        if (this._currentActiveTooltipSpan) {
            // 如果鼠标从当前激活的词语或 Tooltip 本身移开
            if (!this._currentActiveTooltipSpan.contains(e.relatedTarget) && !this._tooltipDiv.contains(e.relatedTarget)) {
                this._currentHideTimeout = setTimeout(() => this._hideTooltip(), 100);
            }
        }
    }

    /**
     * 实时更新 Tooltip 位置。
     * @param {MouseEvent} e
     */
    _handleMouseMove(e) {
        if (this._currentActiveTooltipSpan && this._tooltipDiv.classList.contains('visible')) {
            this._positionTooltip(e);
        }
    }

    /**
     * 显示 Tooltip。
     * @param {HTMLElement} targetSpan - 目标词语 span 元素。
     * @param {Object} data - Tooltip 数据。
     */
    _showTooltip(targetSpan, data) {
        if (!this._tooltipDiv || !targetSpan || !data) return;

        // 构建 Tooltip 内容
        const contentParts = [];
        if (data.word) contentParts.push(`<strong>${data.word}</strong>`);
        if (data.partOfSpeech) contentParts.push(`<em>(${data.partOfSpeech})</em>`);
        if (data.definition) contentParts.push(data.definition);
        if (data.example) contentParts.push(`例句: ${data.example}`);
        if (data.origin) contentParts.push(`词源: ${data.origin}`);

        this._tooltipDiv.innerHTML = contentParts.join('<br>');

        // 临时显示 Tooltip 以获取其尺寸，但不使其可见
        this._tooltipDiv.style.visibility = 'hidden';
        this._tooltipDiv.style.opacity = '0';
        this._tooltipDiv.classList.add('visible'); // 先添加 visible 以便获取正确尺寸

        // 立即计算并设置位置
        this._positionTooltipFromTarget(targetSpan);

        // 延迟显示 Tooltip，使其可见
        this._tooltipDiv.style.visibility = 'visible';
        this._tooltipDiv.style.opacity = '1';
    }


    /**
     * 根据目标元素定位 Tooltip。
     * @param {HTMLElement} targetSpan - 目标词语 span 元素。
     */
    _positionTooltipFromTarget(targetSpan) {
        const targetRect = targetSpan.getBoundingClientRect();
        const tooltipRect = this._tooltipDiv.getBoundingClientRect();

        let top = targetRect.top + targetRect.height + 5; // 默认在词语下方，留 5px 间距
        let left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2); // 居中对齐

        // 视口边界检查 - 水平方向
        if (left < 5) { // 左侧边界
            left = 5;
        } else if (left + tooltipRect.width > window.innerWidth - 5) { // 右侧边界
            left = window.innerWidth - tooltipRect.width - 5;
        }

        // 视口边界检查 - 垂直方向 (如果下方空间不足，则显示在上方)
        if (top + tooltipRect.height > window.innerHeight - 5) {
            // 尝试在上方显示
            top = targetRect.top - tooltipRect.height - 5;
            if (top < 5) { // 如果上方空间也不足，则限制在顶部
                top = 5;
            }
        }

        this._tooltipDiv.style.left = `${left + window.scrollX}px`;
        this._tooltipDiv.style.top = `${top + window.scrollY}px`;
    }

    /**
     * 隐藏 Tooltip。
     */
    _hideTooltip() {
        if (this._tooltipDiv) {
            this._tooltipDiv.classList.remove('visible');
            this._tooltipDiv.style.opacity = '0';
            this._tooltipDiv.style.visibility = 'hidden';
            this._currentActiveTooltipSpan = null;
        }
    }

    /**
     * 根据词语频率计算字体大小。
     * @param {number} freq - 单词的频率。
     * @param {number} maxFreq - 所有单词中的最高频率。
     * @returns {string} - 计算后的字体大小 (例如 "16px")。
     */
    _calculateFontSize(freq, maxFreq) {
        const minSize = 16; // 最小字体大小 (px)
        const maxSize = 32; // 最大字体大小 (px)

        if (maxFreq === 0) {
            return `${minSize}px`;
        }

        // 线性缩放
        const sizeRange = maxSize - minSize;
        const normalizedFreq = freq / maxFreq; // 0 到 1 之间
        const calculatedSize = minSize + (sizeRange * normalizedFreq);

        // 为了防止字体过小，可以设置一个下限
        return `${Math.max(minSize, calculatedSize)}px`;
    }

    /**
     * 将 Markdown 文本渲染为 HTML，并根据词频高亮和设置 Tooltip。
     * @param {string} markdownText - 原始 Markdown 文本。
     * @param {Map<string, number>} wordFrequenciesMap - 单词频率 Map。
     * @param {number} maxFreq - 最高频率。
     * @returns {string} - 渲染后的 HTML 字符串。
     */
    renderMarkdownWithTooltips(markdownText, wordFrequenciesMap, maxFreq) {
        if (!markdownText) return '';

        let html = markdownText;

        // 1. 优先处理自定义 Tooltip 格式 [[word|tooltipId]]
        // 捕获 group 1 为要显示的单词，group 2 为实际的 tooltip ID
        const customTooltipPattern = /\[\[([a-zA-Z0-9'-]+)\|([a-zA-Z0-9_-]+)\]\]/g;
        html = html.replace(customTooltipPattern, (match, word, tooltipId) => {
            const cleanWord = word.toLowerCase().trim();
            const freq = wordFrequenciesMap.get(cleanWord) || 0;
            const fontSize = this._calculateFontSize(freq, maxFreq); // 使用 this._calculateFontSize
            return `<span class="word" data-tooltip-id="${tooltipId}" style="font-size: ${fontSize};">${word}</span>`;
        });

        // 2. 处理普通单词，如果它们在 tooltipsData 中有定义，也添加 Tooltip 样式和 ID
        // 此步假设 tooltipsData 的键就是需要高亮的单词 (小写)
        // 这是一个更复杂的正则表达式，以避免嵌套和已经处理过的 [[...]] 格式
        const plainWordPattern = /(?<!\[\[)([a-zA-Z0-9'-]+)(?!\|[^\]]*?\]\])/g;
        html = html.replace(plainWordPattern, (match, word) => {
            const cleanWord = word.toLowerCase().trim();
            // 只有当这个词在 _internalTooltipsData 中有对应的定义时才将其标记为 .word
            if (this._internalTooltipsData[cleanWord]) { // 直接用 cleanWord 作为 key 查找
                const freq = wordFrequenciesMap.get(cleanWord) || 0;
                const fontSize = this._calculateFontSize(freq, maxFreq); // 使用 this._calculateFontSize
                return `<span class="word" data-tooltip-id="${cleanWord}" style="font-size: ${fontSize};">${word}</span>`;
            }
            return word; // 不是 Tooltip 词，原样返回
        });

        return html;
    }
}

// 导出 TooltipManager 的一个单例实例
export const tooltipManager = new TooltipManager();

// 导出常用的方法，以便其他模块可以方便地导入和使用
export const loadTooltips = tooltipManager.loadTooltips.bind(tooltipManager);
export const renderMarkdownWithTooltips = tooltipManager.renderMarkdownWithTooltips.bind(tooltipManager);
export const setupTooltips = tooltipManager.setupTooltips.bind(tooltipManager);
