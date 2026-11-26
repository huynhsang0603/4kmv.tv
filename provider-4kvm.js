const RENDER_4KVM = "https://onrender.com";

async function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
    try {
        let rawId = String(tmdbId || "");
        if (tmdbId && typeof tmdbId === "object" && tmdbId.id) {
            rawId = String(tmdbId.id);
        }

        let queryId = rawId;
        if (!rawId.includes(":") && mediaType !== "movie") {
            const s = seasonNum || 1;
            const e = episodeNum || 1;
            queryId = `${rawId}:${s}:${e}`;
        }

        const typePath = mediaType === "movie" ? "movie" : "series";
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
                "User-Agent": "Mozilla/5.0"
            }
        }));
    } catch (e) {
        return [];
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { getStreams };
}
