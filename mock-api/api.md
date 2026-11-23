# mock-api 接口清单

零依赖 Node 服务，一个 API 一个进程一个端口（从 3090 起）。

- 一键启动：`./start.sh`（已在跑的自动跳过）；一键停止：`./stop.sh`（停 pidfile 里的进程 + 清理 3090-3099 端口段的 node 进程）
- 单独调试：`node <文件>.js`（`PORT=4000 node ...` 临时改端口）；日志 `<文件名>.log`，pid 在 `.pids/`

## 3090 · server.js — getAccount 账号搜索 / getUserInfo 用户查询

GET `/getAccount?keyword=200311`

- 入参：query `keyword`（模糊匹配 account / nickName / userID，不区分大小写，空=返回全部）；header `uiplusToken` 必填
- 出参：
  - 成功：`{"content":{"<keyword>":[{"id":111,"userID":"u00111","account":"h20031134","nickName":"何光光","dept":["华为","2012实验室","UX部","设计一组"]}, …]},"errorCode":0,"success":true}`（content 的 key 是 keyword 原样回显；keyword=200311 命中 h20031134、l20031135 两条）
  - 缺 token：`{"content":null,"errorCode":401,"success":false}`（HTTP 200）
- mock 数据在 data.js（10 条，account 均为「一个字母 + 数字」格式），改后重启生效

GET `/main/rest.root/workspace/user/getW3UserByAccounts?keyword=200311`

- 管理台人员搜索的**同源网关路径**（client.ts 以 `window.location.origin` 拼接）：生产由 nginx `/main` 网关承载真实 W3 服务，dev 经 admin vite proxy `/main` → 3090 命中本路由——与生产同款 URL 保真
- 入参 / 出参 / 数据源与 `/getAccount` **完全同构**（含 uiplusToken 必填、content 按 keyword 回显）

GET `/getUserInfo?account=h20031134`

- 入参：query `account`（精确匹配，无鉴权——服务端直连协议）
- 出参：
  - 命中：`{"content":{"account":"h20031134","nickName":"何光光","dept":["华为","2012实验室","UX部","设计一组"],"deptCode":[]},"errorCode":0,"success":true}`
  - 未命中：`{"content":null,"errorCode":404,"success":false}`
- 数据源同 data.js；供后端打点身份完整化（USER_INFO_API_URL）本地联调用

## 3090 · server.js — pixso/libraries 组件库订阅（组件 ↔ Pixso 映射：编辑路由向导数据源）

数据来自 `../scripts/pixso-mapping/fetch-subscribe.js`（demo 写死 JSON：H Design 真实库 264 条快照 + 8 个 stub 库撑领域树；正式环境换真实脚本，输出结构不变——结构契约见该文件头注释）。服务启动时加载一次。无需鉴权，CORS `*` 已开，展示端直连 `http://localhost:3090`。

GET `/pixso/libraries`

- 组件库**列表投影**（不含 components 明细）：`{"fetchedAt":"…","libraries":[{"id":"hdesign-official","name":"H Design 官网设计规范","domain":"H Design","version":"1.0","componentCount":38,"icon":"harmonyos","fileKey":"8mM_…","libraryName":"…"},…]}`
- 消费方：展示端编辑路由（`#/edit/:id`）「关联设计组件」向导的**选择规范**弹窗——`domain` 分领域树、`name` 搜索、`version/componentCount` 展示

GET `/pixso/libraries/:id`

- 单个组件库**全量**（含 components 完整清单，guid 为 key，264 条字段结构见 fetch-subscribe.js 文件头）
- 选定库后前端匹配的数据源（名字匹配在展示端跑，核心逻辑与脚本共用 `design-system-app/src/lib/match-core.js`）
- 不存在 → `404 {"detail":"组件库不存在：<id>"}`


## 3091 · face-server.js — face 用户头像

GET `/face/20031134/120`

- 入参：路径参数 `account`、`size`（固定 120，传其他值返回 400）
- account 规则：getAccount 的 account 去掉第一个字符——`h20031134` → `20031134`、`hhh344` → `hh344`（支持字母数字）
- 出参：SVG 图片（`Content-Type: image/svg+xml`），背景色由 account 哈希生成，居中显示账号数字
- 无需鉴权，直接 `<img src="http://localhost:3091/face/20031134/120">`
