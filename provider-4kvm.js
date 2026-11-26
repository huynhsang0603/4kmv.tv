const RENDER_4KVM = "https://onrender.com";

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        let rawId = String(tmdbId || "");
        let type = mediaType;
        let seasonTarget = parseInt(String(seasonNum || "1").replace(/\D/g, ""), 10) || 1;
        let epTarget = parseInt(String(episodeNum || "1").replace(/\D/g, ""), 10) || 1;

        if (tmdbId && typeof tmdbId === "object" && tmdbId.id) {
            rawId = String(tmdbId.id);
            type = tmdbId.type || mediaType;
            seasonTarget = parseInt(String(tmdbId.season || seasonNum || "1").replace(/\D/g, ""), 10) || 1;
            epTarget = parseInt(String(tmdbId.episode || episodeNum || "1").replace(/\D/g, ""), 10) || 1;
        }

        const baseId = rawId.split(":").shift().trim();
        if (!baseId) return [];

        if (rawId.includes(":")) {
            const parts = rawId.split(":");
            if (parts[1] && !isNaN(parseInt(parts[1], 10))) seasonTarget = parseInt(parts[1], 10);
            if (parts[2] && !isNaN(parseInt(parts[2], 10))) epTarget = parseInt(parts[2], 10);
        }

        const isMovie = (type === "movie");
        const typePath = isMovie ? "movie" : "series";
        const queryId = isMovie ? baseId : `${baseId}:${seasonTarget}:${epTarget}`;

        const res = await fetch(`${RENDER_4KVM}/stream/${typePath}/${encodeURIComponent(queryId)}.json`);
        const json = await res.json();
        const streams = (json && json.streams) || [];

        return streams.map(s => ({
            name: s.name || "4KVM 1080p",
            title: s.title || "4KVM HLS",
            url: s.url,
            quality: "1080p",
            provider: "4KVM",
            headers: (s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request) || {
                "Origin": "https://4kvm.tv",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        }));
    } catch (e) {
        return [];
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams };
}
