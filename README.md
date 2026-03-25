# threejs-engine-dev

Vue 3 + Vite **playground** for the [`@base/threejs-engine`](https://github.com/komogortev/vue-three-base-packages) stack: **scene view**, **terrain editor** (orbit camera, scatter zones, GLTF placement), and **walk mode** with third-person / first-person camera from `@base/camera-three` and locomotion from `@base/player-three`.

**Live site (GitHub Pages):** [komogortev.github.io/threejs-engine-dev](https://komogortev.github.io/threejs-engine-dev/)

---

## Features

- **Menu** — route hub for Game, Scene, Editor, Settings  
- **Scene** — third-person / first-person camera presets (`@base/camera-three`)  
- **Editor** — `EditorSceneModule`: OrbitControls, TransformControls, terrain authoring, Author/Bird-eye orbit + WASD on session avatar, walk simulation  
- **Descriptors** — `SceneDescriptor` + `SceneBuilder` for terrain, scatter, placed objects, optional character  

---

## Local development

### Layout (required for `pnpm` `link:` dependencies)

This repo expects the shared workspace **next to** this folder:

```text
your-workspace/
  SHARED/                 # clone: github.com/komogortev/vue-three-base-packages
  threejs-engine-dev/     # this repository
```

Dependencies in `package.json` use `link:../SHARED/packages/...`. Adjust paths if your layout differs.

### Commands

```bash
cd SHARED && pnpm install && pnpm build   # build @base/* dist outputs first
cd ../threejs-engine-dev
pnpm install
pnpm dev
```

- **Typecheck:** `pnpm run typecheck`  
- **Production build (root site):** `pnpm run build`  
- **Production build (GitHub project Pages):** set `VITE_BASE_PATH=/threejs-engine-dev/` then `pnpm run build` (CI does this automatically)

---

## GitHub Pages

GitHub Pages **does not run Vite**. This project deploys **static `dist/`** via **GitHub Actions**.

### Repository settings

1. **Settings → Pages → Build and deployment**  
   - **Source:** **GitHub Actions** (not “Deploy from a branch” with raw repo files).

2. First deployment: **Settings → Environments → `github-pages`** — approve the environment if GitHub prompts for it.

3. Workflow: [`.github/workflows/deploy-github-pages.yml`](.github/workflows/deploy-github-pages.yml)  
   - Checks out **this repo** and **[vue-three-base-packages](https://github.com/komogortev/vue-three-base-packages)** as `SHARED`  
   - Builds packages, then builds the app with `VITE_BASE_PATH=/threejs-engine-dev/`  
   - Uploads `dist/` with `actions/upload-pages-artifact@v3` (keeps dotfiles such as `.nojekyll`) and deploys with `actions/deploy-pages`

You can re-run deployment manually: **Actions → Deploy GitHub Pages → Run workflow**.

### If you still see a blank page

- Hard refresh or **Application → Service Workers → Unregister** (an old SW from a broken `/` base can cache bad responses).  
- Confirm the latest **Actions** run succeeded and **Pages** shows the deployment from that run.  
- Open the site **with** trailing slash or use the exact Pages URL: `/threejs-engine-dev/`.

### SPA deep links

`404.html` is a copy of `index.html` so refreshes on client routes (e.g. `/threejs-engine-dev/editor`) work on GitHub Pages. `.nojekyll` is included for static hosting edge cases.

---

## Tech stack

- Vue 3, Vue Router, Pinia, Vite 6, Tailwind, PWA (Vite PWA plugin)  
- three.js, `@base/engine-core`, `@base/threejs-engine`, `@base/input`, `@base/player-three`, `@base/camera-three`, `@base/audio`  

---

## License

Private / as per repository owner (default: all rights reserved unless a `LICENSE` file is added).
