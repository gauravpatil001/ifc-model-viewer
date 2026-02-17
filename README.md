# IFC Model Viewer (Starter)

This is a minimal browser-based IFC viewer with local dependencies (no runtime CDN imports).

## What it does

- Creates a basic 3D scene with camera controls.
- Loads a local `.ifc` file via file picker.
- Fits camera to the loaded model.

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
Three.js scene graph -> WebGL render in browser
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

## Next steps

- Add element picking and metadata panel.
- Add visibility filters by IFC type (walls, slabs, doors).
- Add clipping planes and section views.

## Troubleshooting

- If clicking `Open IFC` appears to do nothing, check the status text at the top.
- If `npm` fails in PowerShell because scripts are disabled, use `npm.cmd` instead of `npm`.
- If install fails with cache permission errors, run:
  `set npm_config_cache=.npm-cache` (cmd) or `$env:npm_config_cache='.npm-cache'` (PowerShell) before install.
- Browser console `favicon.ico 404` is harmless for this starter.
