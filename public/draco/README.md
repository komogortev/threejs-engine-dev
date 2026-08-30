# Self-hosted Draco decoder

Vendored from `three/examples/jsm/libs/draco/gltf/` (three 0.172.0) so Draco-compressed
GLBs decode without fetching the decoder from `gstatic.com` — required for offline /
blocked-CDN sessions. Wired via `localDracoDecoderPath()` in `@base/threejs-engine`
(`AssetLoader`) and `@base/ui` (`editor/gltfLoaderFactory`).

To update after a three bump:

    cp node_modules/three/examples/jsm/libs/draco/gltf/{draco_decoder.js,draco_decoder.wasm,draco_wasm_wrapper.js} public/draco/gltf/
