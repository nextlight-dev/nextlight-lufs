import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/nextlight-lufs/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'year-in-review': resolve(__dirname, 'year-in-review.html'),
      },
    },
  },
})
