const axios = require("axios");

const KK_API = "https://phimapi.com";
const KK_IMG = "https://phimimg.com";

function fixKkImage(url) {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${KK_IMG}/${url.replace(/^\/+/, "")}`;
}

async function getKkCatalog(id, extra) {
    const page = extra && extra.skip ? Math.floor(extra.skip / 24) + 1 : 1;
    let apiUrl = `${KK_API}/danh-sach/phim-moi-cap-nhat?page=${page}`;

    if (extra && extra.search) {
        apiUrl = `${KK_API}/v1/api/tim-kiem?keyword=${encodeURIComponent(extra.search.trim())}&page=${page}&limit=24`;
    } else if (id === "kk_series") {
        apiUrl = `${KK_API}/v1/api/danh-sach/phim-bo?page=${page}&limit=24`;
    } else if (id === "kk_cn") {
        apiUrl = `${KK_API}/v1/api/quoc-gia/trung-quoc?page=${page}&limit=24`;
    } else if (id === "kk_anime") {
        apiUrl = `${KK_API}/v1/api/danh-sach/hoat-hinh?page=${page}&limit=24`;
    } else if (id === "kk_movies") {
        apiUrl = `${KK_API}/v1/api/danh-sach/phim-le?page=${page}&limit=24`;
    }

    try {
        const { data } = await axios.get(apiUrl, { timeout: 8000 });
        const items = data?.items || data?.data?.items || [];

        return items.map(item => ({
            id: `kkphim:${item.slug}`,
            type: (id === "kk_movies" || item.type === "single") ? "movie" : "series",
            name: item.origin_name ? `${item.name} (${item.origin_name})` : item.name,
            poster: fixKkImage(item.poster_url || item.thumb_url),
            background: fixKkImage(item.thumb_url || item.poster_url),
            description: [item.episode_current, item.quality, item.lang].filter(Boolean).join(" • ")
        }));
    } catch (e) {
        return [];
    }
}

async function getKkMeta(type, id) {
    const slug = id.replace("kkphim:", "");
    try {
        const { data } = await axios.get(`${KK_API}/phim/${slug}`, { timeout: 8000 });
        const movie = data?.movie;
        const episodes = data?.episodes || [];
        if (!movie) return {};

        const cleanDesc = (movie.content || "").replace(/<[^>]+>/g, "").trim();
        const originName = movie.origin_name || movie.name || "";

        const epMap = new Map();
        for (const server of episodes) {
            const serverData = server.server_data || [];
            for (const ep of serverData) {
                const rawLabel = String(ep.name || "").trim();
                const numStr = rawLabel.replace(/\D/g, "") || "1";
                if (!epMap.has(numStr)) {
                    epMap.set(numStr, {
                        id: `kkphim:${slug}|${numStr}|${encodeURIComponent(originName)}`,
                        title: /^\d+$/.test(rawLabel) ? `Tập ${rawLabel}` : rawLabel,
                        season: 1,
                        episode: parseInt(numStr, 10) || (epMap.size + 1)
                    });
                }
            }
        }

        const videos = Array.from(epMap.values());
        if (videos.length === 0) {
            videos.push({ id: `kkphim:${slug}|1|${encodeURIComponent(originName)}`, title: "Bản Đầy Đủ", season: 1, episode: 1 });
        }

        return {
            id,
            type: movie.type === "single" ? "movie" : "series",
            name: originName ? `${movie.name} (${originName})` : movie.name,
            poster: fixKkImage(movie.poster_url || movie.thumb_url),
            background: fixKkImage(movie.thumb_url || movie.poster_url),
            description: cleanDesc,
            videos
        };
    } catch (e) {
        return {};
    }
}

async function fetchKkStreams(slug, epNum) {
    try {
        const { data } = await axios.get(`${KK_API}/phim/${slug}`, { timeout: 6000 });
        const dubStreams = [];
        const subStreams = [];
        const episodes = data?.episodes || [];
        const movieName = data?.movie?.name || slug;

        for (const server of episodes) {
            const serverName = server.server_name || "";
            const isDub = /thuyết minh|lồng tiếng/i.test(serverName);
            const serverData = server.server_data || [];

            const targetEp = serverData.find(e => {
                const label = String(e.name || "").trim().toLowerCase();
                const cleanNum = label.replace(/\D/g, "");
                if (cleanNum && cleanNum === String(epNum)) return true;
                if (String(epNum) === "1" && (label === "full" || label === "hd")) return true;
                return false;
            });

            if (targetEp && targetEp.link_m3u8) {
                const item = {
                    name: isDub ? "🎙️ KKPhim Thuyết Minh" : "🇻🇳 KKPhim Vietsub",
                    title: `${movieName} - ${serverName} (${targetEp.name})`,
                    url: targetEp.link_m3u8
                };
                if (isDub) dubStreams.push(item);
                else subStreams.push(item);
            }
        }
        return [...dubStreams, ...subStreams];
    } catch (e) {
        return [];
    }
}

module.exports = { getKkCatalog, getKkMeta, fetchKkStreams };
