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

const IMDB_DICT = {
    "凡人修仙传": "tt12879480",
    "斗破苍穹": "tt10621094",
    "完美世界": "tt14552002",
    "仙逆": "tt29195117",
    "遮天": "tt27704929",
    "吞噬星空": "tt13624322",
    "牧神记": "tt34385094",
    "沧元图": "tt28151535",
    "庆余年": "tt10537596",
    "师兄啊师兄": "tt26443829",
    "无耻之徒": "tt1586680",
    "知否知否应是绿肥红瘦": "tt8844332"
};

async function getImdbIdFromCnTitle(cnTitle, releaseDate) {
    if (!cnTitle) return null;
    const cleanTitle = cnTitle
        .replace(/[:：]\s*第.*季/g, "")
        .replace(/第[一二三四五六七八九十\d]+季/g, "")
        .replace(/\(美版\)|（美版）|年番|全集|剧场版.*/g, "")
        .trim();

    if (IMDB_DICT[cleanTitle]) return IMDB_DICT[cleanTitle];

    const year = releaseDate ? String(releaseDate).slice(0, 4) : "";
    const cacheKey = cleanTitle + "_" + year;
    if (imdbCache.has(cacheKey)) return imdbCache.get(cacheKey);

    try {
        const enTitle = await translateText(cleanTitle, "en");
        const query = (enTitle || cleanTitle).replace(/[^a-zA-Z0-9\s]/g, " ").trim();
        if (!query) return null;

        // Gọi trực tiếp Cinemeta Search API (chuẩn gốc của Stremio/Nuvio, không bao giờ lỗi URL)
        const cinemetaHost = ["https:/", "v3-cinemeta.strem.io", "catalog"].join("/");
        const [seriesRes, movieRes] = await Promise.all([
            axios.get(cinemetaHost + "/series/top/search=" + encodeURIComponent(query) + ".json", { timeout: 6000 }).catch(() => null),
            axios.get(cinemetaHost + "/movie/top/search=" + encodeURIComponent(query) + ".json", { timeout: 6000 }).catch(() => null)
        ]);

        const sMetas = (seriesRes && seriesRes.data && seriesRes.data.metas) || [];
        const mMetas = (movieRes && movieRes.data && movieRes.data.metas) || [];
        const allMetas = sMetas.concat(mMetas).filter(m => m.id && /^tt\d+/i.test(m.id));

        let best = null;
        if (year && allMetas.length > 0) {
            best = allMetas.find(m => String(m.releaseInfo || "").includes(year));
        }
        if (!best && allMetas.length > 0) {
            best = allMetas.shift();
        }

        if (best && best.id) {
            const validId = best.id.toLowerCase();
            imdbCache.set(cacheKey, validId);
            return validId;
        }
    } catch (e) {
        console.error("Cinemeta Search Error:", e.message);
    }

    return null;
}





module.exports = { BASE_URL, HEADERS, translateText, translateBatch, getImdbIdFromCnTitle };
