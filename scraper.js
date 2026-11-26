const streamMap = new Map();

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
        const [viTitle, viDesc, imdbId] = await Promise.all([
            translateText(rawTitle, "vi"),
            translateText(rawDesc, "vi"),
            getImdbIdFromCnTitle(rawTitle)
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

                // Nếu có mã IMDb (tt...), dùng chuẩn tt123456:1:epNum để OpenSubtitles v3 tự bắt phụ đề
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
            id,
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
        // Giải mã ngược từ tt123456:1:epNum về lại payload gốc của 4KVM
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
