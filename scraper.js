// 3. LẤY LUỒNG PHÁT M3U8 (XUYÊN QUA BANNER QUẢNG CÁO & GIẢI MÃ BASE64)
async function getStreams(id) {
    const path = decodeURIComponent(id.replace("4kvm:", ""));
    const epUrl = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    
    const reqHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
        "Referer": BASE_URL + "/",
        "Origin": BASE_URL
    };

    try {
        const { data } = await axios.get(epUrl, { headers: reqHeaders, timeout: 8000 });
        const $ = cheerio.load(data);

        const foundUrls = new Set();

        const scanTextForM3u8 = (text) => {
            if (!text || typeof text !== "string") return;
            
            // 1. Quét link m3u8 trực tiếp hoặc dạng JSON thoát ký tự (https:\/\/oss.douyinbit.com\/...)
            const directRegex = /(https?:\/\/[^"'\s\\<>]+\.m3u8[^"'\s\\<>]*)/gi;
            let match;
            while ((match = directRegex.exec(text)) !== null) {
                foundUrls.add(match[0].replace(/\\\//g, "/"));
            }

            // 2. Quét các chuỗi Base64 chứa "aHR0c" (tức là "http") và giải mã thử xem có chứa .m3u8 không
            const b64Regex = /['"]([A-Za-z0-9+/=]{30,})['"]/g;
            while ((match = b64Regex.exec(text)) !== null) {
                try {
                    const decoded = Buffer.from(match[1], "base64").toString("utf-8");
                    if (decoded.includes(".m3u8")) {
                        const innerMatch = decoded.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
                        if (innerMatch) foundUrls.add(innerMatch[1]);
                    }
                } catch (e) {}
            }
        };

        // Quét toàn bộ HTML và các thẻ <script> của trang
        scanTextForM3u8(data);

        // Quét thêm bên trong thẻ <iframe> (nếu trình phát nằm trong iframe)
        for (const iframe of $("iframe").toArray()) {
            let src = $(iframe).attr("src") || $(iframe).attr("data-src");
            if (src) {
                if (src.startsWith("//")) src = "https:" + src;
                else if (src.startsWith("/")) src = BASE_URL + src;

                if (src.startsWith("http")) {
                    try {
                        const res = await axios.get(src, {
                            headers: { ...reqHeaders, "Referer": epUrl },
                            timeout: 5000
                        });
                        scanTextForM3u8(res.data);
                    } catch (e) {}
                }
            }
        }

        return Array.from(foundUrls).map((m3u8Url, idx) => ({
            name: `4KVM Server #${idx + 1}`,
            title: "1080p HLS (Bỏ qua quảng cáo)",
            url: m3u8Url,
            behaviorHints: {
                notWebReady: true,
                proxyHeaders: {
                    request: {
                        "Origin": BASE_URL,
                        "User-Agent": reqHeaders["User-Agent"]
                    }
                }
            }
        }));
    } catch (error) {
        console.error("Lỗi lấy stream:", error.message);
        return [];
    }
}
