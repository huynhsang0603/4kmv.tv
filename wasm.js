const axios = require("axios");
const vm = require("vm");
const { BASE_URL, HEADERS } = require("./utils");

let cachedWasmFactory = null;
let cachedWasmUrl = "";

async function getSignedPlayUrl(jsPath, wasmPath, nbStContent, dataid, secretKey) {
    const fullJsUrl = jsPath.startsWith("http") ? jsPath : BASE_URL + jsPath;
    const fullWasmUrl = wasmPath.startsWith("http") ? wasmPath : BASE_URL + wasmPath;

    if (!cachedWasmFactory || cachedWasmUrl !== fullWasmUrl) {
        const [jsRes, wasmRes] = await Promise.all([
            axios.get(fullJsUrl, { headers: HEADERS, responseType: "text" }),
            axios.get(fullWasmUrl, { headers: HEADERS, responseType: "arraybuffer" })
        ]);

        const jsCode = jsRes.data
            .replace(/import\.meta\.url/g, JSON.stringify(fullJsUrl))
            .replace(/export\s+function\s+build_play_url/g, "exports.build_play_url = function")
            .replace(/export\s+\{[^}]+\};?/g, "");

        const wasmBytes = new Uint8Array(wasmRes.data);

        cachedWasmFactory = async (stVal) => {
            const exportsObj = {};
            function HTMLMetaElement() {}
            const fakeElements = {
                "nb-st": Object.assign(new HTMLMetaElement(), { content: String(stVal) }),
                "nb-plt": Object.assign(new HTMLMetaElement(), { content: String(Date.now()) })
            };

            function Window() {}
            const fakeWindow = new Window();
            fakeWindow.location = {
                href: BASE_URL + "/",
                hostname: "www.4kvm.tv",
                host: "www.4kvm.tv",
                origin: BASE_URL,
                protocol: "https:"
            };
            fakeWindow.document = {
                getElementById: (id) => fakeElements[id] || null,
                location: fakeWindow.location
            };

            const sandbox = {
                exports: exportsObj,
                wasmBytes,
                window: fakeWindow,
                self: fakeWindow,
                globalThis: fakeWindow,
                document: fakeWindow.document,
                location: fakeWindow.location,
                HTMLMetaElement,
                Window,
                TextDecoder,
                TextEncoder,
                WebAssembly,
                Uint8Array,
                Int32Array,
                DataView,
                Date,
                Math,
                Error,
                TypeError,
                console,
                URL
            };

            vm.createContext(sandbox);
            // Khởi tạo trực tiếp bên trong sandbox để đồng nhất Object.prototype và Buffer
            vm.runInContext(jsCode + "\ninitSync({ module: wasmBytes });", sandbox);
            return exportsObj;
        };

        cachedWasmUrl = fullWasmUrl;
    }

    const wasmExports = await cachedWasmFactory(nbStContent);
    return wasmExports.build_play_url(String(dataid), String(secretKey), "1080", "0");
}

module.exports = { getSignedPlayUrl };
