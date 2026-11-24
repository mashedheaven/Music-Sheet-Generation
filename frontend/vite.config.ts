import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The frontend talks to the API through same-origin `/api` URLs. In
// development Vite proxies them to the FastAPI server, which avoids CORS
// problems entirely (audio, SSE and downloads all "just work").
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000'
  const proxy = {
    '/api': { target, changeOrigin: true },
  }
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      chunkSizeWarningLimit: 2000,
      rolldownOptions: {
        output: {
          // OpenSheetMusicDisplay relies on class/function names at runtime;
          // mangling them breaks score rendering in production builds.
          keepNames: true,
          advancedChunks: {
            groups: [{ name: 'osmd', test: /node_modules[\\/]opensheetmusicdisplay/ }],
          },
        },
      },
    },
  }
})
