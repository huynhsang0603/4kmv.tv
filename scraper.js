const axios = require("axios");
const cheerio = require("cheerio");
const { BASE_URL, HEADERS, translateText, translateBatch } = require("./utils");

// Hàm chuẩn hóa đường dẫn ảnh bìa
function fixPosterUrl(src) {
    if (!src || typeof src !== 'string') return "";
    if (src.startsWith("//")) return "https:" + src;
    if (src.startsWith("/")) return BASE_URL + src;
    return src;
}

// Hàm bóc tách danh sách phim chuẩn theo đường dẫn /play/ của 4kvm.tv
function parseItems($, container) {
    const items = [];
    $(container).find("a[href*='/play/']").each((i, el) => {
        const link = $(el).attr("href");
        if (!link) return;

        const card = $(el).closest(".group, .relative, div");
        let title = card.find("img").first().attr("alt")
                 || card.find("h3, h4, .font-medium, .font-semibold, .truncate").first().text()
                 || $(el).attr("title")
                 || $(el).text();

        title = title ? title.trim() : "";
        if (!title || title.length <= 1 || /^\d+$/.test(title)) return;

        const rawPoster = card.find("img").first().attr("data-src")
                       || card.find("img").first().attr("src")
                       || "";
        const poster = fixPosterUrl(rawPoster);
        const badge = card.find("span.badge").first().text().trim();

        if (!items.some(x => x.link === link)) {
            items.push({ title, link, poster, badge });
        }
    });
    return items;
}

// 1. LẤY DANH SÁCH TRANG CHỦ, PHIM MỚI & TÌM KIẾM (DỊCH GỘP 1 LẦN)
async function getCatalog(id, extra) {
    let url = BASE_URL;
    const page = extra && extra.skip ? Math.floor(extra.skip / 30) + 1 : 1;

    if (extra && extra.search) {
        const zhKeyword = await translateText(extra.search, "zh-CN");
        url = `${BASE_URL}/search?q=${encodeURIComponent(zhKeyword)}&page=${page}`;
    } else if (id === "4kvm_latest") {
        url = `${BASE_URL}/filter?years=1&page=${page}`;
    } else if (id === "4kvm_tvshows") {
        url = `${BASE_URL}/filter?type=2&years=1&page=${page}`;
    } else if (id === "4kvm_movies") {
        url = `${BASE_URL}/filter?type=1&years=1&page=${page}`;
    } else if (id === "4kvm_anime") {
        url = `${BASE_URL}/filter?type=3&years=1&page=${page}`;
    }

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

        const limitedItems = rawItems.slice(0, 25);
        if (limitedItems.length === 0) return [];

        // Gom toàn bộ tiêu đề gốc thành 1 mảng và dịch gộp trong 1 request duy nhất
        const rawTitles = limitedItems.map(item => item.title);
        const viTitles = await translateBatch(rawTitles, "vi");

        return limitedItems.map((item, index) => {
            const viTitle = viTitles[index] || item.title;
            const path = item.link.replace(BASE_URL, "").replace("https://4kvm.tv", "");
            return {
                id: `4kvm:${encodeURIComponent(path)}`,
                type: id === "4kvm_movies" ? "movie" : "series",
                name: `${viTitle} (${item.title})`,
                poster: item.poster,
                background: item.poster,
                description: item.badge ? `Trạng thái: ${item.badge}` : ""
            };
        });
    } catch (error) {
        console.error("Error fetching catalog:", error);
        return [];
    }
}

// 2. LẤY CHI TIẾT PHIM & DANH SÁCH TẬP
async function getMeta(type, id) {
    const path = decodeURIComponent(id.replace("4kvm:", ""));
    const movieUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    try {
        const { data } = await axios.get(movieUrl, { headers: HEADERS });
        const $ = cheerio.load(data);

        const rawTitle = $("h1").first().text().trim() || $("h2").first().text().trim();
        let rawDesc = "";
        $("h3").each((i, h3) => {
            if ($(h3).text().includes("剧情简介")) {
                rawDesc = $(h3).next().text().trim();
            }
        });

        const rawPoster = $(`img[alt*='${rawTitle}']`).first().attr("src") 
                       || $("img[src*='upload'], img[src*='douban'], img[src*='tmdb']").first().attr("src") 
                       || "";
        const poster = fixPosterUrl(rawPoster);

        // Dịch gộp cả tiêu đề và mô tả trong 1 lần gọi
        const [viTitle, viDesc] = await translateBatch([rawTitle, rawDesc], "vi");

        const videos = [];
        const seenEpLinks = new Set();

        $("h2").each((i, h2) => {
            if ($(h2).text().includes("选集")) {
                $(h2).parent().parent().find("a[href*='/play/']").each((idx, a) => {
                    const epHref = $(a).attr("href");
                    const epText = $(a).text().trim();
                    if (epHref && !seenEpLinks.has(epHref)) {
                        seenEpLinks.add(epHref);
                        const epPath = epHref.replace(BASE_URL, "").replace("https://4kvm.tv", "");
                        videos.push({
                            id: `4kvm:${encodeURIComponent(epPath)}`,
                            title: /^\d+$/.test(epText) ? `Tập ${epText}` : epText,
                            season: 1,
                            episode: parseInt(epText) || (videos.length + 1)
                        });
                    }
                });
            }
        });

        if (videos.length === 0) {
            videos.push({ id, title: "Bản Đầy Đủ", season: 1, episode: 1 });
        }

        return {
            id,
            type,
            name: `${viTitle} (${rawTitle})`,
            poster,
            background: poster,
            description: viDesc,
            videos
        };
    } catch (error) {
        console.error("Error fetching meta:", error);
        return {};
    }
}

// 3. LẤY LUỒNG PHÁT M3U8 (DOUYINBIT.COM)
async function getStreams(id) {
    const path = decodeURIComponent(id.replace("4kvm:", ""));
    const epUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    try {
        const { data } = await axios.get(epUrl, { headers: HEADERS });
        const $ = cheerio.load(data);

        const foundUrls = new Set();
        const scanHtml = (html) => {
            const regex = /(https?:(?:\\\/|\/)+[^"'\s\\]+\.m3u8[^"'\s\\]*)/gi;
            let match;
            while ((match = regex.exec(html)) !== null) {
                foundUrls.add(match[0].replace(/\\\//g, "/"));
            }
        };

        scanHtml(data);

        for (const iframe of $("iframe").toArray()) {
            let src = $(iframe).attr("src") || $(iframe).attr("data-src");
            if (src) {
                if (src.startsWith("//")) src = "https:" + src;
                else if (src.startsWith("/")) src = BASE_URL + src;

                if (src.startsWith("http")) {
                    try {
                        const res = await axios.get(src, { headers: { ...HEADERS, "Referer": epUrl }, timeout: 5000 });
                        scanHtml(res.data);
                    } catch (e) {}
                }
            }
        }

        return Array.from(foundUrls).map((m3u8Url, idx) => ({
            name: `4KVM Server #${idx + 1}`,
            title: "1080p HLS (Tự động nối TS)",
            url: m3u8Url,
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
    } catch (error) {
        console.error("Error fetching streams:", error);
        return [];
    }
}

module.exports = { getCatalog, getMeta, getStreams };
