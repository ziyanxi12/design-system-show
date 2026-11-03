import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8092,
    // 后端（lib-resource-service，本地 8009）：/api 接口与 /static 静态资源直通代理，
    // 前端全部同源相对路径（后端 PUBLIC_ORIGIN 留空返回相对 URL），不依赖 CORS
    proxy: {
      "/api": "http://localhost:8009",
      "/static": "http://localhost:8009",
    },
  },
})
