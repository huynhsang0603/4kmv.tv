const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { getCatalog, getMeta, getStreams } = require("./scraper");

const manifest = {
    id: "org.nuvio.4kvm.v3",
    version: "3.0.0",
    name: "4KVM 影视 (Bản Hoàn Chỉnh)",
    description: "Trang chủ, Phim mới 2026, Phim bộ Trung Quốc, Hoạt hình & Phát 1080p HLS",
    resources: ["catalog", "meta", "stream"],
    types: ["series", "movie"],
    idPrefixes: ["4kvm:"],
    catalogs: [
        { type: "series", id: "4kvm_hot", name: "4KVM - Hôm Nay Xem Gì", extra: [{ name: "search", isRequired: false }] },
        { type: "series", id: "4kvm_updated", name: "4KVM - Phim Mới Cập Nhật", extra: [{ name: "skip", isRequired: false }] },
        { type: "series", id: "4kvm_2026", name: "4KVM - Phim Mới 2026 Nhất", extra: [{ name: "skip", isRequired: false }] },
        { type: "series", id: "4kvm_cn_drama", name: "4KVM - Phim Bộ Trung Quốc", extra: [{ name: "skip", isRequired: false }] },
        { type: "series", id: "4kvm_tv", name: "4KVM - Phim Truyền Hình", extra: [{ name: "skip", isRequired: false }] },
        { type: "series", id: "4kvm_anime", name: "4KVM - Phim Hoạt Hình", extra: [{ name: "skip", isRequired: false }] },
        { type: "movie", id: "4kvm_movies", name: "4KVM - Phim Lẻ Mới", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] }
    ]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ id, extra }) => {
    try { return { metas: await getCatalog(id, extra) }; }
    catch (err) { return { metas: [] }; }
});

builder.defineMetaHandler(async ({ type, id }) => {
    try { return { meta: await getMeta(type, id) }; }
    catch (err) { return { meta: null }; }
});

builder.defineStreamHandler(async ({ id }) => {
    try { return { streams: await getStreams(id) }; }
    catch (err) { return { streams: [] }; }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
