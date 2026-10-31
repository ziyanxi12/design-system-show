import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8092,
    // 后端（lib-resource-service，本地 8009；生产同域由 nginx 统一反代 /aaa）
    proxy: {
      "/aaa": {
        target: "http://localhost:8009",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aaa/, ""),
      },
    },
  },
})

