import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid()],
  server: {
    host: "0.0.0.0",
    port: 8091,
    // 后端（lib-resource-service，本地 8009）：/api 接口与 /static 静态资源直通代理，
    // 前端全部同源相对路径（后端 PUBLIC_ORIGIN 留空返回相对 URL），不依赖 CORS
    proxy: {
      "/api": "http://localhost:8009",
      "/static": "http://localhost:8009",
    },
  },
})
