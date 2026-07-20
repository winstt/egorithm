import { defineConfig } from 'vite'

// base './' → works both on <user>.github.io/egorithm/ and locally.
// data/ and media/ live at repo root; vite serves them in dev, deploy.yml
// copies them into dist/ for Pages.
export default defineConfig({
  base: './',
  build: { outDir: 'dist' },
})
