const translate = require("google-translate-api-x");

const BASE_URL = "https://4kvm.tv";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": BASE_URL + "/"
};

const cache = new Map();

// Hàm dịch 1 đoạn văn bản (dùng cho tìm kiếm và mô tả phim)
async function translateText(text, targetLang = "vi") {
    if (!text) return "";
    
    const key = `${targetLang}_${text}`;
    if (cache.has(key)) return cache.get(key);

    try {
        const res = await translate(text, { to: targetLang });
        cache.set(key, res.text);
        return res.text;
    } catch (e) {
        console.error(`Error translating "${text}" to ${targetLang}:`, e.message);
        return text; // Trả về văn bản gốc nếu có lỗi
    }
}

// Hàm dịch gộp nhiều tên phim cùng lúc trong 1 request duy nhất
async function translateBatch(textArray, targetLang = "vi") {
    if (!textArray || textArray.length === 0) return [];
    
    // Kiểm tra xem những phim nào chưa có trong cache thì mới gom lại dịch 1 lần
    const uncachedTexts = textArray.filter(t => t && !cache.has(`${targetLang}_${t}`));
    
    if (uncachedTexts.length > 0) {
        try {
            // Gộp các văn bản cần dịch thành một chuỗi duy nhất, ngăn cách bằng dấu xuống dòng
            const combinedText = uncachedTexts.join('\n');
            
            const res = await translate(combinedText, { to: targetLang });
            
            // Chia kết quả lại thành mảng dựa trên số lượng văn bản gốc
            const translatedArray = res.text.split('\n').map(t => t.trim());
            
            // Cập nhật cache cho từng văn bản
            uncachedTexts.forEach((text, idx) => {
                cache.set(`${targetLang}_${text}`, translatedArray[idx]);
            });
        } catch (e) {
            console.error("Tạm thời bị giới hạn dịch gộp:", e.message);
        }
    }

    return textArray.map(t => cache.get(`${targetLang}_${t}`) || t);
}

module.exports = { BASE_URL, HEADERS, translateText, translateBatch };
