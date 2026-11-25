async function getStreams(rawId) {
    try {
        const [encodedPath, passedDataId] = rawId.replace("4kvm:", "").split("|");
        const path = decodeURIComponent(encodedPath);
        const epUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;

        const playKeyMatch = path.match(/\/play\/([^/?#]+)/);
        const secretKey = playKeyMatch ? playKeyMatch[1] : "";

        const { data: html } = await axios.get(epUrl, { headers: HEADERS });
        const $ = cheerio.load(html);

        const nbSt = $("#nb-st").attr("content") || String(Date.now());
        const wasmJsPath = $("#wasm-cfg").attr("data-js") || "/static/wasm/nbmovie_wasm.426511b7.js";
        const wasmBgPath = $("#wasm-cfg").attr("data-bg") || "/static/wasm/nbmovie_wasm_bg.d5d51939.wasm";

        const dataid = passedDataId 
                    || $(`a[href*='${secretKey}']`).first().attr("dataid") 
                    || $("a.episode-link").first().attr("dataid") 
                    || "";

        console.log("[4KVM Debug] Đang lấy stream:", { epUrl, dataid, secretKey, nbSt });

        if (!dataid || !secretKey) {
            console.error("[4KVM Lỗi] Không tìm thấy dataid hoặc secretKey");
            return [];
        }

        const signedApiPath = await getSignedPlayUrl(wasmJsPath, wasmBgPath, nbSt, dataid, secretKey);
        const fullApiUrl = signedApiPath.startsWith("http") ? signedApiPath : `${BASE_URL}${signedApiPath}`;
        console.log("[4KVM Debug] API URL:", fullApiUrl);

        const apiRes = await axios.get(fullApiUrl, {
            headers: {
                ...HEADERS,
                "Referer": epUrl,
                "Accept": "application/json, text/plain, */*"
            }
        });

        const qualityUrls = apiRes.data?.data?.quality_urls || [];
        console.log("[4KVM Debug] Số luồng trả về:", qualityUrls.length);

        return qualityUrls
            .filter(q => !q.locked && q.url && q.url.startsWith("http"))
            .map(q => ({
                name: `4KVM ${q.title || "1080p"}`,
                title: `${q.description || "Siêu nét"} (${q.title}) - HLS`,
                url: q.url,
                behaviorHints: {
                    notWebReady: true,
                    proxyHeaders: {
                        request: {
                            "Origin": BASE_URL,
                            "User-Agent": HEADERS["User-Agent"]
                        }
                    }
                }
            }));
    } catch (e) {
        console.error("[4KVM Lỗi Stream]:", e.response?.data || e.message);
        return [];
    }
}
