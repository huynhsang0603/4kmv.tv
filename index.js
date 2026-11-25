const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { getCatalog, getMeta, getStreams } = require("./scraper");

const manifest = {
    id: "org.nuvio.4kvm.modular",
    version: "2.0.1", // Cập nhật phiên bản
    name: "4KVM 影视 (Bản Hoàn Chỉnh)",
    description: "Trang chủ, Phim mới, Tìm kiếm Tiếng Việt & Phát HLS từ 4kvm.tv",
    resources: ["catalog", "meta", "stream"],
    types: ["series", "movie"],
    idPrefixes: ["4kvm:"],
    catalogs: [
        {
            type: "series",
            id: "4kvm_hot",
            name: "4KVM - Hôm Nay Xem Gì",
            extra: [{ name: "search", isRequired: false }]
        },
        {
            type: "series",
            id: "4kvm_latest",
            name: "4KVM - Phim Mới Phát Hành",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "series",
            id: "4kvm_tvshows",
            name: "4KVM - Phim Bộ Mới Cập Nhật",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "series",
            id: "4kvm_anime",
            name: "4KVM - Hoạt Hình / Tu Tiên",
            extra: [{ name: "skip", isRequired: false }]
        },
        {
            type: "movie",
            id: "4kvm_movies",
            name: "4KVM - Phim Lẻ Mới",
            extra: [
                { name: "search", isRequired: false },
                { name: "skip", isRequired: false }
            ]
        }
    ]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ id, extra }) => {
    try {
        const metas = await getCatalog(id, extra);
        return { metas };
    } catch (err) {
        console.error("Lỗi Catalog:", err.message);
        return { metas: [] };
    }
});

builder.defineMetaHandler(async ({ type, id }) => {
    try {
        const meta = await getMeta(type, id);
        return { meta };
    } catch (err) {
        console.error("Lỗi Meta:", err.message);
        return { meta: null };
    }
});

builder.defineStreamHandler(async ({ id }) => {
    try {
        const streams = await getStreams(id);
        return { streams };
    } catch (err) {
        console.error("Lỗi Stream:", err.message);
        return { streams: [] };
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
