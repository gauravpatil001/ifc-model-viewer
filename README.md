# IFC Model Viewer (Starter)

This is a minimal browser-based IFC viewer with local dependencies (no runtime CDN imports).

## What it does

- Creates a basic 3D scene with camera controls.
- Loads a local `.ifc` file via file picker.
- Fits camera to the loaded model.

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
