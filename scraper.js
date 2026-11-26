async function getStreams(rawId) {
    try {
        let targetPayload = rawId.replace("4kvm:", "");
        if (/^tt\d+/i.test(rawId)) {
            if (streamMap.has(rawId)) {
                targetPayload = streamMap.get(rawId);
            } else {
                const imdbOnly = rawId.split(":").shift().toLowerCase();
                const { IMDB_DICT } = require("./utils");
                let zhName = "";
                for (const [k, v] of Object.entries(IMDB_DICT || {})) {
                    if (v === imdbOnly) {
                        zhName = k;
                        break;
                    }
                }
                if (zhName) {
                    const searchRes = await getCatalog("4kvm_hot", { search: zhName });
                    if (searchRes && searchRes.length > 0) {
                        const firstItem = searchRes.shift();
                        await getMeta("series", firstItem.id);
                        if (streamMap.has(rawId)) {
                            targetPayload = streamMap.get(rawId);
                        }
                    }
                }
            }
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

        const imdbTag = /^tt\d+/i.test(rawId) ? ` [${rawId.split(":").shift()}]` : "";

        return qualityUrls
            .filter(q => !q.locked && q.url && q.url.startsWith("http"))
            .map(q => ({
                name: `🎬 4KVM ${q.title || "1080p"}${imdbTag}`,
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
