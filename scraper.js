function parseItems($, container) {
    const items = [];
    // Bắt cả thẻ link /play/ (ngoài trang chủ/lọc) lẫn thẻ link trang tìm kiếm
    $(container).find("a[href*='/play/'], a[href*='/detail/'], a[href*='/vod/']").each((i, el) => {
        const link = $(el).attr("href");
        if (!link) return;
        const card = $(el).closest(".group, .relative, article, li, div");
        let title = card.find("h3, h4, .font-medium, .font-semibold, .truncate").first().text()
                 || card.find("img").first().attr("alt")
                 || $(el).attr("title")
                 || $(el).text();
        title = title ? title.trim() : "";

        // Bỏ qua các thẻ số tập, từ khóa tìm kiếm phụ hoặc chữ rác
        if (!title || title.length <= 1 || /^\d+$/.test(title) || title.includes("立即播放")) return;

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
        // Nếu người dùng đã nhập sẵn tiếng Trung thì giữ nguyên, nếu nhập tiếng Việt thì dịch sang tiếng Trung
        const hasChinese = /[\u4e00-\u9fa5]/.test(rawQuery);
        const zhKeyword = hasChinese ? rawQuery : await translateText(rawQuery, "zh-CN");
        console.log(`[4KVM Tìm kiếm] "${rawQuery}" -> "${zhKeyword}"`);
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
            // Ở trang tìm kiếm: chỉ lấy các thẻ nằm trước mục "相关搜索" (Tìm kiếm liên quan)
            $("h3").each((i, h3) => {
                const title = $(h3).text().trim();
                const card = $(h3).closest("div.flex, div.grid > div, article, div");
                const aTag = card.find("a[href]").first();
                const link = aTag.attr("href");
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

        const limited = rawItems.slice(0, 30);
        if (limited.length === 0) return [];
        const viTitles = await translateBatch(limited.map(i => i.title), "vi");

        return limited.map((item, idx) => {
            const path = item.link.replace(BASE_URL, "").replace("https://www.4kvm.tv", "").replace("https://4kvm.tv", "");
            return {
                id: `4kvm:${encodeURIComponent(path)}`,
                type: id === "4kvm_movies" ? "movie" : "series",
                name: `${viTitles[idx] || item.title} (${item.title})`,
                poster: item.poster,
                background: item.poster,
                description: item.badge ? `Cập nhật: ${item.badge}` : ""
            };
        });
    } catch (e) {
        console.error("Lỗi Catalog:", e.message);
        return [];
    }
}

module.exports = { getCatalog, getMeta, getStreams };
