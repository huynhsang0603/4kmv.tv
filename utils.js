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

async function getImdbIdFromCnTitle(cnTitle, releaseDate, htmlContent) {
    if (!cnTitle) return null;
    const cleanTitle = cnTitle
        .replace(/[:：]\s*第.*季/g, "")
        .replace(/第[一二三四五六七八九十\d]+季/g, "")
        .replace(/\(美版\)|（美版）|年番|全集|剧场版.*/g, "")
        .trim();

    const year = releaseDate ? String(releaseDate).slice(0, 4) : "";
    const cacheKey = `${cleanTitle}_${year}`;
    if (imdbCache.has(cacheKey)) return imdbCache.get(cacheKey);

    // 1. Trích xuất mã ảnh TMDB gốc trong HTML (nếu có dạng image.tmdb.org/t/p/.../xxxxx.jpg)
    const tmdbImgMatch = String(htmlContent || "").match(/image\.tmdb\.org\/t\/p\/[^/]+\/([a-zA-Z0-9]{20,35}\.(?:jpg|png))/);
    const targetTmdbFile = tmdbImgMatch ? `/${tmdbImgMatch.pop()}` : "";

    let matchedTmdb = null;

    try {
        // 2. Tìm theo tên tiếng Trung + năm phát hành
        const yearParam = year ? `&year=${year}&first_air_date_year=${year}` : "";
        const sUrl = `${TMDB_API}/search/multi?api_key=${TMDB_KEY}&language=zh-CN&query=${encodeURIComponent(cleanTitle)}${yearParam}`;
        const { data } = await axios.get(sUrl, { timeout: 5000 });
        const results = (data && data.results) || [];

        if (targetTmdbFile) {
            matchedTmdb = results.find(r => r.backdrop_path === targetTmdbFile || r.poster_path === targetTmdbFile);
        }
        if (!matchedTmdb && releaseDate) {
            matchedTmdb = results.find(r => r.release_date === releaseDate || r.first_air_date === releaseDate);
        }
        if (!matchedTmdb && results.length > 0) {
            matchedTmdb = results.find(r => r.media_type === "movie" || r.media_type === "tv");
        }

        // 3. Nếu tên phim dịch quá khác -> Tìm qua tên Diễn viên tiếng Anh + Khớp mã ảnh TMDB / Ngày chiếu
        if (!matchedTmdb && htmlContent && (targetTmdbFile || releaseDate)) {
            const actorMatch = String(htmlContent).match(/主演[\s\S]{0,150}?([A-Z][a-z]+\s+[A-Z][a-z]+)/);
            if (actorMatch) {
                const actorName = actorMatch.pop().trim();
                const pUrl = `${TMDB_API}/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(actorName)}`;
                const pRes = await axios.get(pUrl, { timeout: 5000 });
                const person = pRes.data && pRes.data.results && pRes.data.results.shift();

                if (person && person.id) {
                    const cUrl = `${TMDB_API}/person/${person.id}/combined_credits?api_key=${TMDB_KEY}`;
                    const cRes = await axios.get(cUrl, { timeout: 5000 });
                    const castList = (cRes.data && cRes.data.cast) || [];

                    if (targetTmdbFile) {
                        matchedTmdb = castList.find(c => c.backdrop_path === targetTmdbFile || c.poster_path === targetTmdbFile);
                    }
                    if (!matchedTmdb && releaseDate) {
                        matchedTmdb = castList.find(c => c.release_date === releaseDate || c.first_air_date === releaseDate);
                    }
                }
            }
        }

        // 4. Quy đổi sang mã IMDb (tt...)
        if (matchedTmdb && (matchedTmdb.media_type === "movie" || matchedTmdb.media_type === "tv")) {
            const extUrl = `${TMDB_API}/${matchedTmdb.media_type}/${matchedTmdb.id}/external_ids?api_key=${TMDB_KEY}`;
            const extRes = await axios.get(extUrl, { timeout: 5000 });
            const imdbId = extRes.data && extRes.data.imdb_id;

            if (imdbId && /^tt\d+/i.test(imdbId)) {
                const validId = imdbId.toLowerCase();
                imdbCache.set(cacheKey, validId);
                return validId;
            }
        }
    } catch (e) {}

    imdbCache.set(cacheKey, null);
    return null;
}


module.exports = { BASE_URL, HEADERS, translateText, translateBatch, getImdbIdFromCnTitle };
