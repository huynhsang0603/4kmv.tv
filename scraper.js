const axios = require("axios");
const cheerio = require("cheerio");
const { BASE_URL, HEADERS, translateText, translateBatch } = require("./utils");
const { getSignedPlayUrl } = require("./wasm");

function fixPosterUrl(src) {
    if (!src || typeof src !== "string") return "";
    if (src.startsWith("//")) return "https:" + src;
    if (src.startsWith("/")) return BASE_URL + src;
    return src;
}

function parseItems($, container) {
    const items = [];
    $(container).find("a[href*='/play/']").each((i, el) => {
        const link = $(el).attr("href");
        if (!link) return;
        const card = $(el).closest(".group, .relative, div");
        let title = card.find("img").first().attr("alt")
                 || card.find("h3, h4, .font-medium, .font-semibold, .truncate").first().text()
                 || $(el).attr("title") || $(el).text();
        title = title ? title.trim() : "";
        if (!title || title.length <= 1 || /^\d+$/.test(title)) return;

        const poster = fixPosterUrl(card.find("img").first().attr("data-src") || card.find("img").first().attr("src") || "");
        const badge = card.find("span").first().text().trim();
        if (!items.some(x => x.link === link)) {
            items.push({ title, link, poster, badge });
        }
    });
    return items;
}

async function getCatalog(id, extra) {
    let url = BASE_URL;
    const page = extra && extra.skip ? Math.floor(extra.skip / 30) + 1 : 1;

    if (extra && extra.search) {
        const zhKeyword = await translateText(extra.search, "zh-CN");
        url = `${BASE_URL}/search?q=${encodeURIComponent(zhKeyword)}&page=${page}`;
    } else if (id === "4kvm_latest") url = `${BASE_URL}/filter?years=1&page=${page}`;
    else if (id === "4kvm_tvshows") url = `${BASE_URL}/filter?type=2&years=1&page=${page}`;
    else if (id === "4kvm_movies") url = `${BASE_URL}/filter?type=1&years=1&page=${page}`;
    else if (id === "4kvm_anime") url = `${BASE_URL}/filter?type=3&years=1&page=${page}`;

    try {
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);
        let rawItems = parseItems($, $("body"));

        if (id === "4kvm_hot" && (!extra || !extra.search)) {
            $("h2").each((i, h2) => {
                if ($(h2).text().includes("今天热播")) {
                    const hotItems = parseItems($, $(h2).parent().parent());
                    if (hotItems.length > 0) rawItems = hotItems;
                }
            });
        }

        const limited = rawItems.slice(0, 25);
        if (limited.length === 0) return [];
        const viTitles = await translateBatch(limited.map(i => i.title), "vi");

        return limited.map((item, idx) => {
            const path = item.link.replace(BASE_URL, "").replace("https://4kvm.tv", "").replace("https://4kvm.tv", "");
            return {
                id: `4kvm:${encodeURIComponent(path)}`,
                type: id === "4kvm_movies" ? "movie" : "series",
                name: `${viTitles[idx] || item.title} (${item.title})`,
                poster: item.poster,
                background: item.poster,
                description: item.badge ? `Trạng thái: ${item.badge}` : ""
            };
        });
    } catch (e) {
        console.error("Lỗi Catalog:", e.message);
        return [];
    }
}

async function getMeta(type, id) {
    const path = decodeURIComponent(id.replace("4kvm:", ""));
    const movieUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    try {
        const { data } = await axios.get(movieUrl, { headers: HEADERS });
        const $ = cheerio.load(data);

        const rawTitle = $("h1").first().text().trim() || $("h2").first().text().trim();
        let rawDesc = "";
        $("h3").each((i, h3) => {
            if ($(h3).text().includes("剧情简介")) rawDesc = $(h3).next().text().trim();
        });

        const poster = fixPosterUrl($(`img[alt*='${rawTitle}']`).first().attr("src") || $("img[src*='uploads'], img[src*='douban']").first().attr("src") || "");
        const [viTitle, viDesc] = await translateBatch([rawTitle, rawDesc], "vi");

        const videos = [];
        const seen = new Set();

        $("a.episode-link, a[href*='/play/'][dataid]").each((idx, a) => {
            const epHref = $(a).attr("href");
            const dataid = $(a).attr("dataid") || "";
            const epNum = $(a).attr("data-episode") || $(a).text().trim();

            if (epHref && !seen.has(epHref)) {
                seen.add(epHref);
                const epPath = epHref.replace(BASE_URL, "").replace("https://4kvm.tv", "").replace("https://4kvm.tv", "");
                videos.push({
                    id: `4kvm:${encodeURIComponent(epPath)}|${dataid}`,
                    title: /^\d+$/.test(epNum) ? `Tập ${epNum}` : epNum,
                    season: 1,
                    episode: parseInt(epNum) || (videos.length + 1)
                });
            }
        });

        if (videos.length === 0) videos.push({ id: `${id}|`, title: "Bản Đầy Đủ", season: 1, episode: 1 });
        return { id, type, name: `${viTitle} (${rawTitle})`, poster, background: poster, description: viDesc, videos };
    } catch (e) {
        console.error("Lỗi Meta:", e.message);
        return {};
    }
}

async function getStreams(rawId) {
    try {
        const [encodedPath, passedDataId] = rawId.replace("4kvm:", "").split("|");
        const path = decodeURIComponent(encodedPath);
        const epUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;

        const playKeyMatch = path.match(/\/play\/([^/?#]+)/);
        const playKey = playKeyMatch ? playKeyMatch[1] : "";

        const pageRes = await axios.get(epUrl, { headers: HEADERS });
        const html = pageRes.data;
        const rawCookies = pageRes.headers["set-cookie"];
        const cookieStr = Array.isArray(rawCookies) ? rawCookies.map(c => c.split(";")[0]).join("; ") : "";

        const userlinkMatch = html.match(/userlink\s*:\s*['"]([^'"]+)['"]/);
        const userlink = userlinkMatch ? userlinkMatch[1] : "";

        const $ = cheerio.load(html);
        const nbSt = $("#nb-st").attr("content") || String(Date.now() - 5000);
        const wasmJsPath = $("#wasm-cfg").attr("data-js") || "/static/wasm/nbmovie_wasm.426511b7.js";
        const wasmBgPath = $("#wasm-cfg").attr("data-bg") || "/static/wasm/nbmovie_wasm_bg.d5d51939.wasm";

        const dataid = passedDataId
                    || $(`a[href*='${playKey}']`).first().attr("dataid")
                    || $("a.episode-link").first().attr("dataid")
                    || "";

        if (!dataid || !playKey || !userlink) return [];

        const signedApiPath = await getSignedPlayUrl(wasmJsPath, wasmBgPath, nbSt, dataid, userlink, playKey);
        const fullApiUrl = signedApiPath.startsWith("http") ? signedApiPath : `${BASE_URL}${signedApiPath}`;

        const apiHeaders = {
            ...HEADERS,
            "Referer": epUrl,
            "Accept": "application/json, text/plain, */*",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "cors"
        };
        if (cookieStr) apiHeaders["Cookie"] = cookieStr;

        const apiRes = await axios.get(fullApiUrl, { headers: apiHeaders });
        const qualityUrls = apiRes.data?.data?.quality_urls || [];

        return qualityUrls
            .filter(q => !q.locked && q.url && q.url.startsWith("http"))
            .map(q => ({
                name: `4KVM ${q.title || "1080p"}`,
                title: `${q.description || "Siêu nét"} (${q.title}) - HLS`,
                url: q.url,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: { request: { "Origin": BASE_URL, "User-Agent": HEADERS["User-Agent"] } }
                }
            }));
    } catch (e) {
        console.error("Lỗi Stream:", e.response?.status, e.response?.data || e.message);
        return [];
    }
}

module.exports = { getCatalog, getMeta, getStreams };
