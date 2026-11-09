# mock-api 接口清单

零依赖 Node 服务，一个 API 一个进程一个端口（从 3090 起）。

- 一键启动：`./start.sh`（已在跑的自动跳过）；一键停止：`./stop.sh`（停 pidfile 里的进程 + 清理 3090-3099 端口段的 node 进程）
- 单独调试：`node <文件>.js`（`PORT=4000 node ...` 临时改端口）；日志 `<文件名>.log`，pid 在 `.pids/`

## 3090 · server.js — getAccount 账号搜索

GET `/getAccount?keyword=200311`

- 入参：query `keyword`（模糊匹配 account / nickName / userID，不区分大小写，空=返回全部）；header `uiplusToken` 必填
- 出参：
  - 成功：`{"content":{"<keyword>":[{"id":111,"userID":"u00111","account":"h20031134","nickName":"何光光","dept":["华为","2012实验室","UX部","设计一组"]}, …]},"errorCode":0,"success":true}`（content 的 key 是 keyword 原样回显；keyword=200311 命中 h20031134、l20031135 两条）
  - 缺 token：`{"content":null,"errorCode":401,"success":false}`（HTTP 200）
- mock 数据在 data.js（10 条，account 均为「一个字母 + 数字」格式），改后重启生效

## 3091 · face-server.js — face 用户头像

GET `/face/20031134/120`

- 入参：路径参数 `account`、`size`（固定 120，传其他值返回 400）
- account 规则：getAccount 的 account 去掉第一个字符——`h20031134` → `20031134`、`hhh344` → `hh344`（支持字母数字）
- 出参：SVG 图片（`Content-Type: image/svg+xml`），背景色由 account 哈希生成，居中显示账号数字
- 无需鉴权，直接 `<img src="http://localhost:3091/face/20031134/120">`
