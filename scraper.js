async function getStreams(rawId) {
    try {
        const [encodedPath, passedDataId] = rawId.replace("4kvm:", "").split("|");
        const path = decodeURIComponent(encodedPath);
        const epUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;

        // Tách mã tập (VD: /play/ch4ufxhyb -> ch4ufxhyb) bằng split để không bao giờ bị mất dấu ngoặc
        const playKey = path.split("/play/").pop().split("?").shift().split("#").shift().trim();

        const pageRes = await axios.get(epUrl, { headers: HEADERS });
        const html = pageRes.data;
        const rawCookies = pageRes.headers["set-cookie"];
        const cookieStr = Array.isArray(rawCookies)
            ? rawCookies.map(c => c.split(";").shift()).join("; ")
            : "";

        // Tách chính xác chuỗi ruột bên trong userlink:'...' bằng split
        let userlink = "";
        if (html.includes("userlink:'")) {
            userlink = html.split("userlink:'").pop().split("'").shift().trim();
        } else if (html.includes('userlink:"')) {
            userlink = html.split('userlink:"').pop().split('"').shift().trim();
        }

        const $ = cheerio.load(html);
        const nbSt = $("#nb-st").attr("content") || String(Date.now() - 5000);
        const wasmJsPath = $("#wasm-cfg").attr("data-js") || "/static/wasm/nbmovie_wasm.426511b7.js";
        const wasmBgPath = $("#wasm-cfg").attr("data-bg") || "/static/wasm/nbmovie_wasm_bg.d5d51939.wasm";

        const dataid = passedDataId
                    || $(`a[href*='${playKey}']`).first().attr("dataid")
                    || $("a.episode-link").first().attr("dataid")
                    || "";

        console.log("[4KVM Debug]", { dataid, playKey, userlink });

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
