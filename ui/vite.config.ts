import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr"
import glsl from 'vite-plugin-glsl'
import { cloudflare } from "@cloudflare/vite-plugin";
import { resolve } from 'path'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 8588,      // Vite dev server (HMR)
    strictPort: true, // fail if port is taken
    host: true,       // Allow external connections
    allowedHosts: [
      'localhost',
      '127.0.0.1',
    ]
  },
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            main: resolve(__dirname, 'index.html'),
            'sim': resolve(__dirname, 'sim.html'),
          },
        },
      },
    },
  },
  plugins: [
    react({
      // enable Babel stage so we can inject the transform
      babel: {
        plugins: [
          // minimal config
          ["module:@preact/signals-react-transform", {}], // https://www.npmjs.com/package/@preact/signals-react
          ["@emotion/babel-plugin", {}], // https://emotion.sh/docs/@emotion/babel-plugin
        ],
      },
    }),
    svgr(),
    glsl(),
    // Cloudflare worker for API proxying
    cloudflare(),
  ],
})
