const { getKkCatalog, getKkMeta, fetchKkStreams } = require("./kkphim");
const { fetch4kvmStreams } = require("./kvm");

async function getCatalog(id, extra) {
    return await getKkCatalog(id, extra);
}

async function getMeta(type, id) {
    return await getKkMeta(type, id);
}

async function getStreams(rawId) {
    const parts = rawId.replace("kkphim:", "").split("|");
    const slug = parts.shift() || "";
    const epNum = parts.shift() || "1";
    const originName = decodeURIComponent(parts.shift() || "");

    const [kkStreams, kvmStreams] = await Promise.all([
        fetchKkStreams(slug, epNum),
        fetch4kvmStreams(originName, epNum)
    ]);

    return [...kkStreams, ...kvmStreams];
}

module.exports = { getCatalog, getMeta, getStreams };
