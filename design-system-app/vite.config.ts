import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 8091,
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
