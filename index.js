const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const { getCatalog, getMeta, getStreams } = require("./scraper");

const manifest = {
    id: "org.nuvio.kkphim.4kvm",
    version: "4.0.0",
    name: "KKPhim + 4KVM (Thuyết Minh & 1080p)",
    description: "Giao diện & Tìm kiếm Tiếng Việt từ KKPhim, phát song song Thuyết Minh + 4KVM 1080p",
    resources: ["catalog", "meta", "stream"],
    types: ["series", "movie"],
    idPrefixes: ["kkphim:"],
    catalogs: [
        { type: "series", id: "kk_updated", name: "Phim Mới Cập Nhật", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] },
        { type: "series", id: "kk_series", name: "Phim Bộ Mới", extra: [{ name: "skip", isRequired: false }] },
        { type: "series", id: "kk_cn", name: "Phim Bộ Trung Quốc", extra: [{ name: "skip", isRequired: false }] },
        { type: "series", id: "kk_anime", name: "Hoạt Hình / Tu Tiên", extra: [{ name: "skip", isRequired: false }] },
        { type: "movie", id: "kk_movies", name: "Phim Lẻ Mới", extra: [{ name: "search", isRequired: false }, { name: "skip", isRequired: false }] }
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
