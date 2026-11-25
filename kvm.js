const axios = require("axios");
const cheerio = require("cheerio");
const { BASE_URL, HEADERS } = require("./utils");
const { getSignedPlayUrl } = require("./wasm");

async function fetch4kvmStreams(originName, epNum) {
    if (!originName) return [];
    try {
        const cleanQuery = originName.split(":").shift().split("：").shift().trim();
        const searchUrl = `${BASE_URL}/search?q=${encodeURIComponent(cleanQuery)}`;
        const searchRes = await axios.get(searchUrl, { headers: HEADERS, timeout: 6000 });
        const $s = cheerio.load(searchRes.data);

        let movieLink = "";
        $s("h3").each((i, h3) => {
            if (!movieLink) {
                const aTag = $s(h3).closest("div.flex, div.grid > div, article, div").find("a[href]").first();
                const href = aTag.attr("href");
                if (href && (href.includes("/play/") || href.includes("/detail/"))) {
                    movieLink = href;
                }
            }
        });

        if (!movieLink) return [];
        const detailUrl = movieLink.startsWith("http") ? movieLink : `${BASE_URL}${movieLink}`;
        const detailRes = await axios.get(detailUrl, { headers: HEADERS, timeout: 6000 });
        const $d = cheerio.load(detailRes.data);

        let targetHref = "";
        let targetDataId = "";
        $d("a.episode-link, a[href*='/play/'][dataid]").each((i, a) => {
            const epText = ($d(a).attr("data-episode") || $d(a).text()).trim().replace(/\D/g, "");
            if (epText === String(epNum) && !targetDataId) {
                targetHref = $d(a).attr("href") || "";
                targetDataId = $d(a).attr("dataid") || "";
            }
        });

        if (!targetHref || !targetDataId) return [];
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

        if (!userlink || !playKey) return [];

        // Truyền đúng thứ tự chuẩn của 4kvm.tv: (dataid, playKey, quality, userlink)
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
        return [];
    }
}

module.exports = { fetch4kvmStreams };
