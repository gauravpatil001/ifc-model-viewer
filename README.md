# IFC Model Viewer (Starter)

This is a minimal browser-based IFC viewer with local dependencies (no runtime CDN imports).

## What it does

- Loads a local `.ifc` file via file picker.
- Uses a Z-up world/view setup for model navigation.
- Fits camera to the loaded model automatically.
- Lets you click IFC elements to inspect metadata (`modelID`, `expressID`, properties JSON).
- Builds dynamic visibility filters from IFC categories present in the loaded model.
- Supports section views with clipping planes (axis + offset).

## Main dependencies

- `three`: core 3D engine (scene, camera, lights, renderer, controls).
- `web-ifc-three`: IFC loader integration for Three.js (`IFCLoader`) to parse and display IFC geometry.
- `vite`: local dev server and bundler for fast module-based development.
- Local `web-ifc` WASM binaries: WebAssembly runtime used by `web-ifc-three` to parse IFC files in the browser.

## Architecture

```text
User selects .ifc
      |
      v
UI (index.html + src/main.js)
      |
      v
IFCLoader (web-ifc-three)
      |
      v
web-ifc.wasm (local /public/wasm)
      |
      v
Model root (Z-up transform) -> Three.js scene graph -> WebGL render in browser
```

## Run locally

Install and start dev server:

```powershell
cd C:\Users\gaurav.patil_la\source\repos\ifc-model-viewer
npm.cmd install --ignore-scripts
npm.cmd run sync-wasm
npm.cmd run dev
```

Then open:

`http://localhost:5173`

## Viewer controls

- `Open IFC`: load a local IFC model.
- `Visibility`: check/uncheck IFC categories generated from the loaded file.
- `Section`: choose axis (`X`, `Y`, `Z`), set offset (`-100%` to `100%`), then `Apply` or `Clear`.
- Click in viewport: pick element and inspect metadata in the right panel.
- Orbit/pan/zoom: standard mouse controls via `OrbitControls`.

## Notes

- Category filters are generated per model, so available filter names vary by IFC file.
- Section clipping is applied in the same Z-up aligned model space used for rendering.

## Troubleshooting

- If clicking `Open IFC` appears to do nothing, check the status text at the top.
- If `npm` fails in PowerShell because scripts are disabled, use `npm.cmd` instead of `npm`.
- If install fails with cache permission errors, run:
  `set npm_config_cache=.npm-cache` (cmd) or `$env:npm_config_cache='.npm-cache'` (PowerShell) before install.
- Browser console `favicon.ico 404` is harmless for this starter.
