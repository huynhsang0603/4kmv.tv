const axios = require("axios");
const cheerio = require("cheerio");
const { BASE_URL, HEADERS, translateText, translateBatch, getImdbIdFromCnTitle } = require("./utils");
const { getSignedPlayUrl } = require("./wasm");

const streamMap = new Map();
const moviePathMap = new Map();

function fixPosterUrl(src) {
    if (!src || typeof src !== "string") return "";
    if (src.startsWith("//")) return "https:" + src;
    if (src.startsWith("/")) return BASE_URL + src;
    return src;
}

function parseItems($, container) {
    const items = [];
    $(container).find("a[href*='/play/'], a[href*='/detail/'], a[href*='/vod/']").each((i, el) => {
        const link = $(el).attr("href");
        if (!link) return;
        const card = $(el).closest(".group, .relative, article, li, div");
        let title = card.find("h3, h4, .font-medium, .font-semibold, .truncate").first().text()
                 || card.find("img").first().attr("alt")
                 || $(el).attr("title")
                 || $(el).text();
        title = title ? title.trim() : "";

        if (!title || title.length <= 1 || /^[\d.]+$/.test(title) || /^4k$/i.test(title) || title.includes("立即播放")) {
            title = (card.find("img").first().attr("alt") || $(el).attr("title") || "").trim();
        }
        if (!title || title.length <= 1 || /^[\d.]+$/.test(title)) return;

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
    const isSearch = Boolean(extra && extra.search);

    if (isSearch) {
        const rawQuery = extra.search.trim();
        const hasChinese = /[\u4e00-\u9fa5]/.test(rawQuery);
        const zhKeyword = hasChinese ? rawQuery : await translateText(rawQuery, "zh-CN");
        url = `${BASE_URL}/search?q=${encodeURIComponent(zhKeyword)}`;
    } else if (id === "4kvm_updated") {
        url = `${BASE_URL}/filter?years=1&sort_by=update_time&order=desc&page=${page}`;
    } else if (id === "4kvm_2026") {
        url = `${BASE_URL}/filter?years=1&page=${page}`;
    } else if (id === "4kvm_cn_drama") {
        url = `${BASE_URL}/filter?classify=2&areas=14&page=${page}`;
    } else if (id === "4kvm_tv") {
        url = `${BASE_URL}/filter?classify=2&page=${page}`;
    } else if (id === "4kvm_anime") {
        url = `${BASE_URL}/filter?classify=3&page=${page}`;
    } else if (id === "4kvm_movies") {
        url = `${BASE_URL}/filter?classify=1&page=${page}`;
    }

    try {
        const { data } = await axios.get(url, { headers: HEADERS });
        const $ = cheerio.load(data);
        let rawItems = [];

        if (isSearch) {
            $("h3").each((i, h3) => {
                const title = $(h3).text().trim();
                const card = $(h3).closest("div.flex, div.grid > div, article, div");
                const link = card.find("a[href]").first().attr("href");
                if (title && link && (link.includes("/play/") || link.includes("/detail/") || link.includes("/vod/"))) {
                    const poster = fixPosterUrl(card.find("img").first().attr("data-src") || card.find("img").first().attr("src") || "");
                    if (!rawItems.some(x => x.link === link)) {
                        rawItems.push({ title, link, poster, badge: "" });
                    }
                }
            });
        } else if (id === "4kvm_hot") {
            $("h2").each((i, h2) => {
                if ($(h2).text().includes("今天热播")) {
                    rawItems = parseItems($, $(h2).parent().parent());
                }
            });
        }

        if (rawItems.length === 0) {
            rawItems = parseItems($, $("main").length ? $("main") : $("body"));
        }

        const limited = rawItems.slice(0, 24);
        if (limited.length === 0) return [];

        const [viTitles, imdbIds] = await Promise.all([
            translateBatch(limited.map(i => i.title), "vi"),
            Promise.all(limited.map(i => getImdbIdFromCnTitle(i.title, "", i.poster)))
        ]);

        return limited.map((item, idx) => {
            const path = item.link.replace(BASE_URL, "").replace("https://4kvm.tv", "").replace("http://4kvm.tv", "");
            const imdbId = imdbIds[idx];
            const finalId = imdbId || `4kvm:${encodeURIComponent(path)}`;

            if (imdbId) {
                moviePathMap.set(imdbId, path);
            }

            return {
                id: finalId,
                imdb_id: imdbId || undefined,
                type: id === "4kvm_movies" ? "movie" : "series",
                name: `${viTitles[idx] || item.title} (${item.title})`,
                poster: item.poster,
                background: item.poster,
                description: item.badge ? `Cập nhật: ${item.badge}` : ""
            };
        });
    } catch (e) {
        return [];
    }
}

async function getMeta(type, id) {
    let path = "";
    if (/^tt\d+/i.test(id) && moviePathMap.has(id)) {
        path = moviePathMap.get(id);
    } else {
        path = decodeURIComponent(id.replace("4kvm:", ""));
    }
    const movieUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;

    try {
        const { data } = await axios.get(movieUrl, { headers: HEADERS });
        const $ = cheerio.load(data);

        const rawTitle = $("h1").first().text().trim() || $("h2").first().text().trim();
        let rawDesc = "";
        $("h3").each((i, h3) => {
            if ($(h3).text().includes("剧情简介")) rawDesc = $(h3).next().text().trim();
        });

        let releaseDate = "";
        const dateMatch = data.match(/上映[\s\S]{0,100}?(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) releaseDate = dateMatch.pop();

        const poster = fixPosterUrl($(`img[alt*='${rawTitle}']`).first().attr("src") || $("img[src*='uploads'], img[src*='douban']").first().attr("src") || "");
        const [viTitle, viDesc, imdbId] = await Promise.all([
            translateText(rawTitle, "vi"),
            translateText(rawDesc, "vi"),
            getImdbIdFromCnTitle(rawTitle, releaseDate, data)
        ]);

        const videos = [];
        const seen = new Set();

        $("a.episode-link, a[href*='/play/'][dataid]").each((idx, a) => {
            const epHref = $(a).attr("href");
            const dataid = $(a).attr("dataid") || "";
            const epNumRaw = $(a).attr("data-episode") || $(a).text().trim();
            const epNum = parseInt(epNumRaw, 10) || (videos.length + 1);

            if (epHref && !seen.has(epHref)) {
                seen.add(epHref);
                const epPath = epHref.replace(BASE_URL, "").replace("https://4kvm.tv", "").replace("http://4kvm.tv", "");
                const raw4kvmPayload = `${encodeURIComponent(epPath)}|${dataid}`;

                const finalVideoId = imdbId ? `${imdbId}:1:${epNum}` : `4kvm:${raw4kvmPayload}`;
                if (imdbId) {
                    streamMap.set(finalVideoId, raw4kvmPayload);
                }

                videos.push({
                    id: finalVideoId,
                    title: /^\d+$/.test(epNumRaw) ? `Tập ${epNumRaw}` : epNumRaw,
                    season: 1,
                    episode: epNum
                });
            }
        });

        if (videos.length === 0) {
            const fallbackPayload = `${encodeURIComponent(path)}|`;
            const finalMovieId = imdbId ? imdbId : `4kvm:${fallbackPayload}`;
            if (imdbId) streamMap.set(finalMovieId, fallbackPayload);
            videos.push({ id: finalMovieId, title: "Bản Đầy Đủ", season: 1, episode: 1 });
        }

        return {
            id: imdbId || id,
            imdb_id: imdbId || undefined,
            type,
            name: `${viTitle} (${rawTitle})`,
            poster,
            background: poster,
            description: viDesc,
            videos
        };
    } catch (e) {
        return {};
    }
}


async function getStreams(rawId) {
    try {
        let targetPayload = rawId.replace("4kvm:", "");
        if (/^tt\d+/i.test(rawId) && streamMap.has(rawId)) {
            targetPayload = streamMap.get(rawId);
        }

        const parts = targetPayload.split("|");
        const encodedPath = parts.shift() || "";
        const passedDataId = parts.shift() || "";
        const path = decodeURIComponent(encodedPath);
        const epUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;

        const playKey = path.split("/play/").pop().split("?").shift().split("#").shift().trim();

        const pageRes = await axios.get(epUrl, { headers: HEADERS });
        const html = pageRes.data;
        const rawCookies = pageRes.headers["set-cookie"];
        const cookieStr = Array.isArray(rawCookies) ? rawCookies.map(c => c.split(";").shift()).join("; ") : "";

        let userlink = "";
        if (html.includes("userlink:'")) userlink = html.split("userlink:'").pop().split("'").shift().trim();
        else if (html.includes('userlink:"')) userlink = html.split('userlink:"').pop().split('"').shift().trim();

        const $ = cheerio.load(html);
        const nbSt = $("#nb-st").attr("content") || String(Date.now() - 5000);
        const wasmJsPath = $("#wasm-cfg").attr("data-js") || "/static/wasm/nbmovie_wasm.426511b7.js";
        const wasmBgPath = $("#wasm-cfg").attr("data-bg") || "/static/wasm/nbmovie_wasm_bg.d5d51939.wasm";

        const dataid = passedDataId
                    || $(`a[href*='${playKey}']`).first().attr("dataid")
                    || $("a.episode-link").first().attr("dataid")
                    || "";

        if (!dataid || !playKey || !userlink) return [];

        const signedApiPath = await getSignedPlayUrl(wasmJsPath, wasmBgPath, nbSt, dataid, playKey, userlink);
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
                name: `🎬 4KVM ${q.title || "1080p"}`,
                title: `${q.description || "Siêu nét"} (${q.title}) - HLS`,
                url: q.url,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: { request: { "Origin": BASE_URL, "User-Agent": HEADERS["User-Agent"] } }
                }
            }));
    } catch (e) {
        return [];
    }
}
async function getSubtitles(type, id) {
    try {
        if (!/^tt\d+/i.test(id)) return [];
        const subUrl = `https://strem.io{type}/${id}.json`;
        const { data } = await axios.get(subUrl, { timeout: 5000 });
        return (data && data.subtitles) || [];
    } catch (e) {
        return [];
    }
}

module.exports = { getCatalog, getMeta, getStreams, getSubtitles };

module.exports = { getCatalog, getMeta, getStreams };
