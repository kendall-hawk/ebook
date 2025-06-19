/**
 * js/tooltip.js (工具提示处理)
 * 负责显示、隐藏和定位工具提示。
 */

let activeChapterTooltips = {}; // 存储当前章节的工具提示数据

// 获取工具提示容器
const tooltipContainer = document.getElementById('tooltip-container');

export function updateActiveChapterTooltips(tooltips) {
    activeChapterTooltips = tooltips;
}

/**
 * 设置工具提示的事件监听器。
 */
export function setupTooltips() {
    // 绑定全局委托事件
    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleClick); // 防止点击链接跳转
}

function handleMouseOver(event) {
    const target = event.target.closest('.tooltip-link');
    if (target) {
        const tooltipId = target.dataset.tooltipId;
        const tooltipData = activeChapterTooltips[tooltipId];

        if (tooltipData) {
            showTooltip(tooltipData, target);
        }
    }
}

function handleMouseOut(event) {
    const target = event.target.closest('.tooltip-link');
    if (target) {
        hideTooltip();
    }
}

function handleClick(event) {
    const target = event.target.closest('.tooltip-link');
    if (target) {
        event.preventDefault(); // 阻止默认的链接跳转行为
    }
}

/**
 * 显示工具提示。
 * @param {Object} data - 工具提示的数据 { word, definition, category }。
 * @param {HTMLElement} targetElement - 触发工具提示的元素。
 */
function showTooltip(data, targetElement) {
    if (!tooltipContainer) return;

    tooltipContainer.innerHTML = ''; // 清空内容

    if (data.word) {
        const wordEl = document.createElement('h4');
        wordEl.textContent = data.word;
        tooltipContainer.appendChild(wordEl);
    }
    if (data.definition) {
        const defEl = document.createElement('p');
        defEl.textContent = data.definition;
        tooltipContainer.appendChild(defEl);
    }
    // 您可以根据需要添加更多数据，例如 'category'

    // 定位工具提示
    const rect = targetElement.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // 尝试放在目标元素下方
    let top = rect.bottom + scrollY + 5; // 5px 间距
    let left = rect.left + scrollX;

    // 确保工具提示不会超出屏幕右侧
    if (left + tooltipContainer.offsetWidth > window.innerWidth + scrollX - 10) { // 10px 边距
        left = window.innerWidth + scrollX - tooltipContainer.offsetWidth - 10;
    }
    // 确保工具提示不会超出屏幕左侧
    if (left < scrollX + 10) {
        left = scrollX + 10;
    }

    // 确保工具提示不会超出屏幕底部（如果超出，尝试放在上方）
    if (top + tooltipContainer.offsetHeight > window.innerHeight + scrollY - 10) {
        top = rect.top + scrollY - tooltipContainer.offsetHeight - 5;
        // 如果上方也放不下，就放在目标元素右侧 (或者您选择其他策略)
        if (top < scrollY + 10) {
            top = scrollY + 10; // 实在不行就顶格
        }
    }


    tooltipContainer.style.top = `${top}px`;
    tooltipContainer.style.left = `${left}px`;
    tooltipContainer.style.display = 'block';
}

/**
 * 隐藏工具提示。
 */
function hideTooltip() {
    if (tooltipContainer) {
        tooltipContainer.style.display = 'none';
    }
}
