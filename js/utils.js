/**
 * js/utils.js (通用工具函数)
 * 包含通用的辅助函数，如文本分词、SRT解析等。
 */

/**
 * 将句子分词为 { word, indexInText, length } 的数组。
 * - 支持英文、数字、标点
 * - 支持中英文混排
 * - 保留 indexInText 和 length 便于高亮与匹配
 * - 不包含空格作为独立的 token，空格是分隔符
 * @param {string} text - 输入的文本字符串。
 * @returns {Array<{word: string, indexInText: number, length: number}>} - 词语数组。
 */
export function tokenizeText(text) {
  const tokens = [];
  if (!text === null || text === undefined || typeof text !== 'string') return tokens; // 修正：确保输入是字符串

  // 优化后的正则表达式：
  // 1. [\p{L}\p{N}]+(?:['’\-\u2010-\u2015][\p{L}\p{N}]+)* : 匹配单词（包括Unicode字母和数字，以及内部的撇号、连字符）。
  //    - '’' 包含了常见的单引号和弯引号。
  //    - \u2010-\u2015 包含多种连字符和破折号。
  // 2. [\p{Script=Han}] : 匹配单个汉字。
  // 3. [.,!?;:"“”‘’…—()[\]{}] : 匹配常见的标点符号。
  //    - 包含了英文的双引号和单引号（直引号和弯引号）、省略号、破折号等。
  // 4. \S : 匹配任何非空白字符。这是一个回退项，用于捕获前面规则未覆盖的单个特殊符号。
  // 关键修正：确保标点符号也独立作为 token，而不是被 `\S` 捕获后合并。
  // 调整顺序，更具体的模式在前
  const regex = /[\p{L}\p{N}]+(?:['’\-\u2010-\u2015][\p{L}\p{N}]+)*|[\p{Script=Han}]|[.,!?;:"“”‘’…—\(\)\[\]\{\}]|\S/gu;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 过滤掉纯空白字符的匹配（虽然regex设计上很少产生，但以防万一）
    // match[0] 总是非空，因为 regex 匹配的是非空白字符或字符组合
    tokens.push({
      word: match[0],
      indexInText: match.index,
      length: match[0].length
    });
  }
  return tokens;
}

/**
 * 解析 SRT 字幕文本为 JavaScript 对象数组。
 * @param {string} srtText - SRT 格式的字幕文本。
 * @returns {Array<Object>} - 包含 id, start, end, text 属性的字幕对象数组。
 */
export function parseSRT(srtText) {
    const subtitles = [];
    // 修正：确保输入是字符串类型，避免对非字符串类型调用 .trim() 或 .split()
    if (srtText === null || srtText === undefined || typeof srtText !== 'string') {
      console.error("Invalid input for parseSRT: srtText must be a string.");
      return subtitles;
    }

    // 优化：使用更健壮的分割方式，处理不同操作系统下的换行符和潜在的空行。
    // \r?\n 表示匹配回车换行或单独换行，\s* 匹配任何空白字符零次或多次。
    const blocks = srtText.trim().split(/\r?\n\s*\r?\n+/); // 修正：+ 确保处理连续的空行块

    blocks.forEach(block => {
        // 修正：过滤掉空行，并去除每行首尾空白。
        const lines = block.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
        
        // 修正：确保一个有效的字幕块至少有ID、时间戳和一行文本（共3行）。
        // 如果只有ID和时间戳而无文本，不处理。
        if (lines.length >= 3) { 
            const id = parseInt(lines[0], 10);
            if (isNaN(id)) {
                // 优化：跳过无效ID的块，并打印警告。
                console.warn("Invalid subtitle ID found, skipping block:", lines[0]);
                return; 
            }

            const timecodes = lines[1];
            // 文本部分现在是所有剩余的行
            const text = lines.slice(2).join('\n'); 

            const [startStr, endStr] = timecodes.split(' --> ');

            const parseTime = (timeStr) => {
                // 优化：添加 null/undefined/空字符串检查
                if (!timeStr || typeof timeStr !== 'string') {
                    console.warn("Invalid time string provided to parseTime:", timeStr);
                    return NaN; // 返回 NaN 以便后续检查失败
                }
                try {
                    // 00:00:00,000 格式
                    const parts = timeStr.split(':');
                    if (parts.length !== 3) {
                        throw new Error("Timecode format mismatch");
                    }
                    const h = parseInt(parts[0]);
                    const m = parseInt(parts[1]);
                    const sMs = parts[2].split(',');
                    if (sMs.length !== 2) {
                        throw new Error("Milliseconds format mismatch");
                    }
                    const s = parseInt(sMs[0]);
                    const ms = parseInt(sMs[1]);

                    // 优化：检查解析结果是否为有效数字
                    if (isNaN(h) || isNaN(m) || isNaN(s) || isNaN(ms)) {
                        throw new Error("Parsed time component is NaN");
                    }

                    return h * 3600 + m * 60 + s + ms / 1000;
                } catch (e) {
                    console.warn("Error parsing time string:", timeStr, e.message);
                    return NaN; // 返回 NaN 以便后续检查
                }
            };

            const start = parseTime(startStr);
            const end = parseTime(endStr);

            // 修正：只有当开始和结束时间都有效时才添加字幕
            if (!isNaN(start) && !isNaN(end) && start < end) { // 优化：确保结束时间在开始时间之后
                 subtitles.push({
                    id: id,
                    start: start,
                    end: end,
                    text: text
                });
            } else {
                console.warn("Invalid start/end time or time order for subtitle ID:", id, "Block:", block);
            }
        } else {
            console.warn("Skipping malformed SRT block (less than 3 lines):", block);
        }
    });
    return subtitles;
}
