const translate = require("google-translate-api-x");

const BASE_URL = "https://4kvm.tv";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": BASE_URL + "/"
};

const cache = new Map();

// Từ điển chuẩn hóa các tên phim & thuật ngữ phổ biến ở Việt Nam
const VN_DICT = {
    "凡人修仙传": "Phàm Nhân Tu Tiên",
    "斗破苍穹": "Đấu Phá Thương Khung",
    "完美世界": "Thế Giới Hoàn Mỹ",
    "仙逆": "Tiên Nghịch",
    "遮天": "Già Thiên",
    "吞噬星空": "Thôn Phệ Tinh Không",
    "牧神记": "Mục Thần Ký",
    "沧元图": "Thương Nguyên Đồ",
    "两京十五日": "Lưỡng Kinh Thập Ngũ Nhật",
    "嫁金钗": "Gả Kim Thoa",
    "谷雨": "Cốc Vũ",
    "庆余年": "Khánh Dư Niên",
    "知否知否应是绿肥红瘦": "Minh Lan Truyện",
    "兰香如故": "Lan Hương Như Cố",
    "尚公主": "Thượng Công Chúa",
    "光阴之外": "Quang Âm Chi Ngoại",
    "今天是太阳雨": "Hôm Nay Là Mưa Nắng",
    "年番": "Niên Phiên",
    "剧场版": "Bản Điện Ảnh",
    "第1季": "Phần 1",
    "第一季": "Phần 1",
    "第二季": "Phần 2",
    "第三季": "Phần 3"
};

function applyVnDictionary(zhText, translatedVi) {
    let result = translatedVi;
    for (const [zhKey, vnVal] of Object.entries(VN_DICT)) {
        if (zhText.includes(zhKey) && !result.toLowerCase().includes(vnVal.toLowerCase())) {
            // Ưu tiên thay thế bằng tên chuẩn Việt Nam nếu bản dịch máy bị lệch nghĩa
            if (zhText.trim() === zhKey) return vnVal;
            result = result.replace(new RegExp(zhKey, "g"), vnVal);
        }
    }
    // Viết hoa chữ cái đầu mỗi từ cho đẹp chuẩn tiêu đề phim Việt Nam
    return result.replace(/(^|\s)\S/g, l => l.toUpperCase());
}

// Dịch từ khóa tìm kiếm (Việt -> Trung) hoặc mô tả (Trung -> Việt)
async function translateText(text, targetLang = "vi") {
    if (!text) return "";
    const cleanText = text.trim();
    const key = `${targetLang}_${cleanText}`;
    if (cache.has(key)) return cache.get(key);

    // Nếu người dùng tìm kiếm bằng tiếng Việt trùng với tên trong từ điển -> trả về ngay chữ Trung chuẩn
    if (targetLang === "zh-CN") {
        for (const [zhKey, vnVal] of Object.entries(VN_DICT)) {
            if (vnVal.toLowerCase() === cleanText.toLowerCase()) {
                cache.set(key, zhKey);
                return zhKey;
            }
        }
    }

    try {
        const res = await translate(cleanText, { to: targetLang, forceTo: true });
        let out = res.text;
        if (targetLang === "vi") out = applyVnDictionary(cleanText, out);
        cache.set(key, out);
        return out;
    } catch (e) {
        return cleanText;
    }
}

// Dịch gộp tên phim với dấu phân cách đặc biệt để không bị lẫn dòng
async function translateBatch(textArray, targetLang = "vi") {
    if (!textArray || textArray.length === 0) return [];
    const uncached = textArray.filter(t => t && !cache.has(`${targetLang}_${t}`));

    if (uncached.length > 0) {
        try {
            // Dùng ký hiệu ngăn cách riêng biệt giúp Google giữ nguyên từng tiêu đề
            const combined = uncached.join(" ||| ");
            const res = await translate(combined, { to: targetLang, forceTo: true });
            const arr = res.text.split("|||").map(t => t.trim());

            uncached.forEach((origZh, i) => {
                const rawVi = arr[i] || origZh;
                const finalVi = targetLang === "vi" ? applyVnDictionary(origZh, rawVi) : rawVi;
                cache.set(`${targetLang}_${origZh}`, finalVi);
            });
        } catch (e) {
            console.error("Lỗi dịch gộp:", e.message);
        }
    }

    return textArray.map(t => cache.get(`${targetLang}_${t}`) || t);
}

module.exports = { BASE_URL, HEADERS, translateText, translateBatch };
