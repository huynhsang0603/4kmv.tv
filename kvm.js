const axios = require("axios");
const cheerio = require("cheerio");
const { BASE_URL, HEADERS } = require("./utils");
const { getSignedPlayUrl } = require("./wasm");

async function toChineseQuery(text) {
    if (!text) return "";
    if (/[\u4e00-\u9fa5]/.test(text)) return text;
    try {
        const url = `https://googleapis.com{encodeURIComponent(text)}`;
        const { data } = await axios.get(url, { timeout: 4000 });
        if (Array.isArray(data) && Array.isArray(data)) {
            return data.map(item => (Array.isArray(item) ? item : "")).join("") || text;
        }
        return text;
    } catch (e) {
        return text;
    }
}

async function fetch4kvmStreams(originName, epNum) {
    if (!originName) return [];
    try {
        const rawClean = originName.split(":").shift().split("：").shift().trim();
        const cleanQuery = await toChineseQuery(rawClean);
        // Ép số tập về số nguyên chuẩn (VD: "01" -> 1, "02" -> 2)
        const targetEpInt = parseInt(String(epNum).replace(/\D/g, ""), 10) || 1;

        console.log(`[4KVM Debug] Tìm: "${rawClean}" -> "${cleanQuery}" (Tập ${targetEpInt})`);

        const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(cleanQuery)}`;
        const searchRes = await axios.get(searchUrl, { headers: HEADERS, timeout: 6000 });
        const $s = cheerio.load(searchRes.data);

        let movieLink = "";
        $s("a[href*='/play/'], a[href*='/detail/'], a[href*='/vod/']").each((i, el) => {
            const href = $s(el).attr("href") || "";
            if (!movieLink && href && !href.includes("javascript")) {
                movieLink = href;
            }
        });

        if (!movieLink) {
            console.log("[4KVM Debug] Không thấy kết quả tìm kiếm cho:", cleanQuery);
            return [];
        }

        const detailUrl = movieLink.startsWith("http") ? movieLink : `${BASE_URL}${movieLink}`;
        const detailRes = await axios.get(detailUrl, { headers: HEADERS, timeout: 6000 });
        const $d = cheerio.load(detailRes.data);

        let targetHref = "";
        let targetDataId = "";
        const epLinks = $d("a.episode-link, a[href*='/play/'][dataid]");

        epLinks.each((i, a) => {
            const rawEpStr = ($d(a).attr("data-episode") || $d(a).text()).trim().replace(/\D/g, "");
            const epInt = parseInt(rawEpStr, 10);
            if (!isNaN(epInt) && epInt === targetEpInt && !targetDataId) {
                targetHref = $d(a).attr("href") || "";
                targetDataId = $d(a).attr("dataid") || "";
            }
        });

        // Dự phòng cho phim lẻ (nút ghi chữ "正片" hoặc "4K", không có số)
        if (!targetDataId && targetEpInt === 1 && epLinks.length > 0) {
            targetHref = epLinks.first().attr("href") || "";
            targetDataId = epLinks.first().attr("dataid") || "";
        }

        if (!targetHref || !targetDataId) {
            console.log("[4KVM Debug] Không thấy tập:", targetEpInt, "tại", detailUrl);
            return [];
        }

        const epUrl = targetHref.startsWith("http") ? targetHref : `${BASE_URL}${targetHref}`;
        const playKey = targetHref.split("/play/").pop().split("?").shift().split("#").shift().trim();

        const pageRes = await axios.get(epUrl, { headers: HEADERS, timeout: 6000 });
        const html = pageRes.data;
        const rawCookies = pageRes.headers["set-cookie"];
        const cookieStr = Array.isArray(rawCookies) ? rawCookies.map(c => c.split(";").shift()).join("; ") : "";

        let userlink = "";
        if (html.includes("userlink:'")) userlink = html.split("userlink:'").pop().split("'").shift().trim();
        else if (html.includes('userlink:"')) userlink = html.split('userlink:"').pop().split('"').shift().trim();

        const $p = cheerio.load(html);
        const nbSt = $p("#nb-st").attr("content") || String(Date.now() - 5000);
        const wasmJsPath = $p("#wasm-cfg").attr("data-js") || "/static/wasm/nbmovie_wasm.426511b7.js";
        const wasmBgPath = $p("#wasm-cfg").attr("data-bg") || "/static/wasm/nbmovie_wasm_bg.d5d51939.wasm";

        if (!userlink || !playKey) {
            console.log("[4KVM Debug] Thiếu userlink hoặc playKey");
            return [];
        }

        const signedApiPath = await getSignedPlayUrl(wasmJsPath, wasmBgPath, nbSt, targetDataId, playKey, userlink);
        const fullApiUrl = signedApiPath.startsWith("http") ? signedApiPath : `${BASE_URL}${signedApiPath}`;

        const apiHeaders = {
            ...HEADERS,
            "Referer": epUrl,
            "Accept": "application/json, text/plain, */*",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors"
        };
        if (cookieStr) apiHeaders["Cookie"] = cookieStr;

        const apiRes = await axios.get(fullApiUrl, { headers: apiHeaders, timeout: 6000 });
        const qualityUrls = apiRes.data?.data?.quality_urls || [];
        console.log("[4KVM Debug] Số luồng 4KVM lấy được:", qualityUrls.length);

        return qualityUrls
            .filter(q => !q.locked && q.url && q.url.startsWith("http"))
            .map(q => ({
                name: `🎬 4KVM ${q.title || "1080p"}`,
                title: `Bản Gốc Siêu Nét (${q.title}) - 4KVM.tv`,
                url: q.url,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: { request: { "Origin": BASE_URL, "User-Agent": HEADERS["User-Agent"] } }
                }
            }));
    } catch (e) {
        console.error("[4KVM Lỗi]:", e.response?.status, e.message);
        return [];
    }
}

module.exports = { fetch4kvmStreams };
