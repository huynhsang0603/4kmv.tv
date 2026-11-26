const axios = require("axios");
const translate = require("google-translate-api-x");

const TMDB_API = "https://" + "api.themoviedb.org/3";
const TMDB_KEY = "439c478a771f35c05022d9feabcca01c";
const BASE_URL = "https://4kvm.tv";
const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": BASE_URL + "/"
};

const cache = new Map();
const imdbCache = new Map();

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
    "师兄啊师兄": "Sư Huynh A Sư Huynh",
    "年番": "Niên Phiên",
    "剧场版": "Bản Điện Ảnh"
};

function applyVnDictionary(zhText, translatedVi) {
    let result = translatedVi;
    for (const [zhKey, vnVal] of Object.entries(VN_DICT)) {
        if (zhText.trim() === zhKey) return vnVal;
        if (zhText.includes(zhKey) && !result.toLowerCase().includes(vnVal.toLowerCase())) {
            result = result.replace(new RegExp(zhKey, "g"), vnVal);
        }
    }
    return result.replace(/(^|\s)\S/g, l => l.toUpperCase());
}

async function translateText(text, targetLang = "vi") {
    if (!text) return "";
    const cleanText = text.trim();
    const key = `${targetLang}_${cleanText}`;
    if (cache.has(key)) return cache.get(key);

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

async function translateBatch(textArray, targetLang = "vi") {
    if (!textArray || textArray.length === 0) return [];
    const uncached = textArray.filter(t => t && !cache.has(`${targetLang}_${t}`));

    if (uncached.length > 0) {
        try {
            const res = await translate(uncached.join(" ||| "), { to: targetLang, forceTo: true });
            const arr = res.text.split("|||").map(t => t.trim());
            uncached.forEach((origZh) => {
                const rawVi = arr.shift() || origZh;
                const finalVi = targetLang === "vi" ? applyVnDictionary(origZh, rawVi) : rawVi;
                cache.set(`${targetLang}_${origZh}`, finalVi);
            });
        } catch (e) {}
    }
    return textArray.map(t => cache.get(`${targetLang}_${t}`) || t);
}

async function getImdbIdFromCnTitle(cnTitle, releaseDate) {
    if (!cnTitle) return null;
    const cleanTitle = cnTitle
        .replace(/[:：]\s*第.*季/g, "")
        .replace(/第[一二三四五六七八九十\d]+季/g, "")
        .replace(/\(美版\)|（美版）|年番|全集|剧场版.*/g, "")
        .trim();

    const year = releaseDate ? String(releaseDate).slice(0, 4) : "";
    const cacheKey = `${cleanTitle}_${year}`;
    if (imdbCache.has(cacheKey)) return imdbCache.get(cacheKey);

    // Thử tìm 2 lượt: Lượt 1 bằng chính tên tiếng Trung gốc, Lượt 2 bằng tên tiếng Anh đã dịch
    const queries = [cleanTitle];
    try {
        const enTitle = await translateText(cleanTitle, "en");
        if (enTitle && enTitle.toLowerCase() !== cleanTitle.toLowerCase()) {
            queries.push(enTitle.replace(/[^a-zA-Z0-9\s]/g, " ").trim());
        }
    } catch (e) {}

    for (const q of queries) {
        try {
            const firstChar = /^[a-z0-9]/i.test(q) ? q.charAt(0).toLowerCase() : "x";
            const imdbUrl = `https://media-imdb.com{firstChar}/${encodeURIComponent(q)}.json`;
            const { data } = await axios.get(imdbUrl, {
                timeout: 6000,
                headers: { "User-Agent": "Mozilla/5.0" }
            });

            const list = (data && data.d) || [];
            const moviesOnly = list.filter(item => item.id && /^tt\d+/i.test(item.id));

            let bestMatch = null;
            if (year && moviesOnly.length > 0) {
                bestMatch = moviesOnly.find(item => String(item.y) === String(year));
            }
            if (!bestMatch && moviesOnly.length > 0) {
                bestMatch = moviesOnly.shift();
            }

            if (bestMatch && bestMatch.id) {
                const validId = bestMatch.id.toLowerCase();
                imdbCache.set(cacheKey, validId);
                return validId;
            }
        } catch (e) {}
    }

    return null;
}





module.exports = { BASE_URL, HEADERS, translateText, translateBatch, getImdbIdFromCnTitle };
