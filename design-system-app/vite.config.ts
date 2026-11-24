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
      // /main 网关（同 admin 端模式：生产由 nginx /main 承载，dev 代理到 mock-api 3090）——
      // 组件库明细接口 GET /main/rest.root/workspace/pixsoFile/library?fileKey=… 走这里
      "/main": "http://localhost:3090",
      // 缩略图图片服务桥（须排在 /api 之前——vite 按键序先匹配先赢）：
      // 组件缩略图经 origin+"/api"+thumbnail_url 访问（生产由网关路由到独立图片服务），
      // dev 用 mock-api(3090) 模拟该服务：剥掉 /api 前缀后落到它的 /static/... 路由
      "/api/static": {
        target: "http://localhost:3090",
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/api": "http://localhost:8009",
      "/static": "http://localhost:8009",
    },
  },
})
