# 设计系统管理 API 契约（v4.6 · 设计系统级启用/禁用）

> 前端：`design-system-admin`（管理台 4 栏：设计系统管理 / 人员管理 / 操作记录 / 数据统计）+ `design-system-app`（展示端）
> 后端：在 `lib-resource-service` 中新增 `routers/design_systems.py` 实现，存储走 `FILE_ROOT_DIR`
> （本地 `./storage`，生产 `/data/resource`），文件相对路径 `design-systems/{slug}/…`
>
> **v4.6 变更**：设计系统级**启用/禁用**——4 号 PATCH 新增表单字段 `enabled`
> （"true"/"false"）：false=禁用（`is_disabled` 列置位——**数据/文件/统计全保留**，展示端
> 列表**过滤**、详情与 views/usage/7b 打点上报 **404**；管理台列表传 `include_disabled=1`
> 恒可见可再启用）；true=启用恢复展示。item 新增恒有字段 `enabled`。1 号列表默认过滤禁用
> 系统，新增查询参数 `include_disabled`（bool，管理台取全量用）；默认系统（is_default）
> 禁用无特殊处理（标记保留）。管理台列表新增「状态」列 Switch 即点即生效；禁用行名称置灰。
> 启动 `_ensure_column` 补列，存量全部默认启用（零迁移）。
>
> **v4.5 变更**：预览页面「删除」改为**禁用/启用开关**——4 号 PATCH 新增表单字段
> `preview_enabled`（"true"/"false"）：false=禁用（`preview_disabled` 列置位——**文件不删、
> `parts.preview` 不变、file_size 不动**，仅 `preview_url` 返回 null，展示端回落模板渲染）；
> true=启用恢复直连。item 新增 `preview_enabled` 字段；`preview_url` 无部件**或已禁用**为 null。
> **5a DELETE /{slug}/parts/preview 端点移除**（不再提供删除入口，preview/ 整站永久保留）。
> 管理台编辑弹窗 preview 槽的红色垃圾箱改为「启用/禁用」开关（随确定提交，选替换包时
> 自动拨到启用）。启动 `_ensure_column` 补列，存量全部默认启用（零迁移）。
>
> **v4.4 变更**：**design-system.json 重构为八栏单数据源**（模板 template.html 唯一 json，
> 不再推导读 tokens.json/index.json/spec.json）。结构（8+1 键）：
> `overview`（概览 md 相对路径，恒 "source.md"）+ `color/typography/spacing/radius/shadow/other`
> （**从 tokens.json 原件顶层同名键原样深拷贝**，other 供模板 LIVE token 注入；原件缺失的键
> 沿用老 json 同名键——存量兼容）+ `components/patterns`（`{items:[{id, name, group: 目录
> 层级数组, height, html: 预览相对路径}]}`，条目由后端扫 assets 生成：spec.json 优先
> [name + preview.file]，老结构按叶子 html；index.json items 顺序优先）。相对路径均相对
> json 所在 `{slug}/` 目录解析。**组装方式**：POST/PUT parts 逐部件落盘后从 `{slug}` 落盘
> 现状**全量重建**（未提供部件的落盘件未动，天然保留存量）；**存量迁移**：启动时全量重建
> 所有系统 json + file_size 重算。模板删除预览格（v4 组件 html 自带变体切换 + pvHeight
> 高度上报）与 shortNames 中文名（条目只存组件名）；概览/预览 html 按 json 相对路径 fetch。
> 顶层不再写 name/meta/coverage/source.files 内嵌源码（管理字段归 DB 列）。
>
> **v4.3 变更**：skill 包 ingest 改写 SKILL.md 的 name——2 号 POST / 5 号 PUT parts 上传
> skill 包时，后端读取 zip 第一层 SKILL.md frontmatter 的 `name`，**非 `design-system-`
> 开头则改写为 `design-system-{name}`**（幂等：已带前缀原样不动），改写后的 SKILL.md
> 替换进 zip 落盘（原文件名不变，`skill_zip_url` 下载即改写后版本），`skill_name` 列与
> 响应字段 = 改写后 name（`ingest.skill.skill_name` 同报改写后值）。最终名（含前缀）
> >255 → 该部件失败。**存量不迁移**：历史已落盘 skill 包与 skill_name 不动，仅新上传/
> 替换生效。数据表无新列（沿用 skill_name 单列）。管理台前端零改动（技能名展示来自接口）。
>
> **v4.2 变更**：新增 5a 端点 `DELETE /api/design-systems/{slug}/parts/preview`——删除预览页面
> 部件（`{slug}/preview/` 子树清理 + `preview_entry_path` 置空 → `preview_url=null`、
> `parts.preview=false`）；展示端详情页随之回落模板页渲染（template.html + ds-data 注入）。
> 管理台编辑弹窗 preview 槽增加「标记删除、随确定提交」入口（与替换互斥）。仅 preview
> 部件开放删除，其余部件删除不在本期范围。
>
> **v4.1 变更**：新增第六部件 `preview_file`（预览页面包 zip：整站 html，含 html 即可、
> `index.html` 优先；后端解压落盘 `{slug}/preview/**`，api1/1a 新增 `preview_url` 与
> `parts.preview`；展示端详情页检测到 `preview_url` 直接 iframe 直连该页，不再走模板页）。
>
> **v4 变更**：上传物改为**五个独立部件**（multipart 各自可选、**逐部件独立成败**——失败部件
> 忽略并在响应 `ingest` 里回报错误，其余部件正常入库）：
> `design_md_file`（DESIGN.md：UTF-8 文本，**原文原样**存 `source.md`，展示端概览 fetch 后
> markdown 渲染，不再机器解析）
> + `tokens_file`（tokens.json：**唯一数据源**，UTF-8 合法 JSON，顶层为对象；服务端**转换为老
> design-system.json 区块结构**（模板与存量零改动）——color（主题感知取首主题）→ color.groups、
> type → typography、size → spacing（数值化）、radius（数值化）、shadow（原样 css 串）；
> **fontScale 等多余分组顶层原样保留（暂不渲染）**；原件存 `{slug}/tokens.json`）
> + `components_file`（组件包 zip：根须含 `components/` 目录，**兼容同名多层嵌套**
> `components/components/…`——循环剥离同名子层后以最内层为扫描基目录；子目录层级 = group、
> html 文件名 = 组件名；落盘 `{slug}/assets/components/**`）
> + `patterns_file`（Pattern 包 zip：根须含 `patterns/` 目录，同名嵌套兼容同理；
> 落盘 `{slug}/assets/patterns/**`）
> + `skill_file`（skill 包 zip：zip **第一层**须含 SKILL.md（不允许嵌套），frontmatter `name`
> 非空 ≤255 字符 → `skill_name`；原样落盘 `{slug}/{原文件名}`）。
> **name 必填**（来源链：表单 → tokens.json.name）；**usage 不从任何文件派生**：新增恒 0，
> 修正通道仅表单字段。**slug 由后端分配**（8 位随机 `[a-z0-9]`，API 路径/落盘目录/静态 URL）；
> `source_slug` = tokens.json 的 `id`（预留，现无此字段 → 恒 = slug）。
> **旧端点已删除**：POST /parse（2a）、分片上传三端点（2b）、PUT /{slug}/json（旧 5 号）；
> 单部件 ≤200MB multipart 直传，不再分片。
>
> 请求头：`X-User-Data`（AES-CBC 加密 `userInfo + loginTime`）；设计系统管理端点按
> `DS_LOGIN_TTL_HOURS`（默认 24h）校验登录过期，超时/缺失 → `401 {"detail":"登录已过期，请重新登录"}`
> ——豁免清单仅 `GET /api/design-systems`（列表）、`GET /{slug}`（1a 单条详情，展示端匿名可用）、
> `POST /{slug}/views`（7a 预览打点）、
> `POST /api/design-systems/usage/report`（7b 免登录态调用量上报）与
> `POST /api/design-systems/events/refresh-identity`（7c 打点事件用户信息补全）。
> `octo-vs-token` 仅 lib-resource 原有模块需要（`/api/resources`、`/api/export`、`/api/vector/*` 的
> app_id 校验），**设计系统模块不校验、无需携带**；
> 人员搜索走独立服务 `GET /getAccount?keyword=`（mock 3090，需 `uiplusToken` 头），头像走 `GET /face/{account去首字符}/{size}`（mock 3091），见 mock-api/api.md。
>
> 生产 nginx：`client_max_body_size` 需 ≥ 200m（单部件 ≤200MB，单请求携带全部所选部件 multipart 直传）。

## 通用约定

- 路由前缀：`/api/design-systems`（生产经 nginx `/aaa/` 反代剥前缀，与 lib-resource-ui 一致）
- 请求头：`X-User-Data`（AES-CBC 加密的 userInfo + loginTime，同 lib-resource-ui 协议）；`created_by/updated_by` 取自解密结果。`octo-vs-token` 在本模块**不校验**（仅 lib-resource 原有模块的 app_id 校验需要，可省略）
- 错误响应：`{"detail": "错误描述"}`，状态码 400（校验失败）/ 404（不存在）/ 413（超限）；~~409（slug 重复）~~ **v2 移除**（slug 后端随机分配，结构上不可能冲突；同一 source_slug 可共存多条记录）
- 时间格式：`design_systems` 表相关为 ISO 8601；白名单与操作记录接口返回 epoch 毫秒（见第 8/9 节）

## 六部件格式（octo-design-parts/1）

新增（2 号）与部件替换（5 号）的 multipart 文件字段——**全部可选、逐部件独立成败**：

| 字段 | 文件 | 要求 | 落盘 |
|---|---|---|---|
| `design_md_file` | DESIGN.md | UTF-8 文本（原文不解析；非 UTF-8 → 该部件失败） | `{slug}/source.md`（design_md_url） |
| `tokens_file` | tokens.json | UTF-8（容忍 BOM）合法 JSON、顶层为对象（**唯一数据源**；分组结构零校验，缺失 → 模板空态） | `{slug}/tokens.json` 原件 + design-system.json token 区块 |
| `components_file` | 组件包 .zip | zip 根须含 `components/` 目录（缺失 → 该部件失败）；子目录层级 = group、html 文件名 = 组件名；**同名多层嵌套兼容**（`components/components/…` 循环剥离，group/path 归一化不含重复层） | `{slug}/assets/components/**` + json components 区块 |
| `patterns_file` | Pattern 包 .zip | 同组件包规则（`patterns/` 目录、同名嵌套兼容） | `{slug}/assets/patterns/**` + json patterns 区块 |
| `skill_file` | skill 包 .zip | zip **第一层**须含 SKILL.md（不允许嵌套包裹目录），frontmatter `name` 非空；**ingest 改写 name：非 `design-system-` 开头 → `design-system-{name}`（幂等，已带前缀原样）；改写后 SKILL.md 替换进 zip 落盘（原文件名不变）；最终名（含前缀）≤255，超出 → 该部件失败**；文件名不得与系统保留文件（`source.zip`/`source.md`/`design-system.json`/`tokens.json`/`preview`，大小写不敏感）冲突 | `{slug}/{原文件名}`（skill_zip_url，zip 内 SKILL.md 为改写后版本；skill_name = 改写后 name） |
| `preview_file` | 预览页面包 .zip | **zip 里须含 html 文件**：入口 = 根下 `index.html`（大小写不敏感）；无 `index.html` 时根下**唯一** `.html` 兜底；无 html / 多个 html 且无 index.html → 该部件失败。根无 html 且仅一个目录条目时**单层任意名包裹自动剥离**（右键压缩兼容，循环最多 3 层）；**内容不解析不校验**（整站原样落盘） | `{slug}/preview/**`（preview_url 指向入口 html） |

**服务端处理**：部件独立校验/解析（`app/services/design_system_zip.py`）→ 逐部件落盘后
从 `{slug}` 落盘现状**全量重建** design-system.json（`service.rebuild_design_system_json`，
v4.4 八栏单数据源——见 v4.4 变更块；未提供部件的落盘件未动，天然保留存量）。条目扫描
（`scan_group_items`）：**spec.json 优先**（v3/v4 转化产物——目录含 spec.json = 一个条目，
name = spec.name、html = spec.preview.file，文件须存在；无 preview 不上网站；spec 坏→按老
结构扫叶子 html）；**无 spec.json 的老 zip 结构**按叶子 html 逐个成条（目录层级 = group）；
index.json 的 items 顺序优先。`items[].height` 固定写默认 160（展示端 iframe 初始行高，
v4 html 经 pvHeight 上报自适应）。

**安全校验（部件级失败，不影响其他部件；均回报在响应 `ingest` 里）**：zip slip
（`..`/绝对路径/反斜杠/symlink/特殊文件类型）、zip bomb（条目数 >5000、解压总量 >500MB、
单文件 >10MB 且压缩比 >100）、同名冲突条目（同名/大小写变体既出现目录又出现文件）、
缺 `components/`（`patterns/`）目录、tokens 非法 JSON / 顶层非对象、DESIGN.md 非 UTF-8、
skill 包非 zip / 缺 SKILL.md / 缺 name、skill 名改写后（含 `design-system-` 前缀）超 255、skill 包文件名撞保留文件、预览页面包无 html / 多 html 且无 index.html / 包裹超过 3 层、单部件 >200MB。

**打包垃圾静默丢弃（不导致部件失败）**：macOS / Windows 压缩工具产物（`__MACOSX/`、
`._*` AppleDouble、`.DS_Store`、`Thumbs.db`，含嵌套路径，如 `components/按钮/._Button.html`）
不报错、不落盘、不参与解析与条目统计——用户本机「右键压缩」产生的 zip 必然携带，属正常现象
（服务端 info 日志记录丢弃数量）。

## 接口

### 1. GET /api/design-systems —— api1：列表（含个数）

展示端首页卡片与管理台列表共用。

**查询参数**（可选）：`search=关键词` —— 按 `name` / `slug` / `source_slug`（规范 id） / `author` 模糊匹配（ilike）。展示端不带 search 取全量。
`include_disabled`（bool，默认 false）—— **v4.6**：是否包含已禁用系统。展示端不传（禁用系统
不可见）；管理台传 `include_disabled=1` 取全量（禁用系统再启用的唯一入口）。

**响应**：

```json
{
  "count": 3,
  "items": [
    {
      "slug": "a7xk92mf",
      "source_slug": "h-design",
      "name": "H Design 官网设计规范",
      "desc": "…",
      "author": [
        { "id": 112, "userID": "u00112", "account": "l20031135", "nickName": "罗唯", "dept": ["华为", "2012实验室", "UX部", "设计二组"] }
      ],
      "usage": 143,
      "views": 1286,
      "cover": "cover-blue.jpg",
      "cover_url": "/static/design-systems/covers/cover-blue.jpg",
      "icon": "design-systems/icons/h-design.svg",
      "icon_url": "/static/design-systems/icons/h-design.svg",
      "json_url": "/static/design-systems/a7xk92mf/design-system.json",
      "design_md_url": "/static/design-systems/a7xk92mf/source.md",
      "tokens_url": "/static/design-systems/a7xk92mf/tokens.json",
      "skill_zip_url": "/static/design-systems/a7xk92mf/my-skill-pack.zip",
      "skill_name": "text-to-ui",
      "preview_url": "/static/design-systems/a7xk92mf/preview/index.html",
      "parts": { "design_md": true, "tokens": true, "components": true, "patterns": false, "skill": true, "preview": true, "components_count": 12, "patterns_count": 0 },
      "default": true,
      "file_size": 5242880,
      "created_by": "luowei",
      "updated_by": "luowei",
      "created_by_name": "罗唯 luowei",
      "updated_by_name": "罗唯 luowei",
      "updated_at": "2026-10-30T08:00:00"
    }
  ]
}
```

- `slug`：**后端生成的 8 位随机 `[a-z0-9]`**（API 路径 / 落盘目录 / 静态 URL）；`source_slug` 为
  tokens.json 的 `id` 原样保留（不唯一，允许重复——同一规范 id 重传/多版本共存）；
  存量数据 `source_slug == slug`（启动时回填），URL 零变化
- `author`：**对象数组**，条目为 `/getAccount`（人员搜索服务）返回的**完整值**（驼峰原样）：
  `[{id, userID, account, nickName, dept: [4级部门数组]}]`；写入时服务端按 account 兜底补全 nickName/dept
  （查 users 表，查不到保持原值，允许外部作者）。旧字符串数据读取时自动包装为单元素（昵称语义）。
  展示约定（前端）：**管理台**显示 `nickName(account)`（列表/弹窗 >2 人折叠为「前 2 + 等 N 人」，
  hover tip 展示全量）；**展示端**只显示 `nickName`（回落 account；卡片 >2 人同样折叠 + hover 气泡全量）；
  头像来自独立服务 `GET /face/{account 去掉首字符}/{size}`（mock 3091 直连）
- `icon` / `icon_url`：`icon` 为自定义图标相对路径（**null=未自定义**）；`icon_url` **恒有值**——未自定义时回落内置默认图标
  `design-systems/icons/icon-default.svg`（品牌紫圆角 + DS 字样；`BUILTIN_ICONS` 列表结构，便于后续扩充内置图标集）；
  `file_size` 为 `{slug}` 目录落盘内容合计（旧 zip/MD 时代数据为原件大小）
- `json_url` / `design_md_url` / `tokens_url` / `skill_zip_url`：design-system.json（服务端解析产物，展示端数据源）、
  DESIGN.md 原件（design_md 部件落盘件）、tokens.json 原件（tokens 部件落盘件，老系统无原件为 null）、
  skill 包（保留原文件名）的可访问 URL；
  `skill_name`：技能名 = skill 包 zip 第一层 SKILL.md frontmatter 的 `name`（**ingest 时后端已改写为
  `design-system-` 前缀**，见 v4.3；无 skill 部件为 null；存量系统为改写前的原 name）；
  `preview_url`：预览页面包**入口 html** 的可访问 URL（`{slug}/preview/` 下；无 preview 部件
  **或已禁用**（v4.5 `preview_enabled=false`，文件保留）为 null——展示端检测到该字段即 iframe 直连该页，
  不再走模板页，也不再发 ds-data 注入）；
  `preview_enabled`：预览页面启用状态（v4.5；恒有值，默认 true——禁用时仅 preview_url 置 null，
  `parts.preview` 与落盘文件不变，操作通道走 PATCH `preview_enabled` 字段）；
  `enabled`：**系统级启用状态**（v4.6；恒有值，默认 true）：false=禁用——**数据/文件/统计全保留**，
  展示端列表过滤、详情与打点 404（对展示端等同"未发布"），管理台 `include_disabled=1` 可见，
  操作通道走 PATCH `enabled` 字段；
  当前部署约定为**相对路径**（`PUBLIC_ORIGIN` 置空 → `/static/...`）：本地 dev 走前端 vite 代理
  （`/api`、`/static` 直通 8009，纯同源无 CORS 依赖）；生产由 nginx 同域配置 `/api` 与 `/static` 直通后端。
  管理台文件行展示/下载的主文件是 DESIGN.md（source.md）；`parts`：**六部件存在性**——
  `design_md`（source.md 落盘件）/ `tokens`（tokens.json 原件或 json 含 token 区块，老系统按数据判断）/
  `components`·`patterns`（json 区块存在且有 items，附 `*_count` 计数）/ `skill`（skill 包落盘件）/ `preview`（preview 入口 html 落盘件存在）；
  管理台编辑/查看用，展示端忽略
  （`PUBLIC_ORIGIN` 若非空仍会生成 `{PUBLIC_ORIGIN}{ROOT_PATH}/static/...` 绝对 URL，为 lib-resource 兼容保留）
- `usage`：**不从 MD frontmatter 派生**（v2 需求：md 里的 usage 值不允许直接使用）——新增恒 0，
  修正通道仅 PATCH 的 `usage` 字段与 `/usage` 自增接口；重传保留现值
- `views`：**预览量**——展示端设计系统详情页**每次加载自动 +1**（`POST /{slug}/views`），
  新增恒 0；高频调用不写操作日志、不动 `updated_at`；展示端头部用接口返回值即时显示；
  修正通道仅 PATCH 的 `views` 字段（API 层保留；**界面不提供编辑入口**，手动修正走此字段）
- `created_by/updated_by` 为 account，`*_name` 为「昵称 account」显示名——直查 users 表解析，无记录时回落 account
- 排序：`default` 置顶，其余按 `created_at` 倒序（slug 已随机化，字典序无意义）

### 1a. GET /api/design-systems/{slug} —— 单条详情（api1 item 同构）

展示端详情页数据源：返回与列表条目**完全同构**的单个 item（`format_item` 同一产物——
name/desc/author/usage/views/cover/icon/各 URL/parts/file_size/时间等全字段）。

- **匿名可访问**（登录过期豁免清单内，与列表接口同等待遇——展示端匿名浏览详情依赖）
- slug 不存在 / 软删 / **已禁用**（v4.6，深链同走「未找到」语义）→ 404
- 建议消费顺序：进页先 `POST /{slug}/views`（计入本次浏览）再 GET 本接口——返回的
  `views` 已含本次浏览，头部一次渲染无「快照→自增」的数值跳变
- 路由注册顺序保证管理静态路径不被单段路径参数劫持：`GET /operation-logs`（操作记录，
  同 router 内先注册）、`GET /whitelist`（白名单，ds_whitelist router 先 include）

### 2. POST /api/design-systems —— 上传（六部件，全部可选、逐部件独立成败）

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| design_md_file / tokens_file / components_file / patterns_file / skill_file / preview_file | File? | **六个可选部件**（octo-design-parts/1，要求见「六部件格式」节；单部件 ≤200MB） |
| name | 必填* | 卡片名称（来源链：表单 → tokens.json.name；**两者皆无 → 400**「名称不能为空」；部件全空也允许——纯壳系统） |
| desc / author / usage / default | 可选 | 卡片字段；author 为**JSON 数组字符串**（/getAccount 返回的完整值条目）；usage 不读任何文件值（缺省恒 0） |
| cover_file / icon_file | File? | 可选自定义封面（jpg/png/webp ≤2MB，存 `design-systems/covers/{slug}.{ext}`）与图标（jpg/png/webp/svg ≤2MB，svg 服务端消毒）；不上传 cover 则回落内置名（默认 `cover-cyan.jpg`） |

**逐部件独立成败**（对齐「五部件格式」节的安全校验清单）：任一部件校验/解析失败 →
**该部件忽略**（不落盘、不报 400），其余部件正常入库；响应 `ingest` 逐部件回报
`{"provided", "ok"}` 与失败原因 / 计数 / 技能名。**请求级 400 仅限**：name 缺失
（表单与 tokens 皆无）、`cover_file`/`icon_file` 超 2MB / 类型不符。

**design-system.json 结构（v4.4，八栏单数据源——模板唯一 json）**：

```json
{
  "overview": "source.md",
  "color": { "title": "...", "groups": [ { "kind": "...", "label": "...", "tokens": [ { "name": "...", "token": "--...", "value": "...", "desc": "..." } ] } ] },
  "typography": { "title": "...", "families": [ ... ], "groups": [ ... ] },
  "spacing": { "title": "...", "groups": [ ... ] },
  "radius": { "title": "...", "groups": [ ... ] },
  "shadow": { "title": "...", "groups": [ ... ] },
  "other": { "title": "...", "groups": [ ... ] },
  "components": { "items": [ { "id": "button", "name": "Button", "group": [ "通用类" ], "height": 160, "html": "assets/components/通用类/Button/按钮-Button.html" } ] },
  "patterns": { "items": [ { "id": "list-layout", "name": "ListPage", "group": [ "页面模式" ], "height": 160, "html": "assets/patterns/页面模式/ListPage/列表管理页-ListPage.html" } ] }
}
```

- 六个 token 键 = tokens.json 原件顶层同名键**原样深拷贝**（结构零校验——octo 老格式也照拷，
  模板栏级容错）；`other` 供模板 LIVE token 注入（描边等不在八栏里的 token）
- `overview` = 概览 md 相对路径（恒 `source.md`；文件不存在时模板概览栏容错提示）
- `components/patterns` 条目 html = 预览相对路径（v4 组件 html 自带变体切换 + pvHeight 高度上报）
- 相对路径均相对 json 所在 `{slug}/` 目录解析；顶层不再写 name/meta/coverage/source.files

**行为**：slug 后端随机生成（无冲突无 409；同 source_slug 重复上传可共存）；五个部件全部
未提供时创建**纯壳系统**（json 仅 overview，六键/条目按落盘现状为空）。写 `design_systems`
表记录与操作日志（detail 含部件成败摘要）；`default=true` 时清除其他系统的默认标记；
`file_size` = `{slug}` 目录落盘内容合计。

**响应**：列表 item 结构（`slug` 为新生成的随机 id）+ 顶层 `ingest` 逐部件报告：

```json
{
  "…": "item 字段（含 parts 存在性）",
  "ingest": {
    "design_md":   { "provided": true, "ok": true, "size": 20480 },
    "tokens":      { "provided": true, "ok": false, "error": "tokens.json 不是合法 JSON：…" },
    "components":  { "provided": true, "ok": true, "count": 8, "nested": true },
    "patterns":    { "provided": false },
    "skill":       { "provided": true, "ok": true, "skill_name": "text-to-ui", "size": 1048576 },
    "preview":     { "provided": true, "ok": true, "entry": "index.html", "nested": true, "size": 325742 }
  }
}
```

- `components/patterns.count`：扫描出的叶子 html 数；`nested`：检测到同名嵌套目录并已剥离（提示性）
- `preview.entry`：入口 html 文件名（preview_url 指向它）、`preview.nested`：检测到单层包裹目录并已剥离（提示性）
- `skill.skill_name`：SKILL.md frontmatter name **改写后**的值（`design-system-` 前缀，见六部件格式节）；失败部件的 `error` 为可展示的原因描述

### 3. GET /api/design-systems/{slug}/json —— 详情 JSON

返回原始 design-system.json（`FileResponse`）。等价于静态路径 `/static/design-systems/{slug}/design-system.json`，展示端 template.html 直接 fetch 后者。

### 3b. 组件 ↔ Pixso 映射（ds_component_mappings 表）

一行 = 一个 HTML 组件到 Pixso 组件集的映射。HTML 侧字段（slug/component_name/html_zh/html_group）
由**组件清单同步**写入（组件包 ingest 成功后 import_parts 自动挂钩 + 3c 手动补）；
Pixso 侧字段（pixso_name/pixso_guid/file_key/…/instance_spec/instance_code）由**匹配脚本批量回填**
（阶段 2，格式定稿后启用批量写入端点——本契约暂只含读取与同步）。

**表结构**（create_all 自动建）：

| 列 | 说明 |
|---|---|
| slug + component_name | UNIQUE 联合；component_name = spec.json 的 name（join 键） |
| html_zh / html_group | 组件中文名（index.json shortNames）/ 分组（路径首段，无目录为空） |
| pixso_name / pixso_guid | Pixso 组件集名 / 组件集 node_id（实例创建主锚点） |
| file_key / page_id / page_name / pixso_category | Pixso 文件与页面定位信息 |
| component_content_key | Pixso 组件 40 位内容 hash（变更检测：设计侧改组件 → hash 变 → 映射可能过期） |
| match_type | exact / fuzzy / manual（manual 重跑匹配不覆盖） |
| url | Pixso 跳转链接；空则渲染端不显示跳转按钮 |
| instance_spec | 实例参数 JSON（defaults + bridges 轴值映射）——runner 翻译 HTML 轴值后在组件集 children 匹配变体创建实例 |
| instance_code | 参数化调用表达式（组合组件逃生通道；白名单函数 + JSON 字面量） |
| status | aligned（已对齐）/ partial（部分对齐）/ missing（未关联，HTML 入库默认值） |

### 3b-1. GET /api/design-systems/{slug}/mapping —— 映射整表读取（公开）

展示端模板第三列消费（鉴权豁免：两段路径 GET 放行）。**响应**：

```json
{
  "slug": "bkvvy9vm",
  "count": 22,
  "items": [
    { "component_name": "Button", "html_zh": "按钮", "html_group": "通用",
      "pixso_name": null, "pixso_guid": null, "pixso_category": null, "file_key": null,
      "match_type": null, "url": null, "status": "missing",
      "instance_spec": null, "instance_code": null }
  ]
}
```

- slug 不存在 → 404；无行（未 sync 的存量系统 / 无组件包系统）→ `count: 0, items: []`（展示端据此保持两列）

### 3b-2. POST /api/design-systems/{slug}/mapping/sync —— HTML 组件清单同步（需登录态）

存量系统一次性补数据用（新系统组件包上传已自动挂钩）。数据源 = `{slug}/assets/components/index.json`
（组件包落盘清单），**全量同步语义**：

- 新组件 → 插入行（status=missing，Pixso 字段全 NULL）
- 已有行 → **只更新 html_zh / html_group**（Pixso 数据与 status 恒不触碰——保护匹配成果）
- 清单里已不存在的组件 → 行删除（组件没了映射无意义）
- 无组件包 → `skipped: true`（不报错，现存行不动）

**响应**：`{"slug": "…", "added": 2, "updated": 0, "removed": 0, "total": 24, "skipped": false}`；幂等可重复执行。

### 3b-3. PUT /api/design-systems/{slug}/mapping —— 匹配结果批量回填（需登录态）

匹配脚本（`scripts/pixso-mapping/match-mapping.mjs`）调用：按 component_name merge 更新已有行的 **Pixso 侧字段**。

**请求**：`Content-Type: application/json`

```json
{ "items": [ { "component_name": "Button", "pixso_name": "Button", "pixso_guid": "19:1378",
    "pixso_category": "操作类", "file_key": "8mM_…", "match_type": "exact", "status": "aligned", "url": "" } ] }
```

- 可写字段：pixso_name / pixso_guid / file_key / page_id / page_name / pixso_category /
  component_content_key / match_type / status / url / instance_spec（dict 自动转存 JSON 字符串）/ instance_code；
  **未提供的字段不动**（merge 而非整体替换）
- **manual 保护**：存量行 `match_type == "manual"` 一律不覆盖（人工修正成果，重跑匹配只跳过）
- component_name 不在表中 → 400（提示先 POST /{slug}/mapping/sync 同步组件清单）

**响应**：`{"slug": "…", "total": 51, "updated": 50, "skipped_manual": 1, "aligned": 11, "partial": 1, "missing": 39}`

### 4. PATCH /api/design-systems/{slug} —— 编辑卡片 meta

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| name / desc / default | 可选表单字段 | 卡片字段（slug 不可改） |
| author | 可选 | 作者，**JSON 数组字符串**（/getAccount 完整值条目，空数组清空作者）；写入时按 account 兜底补全 |
| usage | 可选 | 调用量修正通道（API 层保留）；**界面不提供编辑入口**，手动修正走此字段 |
| views | 可选 | 预览量修正通道（API 层保留）；**界面不提供编辑入口**，手动修正走此字段；非负整数、整字段覆盖（绝对值语义，非增量） |
| preview_enabled | 可选 | **预览页面启用/禁用开关**（v4.5）："true"=启用（直连预览页）；"false"=禁用（`preview_disabled` 置位——**文件不删、`parts.preview` 不变、`file_size` 不动**，仅 `preview_url` 返回 null，展示端回落模板渲染）；空/缺省不动；无 preview 部件时接受但无可见效果 |
| enabled | 可选 | **系统级启用/禁用开关**（v4.6）："true"=启用（展示端可见）；"false"=禁用（`is_disabled` 置位——**数据/文件/统计全保留**，展示端列表过滤、详情与打点 404，管理台 `include_disabled=1` 可见可再启用）；空/缺省不动；默认系统禁用无特殊处理（is_default 标记保留） |
| cover_file | File? | 可选新封面（jpg/png/webp ≤2MB）；上传则覆盖现有封面，不上传则保留现有封面 |
| icon_file | File? | 可选新图标（jpg/png/webp/svg ≤2MB）；上传则覆盖现有图标，不上传则保留现有图标 |

**行为**：更新记录与 `updated_at`，写操作日志；`default=true` 时清除其他默认。
**响应**：更新后的 item。

### 5. PUT /api/design-systems/{slug}/parts —— 部件替换

**请求**：`multipart/form-data`，字段同 2 号的六个部件（`design_md_file` / `tokens_file` /
`components_file` / `patterns_file` / `skill_file` / `preview_file`），**至少提供一个**（缺失 → 400「未提供任何部件文件」）。

**行为**（逐部件独立成败，响应 `ingest` 报告同 2 号）：
- **只换提供部件的内容**（落盘子树/文件整体替换）：components/patterns → `assets/{group}`
  子树整体替换；preview → `preview/` 子树整体替换 + `preview_entry_path` 列更新（未提供
  部件保留存量入口）；tokens → `tokens.json` 原件覆盖；skill → 原文件名落盘，新名与旧附件
  不同时按 `skill_zip_path` 列自动清理旧文件（SKILL.md name 前缀改写同 2 号，见「六部件格式」）；
  DESIGN.md → `source.md` 覆盖
- **json 全量重建**（v4.4）：任一部件落盘成功后从 `{slug}` 落盘现状全量重建
  design-system.json（`rebuild_design_system_json`）——**未提供部件的落盘件未动，天然保留
  存量**（老系统无 tokens 原件 → 六键沿用老 json 同名键；存量 assets 照扫）；管理字段
  （name/source_slug 等）在 DB 列，不参与 json
- **管理字段不受影响**：name/source_slug/作者/封面/图标/调用量/描述/默认标记走 PATCH /{slug}
- 写操作日志（action = `update_parts`，detail 含部件成败摘要）；`file_size` 重算
- slug 不存在 → 404；软删系统不可见（404）

**响应**：同 2 号（item + `ingest`）。

### 5a. ~~DELETE /api/design-systems/{slug}/parts/preview~~ —— 已移除（v4.5）

v4.2 引入的删除预览页面部件端点在 **v4.5 移除**：预览页面不再支持删除（历史数据
`{slug}/preview/` 整站**永久保留**），改为 4 号 PATCH 的 `preview_enabled` 禁用/启用开关——
禁用时仅 `preview_url` 返回 null（展示端回落模板渲染），`parts.preview` 与落盘文件、
`file_size` 均不变。
### 6. DELETE /api/design-systems/{slug} —— 删除

**行为**：软删（`is_deleted=1`），列表不再返回；写操作日志。**响应**：`200 {"detail": "ok"}`。

### 7. POST /api/design-systems/{slug}/usage —— 调用量自增

**语义**：该设计系统被调用/使用一次记一次。**调用方**：使用方（如 Octo Design 或其他服务）显式调用——
展示端/管理台 UI **不会**自动触发；手动修正调用量走接口 4 的 `usage` 字段。

**鉴权**：`X-User-Data` **必须携带**（与 7a 的匿名豁免不同）——本接口不在登录过期豁免清单，
载荷须含 `loginTime` 且距今未超 `DS_LOGIN_TTL_HOURS`（默认 24h），否则
`401 {"detail":"登录已过期，请重新登录"}`；携带身份的同时，打点事件快照 account/nickName/dept
供统计页按人/部门聚合。

**行为**：
- 每次调用 `usage += 1`，SQL 端原子自增（并发安全）
- 高频调用：不写操作日志；`updated_at` 保持不变（其语义是内容/管理字段更新时间）
- slug 不存在 → 404

**响应**：`{"slug": "text-to-ui", "usage": 4}`

**调用方式（JS，可独立使用，适用于有登录态的调用方）**：
> 调用方**无登录态**（服务端/工具侧代码、拿不到 userInfo）时走 **7b**（传 account 即可，见下节）。

```js
// ── X-User-Data 构造（AES-256-CBC；密钥 = 后端 AUTH_AES_KEY = 前端 VITE_AUTH_AES_KEY，32 字节 base64）──
const AES_KEY_B64 = '<AUTH_AES_KEY>'

let _key
async function getKey() {
  if (_key) return _key
  const raw = Uint8Array.from(atob(AES_KEY_B64), c => c.charCodeAt(0))
  _key = await crypto.subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, ['encrypt'])
  return _key
}
async function encryptUserData(payload) {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(16))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-CBC', iv }, key, new TextEncoder().encode(JSON.stringify(payload)))
  const out = new Uint8Array(16 + ct.byteLength)
  out.set(iv); out.set(new Uint8Array(ct), 16)
  return btoa(String.fromCharCode(...out)) // Base64(IV(16) + 密文)
}

// ── 调用量自增：apiBase 同域传 ''（走 /api 反代），跨域传后端地址（如 http://localhost:8009）──
async function incrementUsage(apiBase, slug) {
  const user = JSON.parse(localStorage.getItem('userInfo') || 'null') // 统一登录门户写入
  if (!user) throw new Error('未登录')
  if (!localStorage.getItem('loginTime'))                             // 缺失时补写一次（同管理台 ensureLoginTime 语义）
    localStorage.setItem('loginTime', String(Date.now()))
  const res = await fetch(`${apiBase}/api/design-systems/${slug}/usage`, {
    method: 'POST',
    headers: {
      'X-User-Data': await encryptUserData({
        ...user, loginTime: Number(localStorage.getItem('loginTime')),
      }),
    },
  })
  if (res.status === 401) throw new Error('登录已过期（24h），请重新登录后再上报')
  return res.json() // → {"slug": "...", "usage": 新值}
}
```

- Node ≥ 18：`crypto.subtle` 全局可用，`atob/btoa` 换成 `Buffer.from(s,'base64')` / `Buffer.from(bytes).toString('base64')`
- 收到 401 = loginTime 超 24h：重走统一门户登录（localStorage 的 userInfo / loginTime 刷新）后恢复上报
- 后端 CORS 全开，跨域直连无需代理；OPTIONS 预检已放行

**打点事件**：7/7a 两个自增接口同时向 `ds_usage_events` 写入一行打点事件（与列自增同事务）：

| 列 | 说明 |
|---|---|
| slug / event_type | 设计系统 + view（预览）/ usage（调用） |
| account / nick_name / dept1..4 | 操作人快照（见下方「打点身份完整化」）；匿名调用（仅 7a 豁免可发生）**不写事件行**——views 列照常自增（曝光量语义），事件表不再产生空 account 行 |
| created_at | 打点时间（统计页时间序列 / 最近调用的来源） |

**打点身份完整化**（事件写入前，失败静默降级、绝不丢打点）：

```
X-User-Data 解密结果 ──缺名字或部门──► users 表（AuthMiddleware 平时 upsert 的缓存）
    └─仍缺──► USER_INFO_API_URL 按 account 精确补全（服务端直连、无 cookie/token 依赖、
               短超时，成功则回写 users 表含 deptCode，同一账号外部服务最多查 1 次）
               ──仍缺──► 用手头信息降级写事件
```

- 打点链的外部查询走 **USER_INFO_API_URL**（`GET ?account=` 免 cookie 协议）：调用方（外部工具/
  服务端）不会传浏览器登录 cookie，带 cookie 鉴权的人员服务（联想搜索 USER_SEARCH_API_URL 类）
  服务端无法调用
- 部门快照口径：**dept1..dept4 = 部门数组的下标 1~4**（dept[0] 为公司名「华为」，不参与层级与统计）
- 配置：`USER_INFO_API_URL`（留空 = 跳过该级兜底，事件降级仅 account；与显示名兜底 `resolve_display_names` 共用配置）

### 10. GET /api/design-systems/stats/* —— 打点统计（管理台数据统计页）

统一查询参数：`start` / `end`（日期 `YYYY-MM-DD`，闭区间，缺省不限）。
口径：预览数=view 事件数（匿名浏览不计：匿名事件不入库 + 存量空 account 事件统一排除）；调用量=usage 事件数；人数=DISTINCT account（匿名不计）；
最近调用时间=MAX(created_at)；软删系统的事件保留但不进统计（**四个接口口径一致**：排除统一在
事件查询入口 `_range_query` 实现——summary 行与汇总 / trend / dept-share / users 均不含软删事件）；
部门维度=事件快照 dept1。

| 接口 | 参数 | 返回 |
|---|---|---|
| `/stats/summary` | + `search`（按系统名称模糊） | `{ total:{views,usage,users,last_at}, items:[{slug,name,views,usage,users,last_at}] }` —— 每系统一行（无数据补 0）+ 全局汇总（users 为全局 DISTINCT，非各行之和） |
| `/stats/trend` | + `metric=view\|usage\|users`、`granularity=day\|week\|month` | `{ buckets:[{date,dept1,value}] }` —— 时间桶（周=所在周周一）× 一层部门扁平行，前端透视为堆叠柱状图；users 指标按（桶,部门）DISTINCT |
| `/stats/dept-share` | + `metric` | `{ items:[{dept1,value}] }` —— 一层部门占比（按值降序，0 值切片不返回） |
| `/stats/users` | + `search`（工号/名字模糊）、`page`/`limit`（**服务端分页**，默认 1/20，limit ≤100） | `{ total, page, limit, items:[{account,nick_name,last_at,views,usage,dept1..4}] }` —— 名字/部门取该账号最新事件快照；匿名事件不生成人员行；**total=全量人数**（聚合按全量计算，每人合计不受分页影响；items 为 last_at 倒序排序后的当前页切片） |

### 7a. POST /api/design-systems/{slug}/views —— 预览量自增

**语义**：展示端设计系统详情页**每次加载**调用一次，`views += 1`（与 `/usage` 的外部显式调用不同，
本接口由展示端前端自动触发，用于「调用量旁边展示预览量」的需求）。

**鉴权**：**豁免**登录过期校验（在豁免清单内）——匿名可调（**不写打点事件**，views 列照常自增）；已登录则携带
`X-User-Data`，事件快照归属本人。

**行为**：

- 每次调用 `views += 1`，SQL 端原子自增（并发安全）
- 匿名调用（无有效 X-User-Data）**不写打点事件**：`ds_usage_events` 不再产生空 account 行；
  存量匿名行保留在库但不进统计（`_range_query` 统一排除，见 10 号口径）
- 高频调用：不写操作日志；`updated_at` 保持不变
- slug 不存在 → 404

**响应**：`{"slug": "h-design", "views": 1287}`

### 7b. POST /api/design-systems/usage/report —— 调用量上报（免登录态，传 account）

**语义**：与 7 号逻辑**完全一致**（`usage += 1` + 同事务打点事件），面向**无登录态的调用方**
（服务端 / 工具侧代码）：`slug` 与 `account` 放消息体，用户信息由**后端自行查询补全**后入库。

**请求**：`Content-Type: application/json`

```json
{"slug": "ict-pc", "account": "h20031134"}
```

- **完全公开**：免登录、免权限校验（在登录过期豁免清单内，静态路径精确匹配）
- `slug` 必填（缺失 → 422，对齐 `uploads/init` 的 body 校验；不存在 → 404）；`account` 与有效
  `X-User-Data` **至少其一**（否则 400），同时携带时 **X-User-Data 优先**
- **身份补全**（后端 resolve 链，事件写入前完成）：`account` → users 表缓存 → USER_INFO_API_URL
  人员服务（`?account=` 免 cookie 直连）→ 回写缓存（同一账号外部服务最多查 1 次）；
  查无此人**降级照写**（account 入库、nickName/dept 留空，绝不丢打点）
- 响应：`{"slug": "ict-pc", "usage": 5}`

**调用方式（JS，无登录态一行搞定）**：

```js
await fetch(`${apiBase}/api/design-systems/usage/report`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ slug, account }),
})
```

- `apiBase` 同域传 `''`（走 /api 反代），跨域传后端完整地址（CORS 全开）
- slug 从列表接口 `GET /api/design-systems` 的 `item.slug` 获取

### 7c. POST /api/design-systems/events/refresh-identity —— 打点事件用户信息补全（公开维护）

**语义**：为「身份不完整」的打点事件**补全用户信息**（`ds_usage_events` 的 nick_name / dept1..4）。
典型场景：7b 上报时 account 查无此人（users 表 + getAccount 都没命中）→ 事件按降级语义照写
（account 入库、昵称部门留空，**绝不因查不到人而跳过**）——等人员信息可查后调本接口批量补全。

**请求**：`Content-Type: application/json`

```json
{}                                          // 全表扫描身份不完整的事件
{"accounts": ["ghost-404", "h20031134"]}    // 或只处理指定账号
```

**行为**：
- 候选：account 非空且（nick_name 或 dept1 为空）的事件 → 按账号去重（匿名事件永不触碰）
- 逐账号走 resolve 链：users 表缓存 → USER_INFO_API_URL 人员服务（`?account=` 免 cookie 直连）→ 回写缓存
- **只补空**：逐字段填充，事件内已有值的字段一律不动（历史快照不修订；人员转部门不影响历史统计）
- 查不到的账号进 `unresolved` 名单，事件原样保留（下次再补）
- **完全公开**（豁免登录过期网关）、幂等：已补全的事件不再进候选

**响应**：

```json
{"accounts_total": 3, "resolved": 2, "unresolved": ["ghost-404"], "events_updated": 5}
```

- 补全后统计页（10 号组）立即受益：`stats/users` 取该账号最新事件快照，昵称/部门即刻显示
- 未解析账号重复调用会再查一次 getAccount（短超时 2s，失败降级不丢数据）

### 7d. POST /api/design-systems/views/correct —— 预览量纠正（公开维护）

**语义**：手动修正 `views` 列历史错误数据的**运维通道**。与 PATCH 的 `views` 修正字段同语义：
**非负整数、整字段覆盖（绝对值，非增量）**。

**请求**：JSON body：

```json
{"slug": "ict-pc", "views": 500}
```

- `views` 非负整数（负数/非整数 → 422）；slug 软删/不存在 → 404

**鉴权**：**完全公开**（在登录过期豁免清单内，**免 X-User-Data 直调**）——只开放「纠正预览量」
这一个动作；PATCH 等管理写操作仍需登录态。无 X-User-Data 时操作日志记 unknown、`updated_by`
不动；携带则记实际操作人。`updated_at` 随纠正更新（管理字段变更语义）。

**响应**：`{"slug": "ict-pc", "views": 500}`

## 8. 设计系统白名单（独立于原 /api/whitelist，账号与开关互不影响）

管理台登录校验与权限数据源。**与 lib-resource 原白名单完全隔离**：给设计系统加账号不影响
lib-resource-ui 的访问权；开关 `DS_WHITELIST_ENABLED`（默认 **true**，即默认生效）也只作用于本模块。

| 接口 | 说明 |
|---|---|
| `GET /api/design-systems/whitelist/check?account=` | 校验：`{allowed, account, nick_name, role}`；优先解密 X-User-Data 的账号 |
| `GET /api/design-systems/whitelist` | 列表（?is_active=&search=） |
| `POST /api/design-systems/whitelist` | 新增 {account, nick_name?, remark?, role?}，role: super/admin |
| `PUT /api/design-systems/whitelist/{id}` | 更新昵称/备注/角色/状态 |
| `DELETE /api/design-systems/whitelist/{id}` | 软删 |

**表 ds_whitelist_accounts**：account（unique）、nick_name、remark、role（super=超管/admin=管理员）、
is_active（软删）、created_at/updated_at。

**角色语义**（管理台纯前端拦截）：super=全部操作；admin=编辑/重传/查看；白名单外=denied 无权页。

**种子**：admin/zhangsan（super）、lisi/guest/wangwu（admin），见 `scripts/seed_design_systems.py`。

**列表 `_fmt`**：`{id, account, nick_name, remark, role, is_active, created_at, updated_at}`，时间为 epoch 毫秒。

## 9. GET /api/design-systems/operation-logs —— 操作记录

设计系统模块操作记录，固定 `target_type IN (design_system, ds_whitelist)`，按 `id` 倒序分页。
**`operator_account` 为 unknown 的记录不返回**（历史脚本/公开维护通道 7d 无登录态写入的
unknown 日志，页面不展示；NULL 同样排除）——total/分页按过滤后口径。

**查询参数**：

| 参数 | 说明 |
|---|---|
| page | 页码，≥1，默认 1 |
| limit | 每页条数，1-100，默认 20 |
| action | 可选：`create` / `update_meta` / `update_parts` / `delete` / `update` |
| target_type | 可选：`design_system` / `ds_whitelist` |

**响应**：

```json
{
  "items": [
    {
      "id": 163,
      "operator": "管理员",
      "operator_account": "admin",
      "action": "create",
      "target_type": "design_system",
      "target_id": 12,
      "target_name": "封面测试",
      "detail": { "slug": "..." },
      "created_at": 1793411835753
    }
  ],
  "total": 26, "page": 1, "limit": 20
}
```

- `created_at` 为 epoch 毫秒；`detail` 已解析为对象（无则 null）
- 动作枚举：设计系统 → create / update_meta / update_parts / delete；白名单 → create / update / delete

## 数据表（design_systems）

| 列 | 类型 | 说明 |
|---|---|---|
| id | int PK | 自增 |
| slug | varchar(100) UNIQUE | 系统标识（**后端生成 8 位随机 [a-z0-9]**）：API 路径 / 落盘目录 / 静态 URL |
| source_slug | varchar(100) | tokens.json 的 `id` 原样保留（**不唯一，允许重复**；展示/搜索/追溯；**id 可缺失**，缺失回落 slug，不校验格式）。存量数据启动时回填 = slug |
| name / desc | varchar(255) / text | 卡片字段 |
| usage | int | 调用量（默认 0；**不从 MD 派生**） |
| views | int | 预览量（默认 0；展示端详情页每次加载自动 +1，走 /views 接口） |
| author | text | 作者，JSON 数组字符串（/getAccount 完整值：`[{id, userID, account, nickName, dept}]`）；旧数据为纯字符串（昵称语义），读取时自动包装 |
| cover | varchar(100) | 内置封面名（cover-cyan.jpg）或自定义封面相对路径（design-systems/covers/{slug}.webp） |
| icon | text | 图标相对路径（design-systems/icons/{slug}.svg），无则空 |
| is_default | bool | 默认系统（全局至多一个） |
| file_path | varchar(500) | 解析产物 JSON 相对路径 |
| source_md_path | varchar(500) | DESIGN.md 原件相对路径（design_md_url 数据源，design_md 部件替换时更新） |
| source_zip_path | varchar(500) | **旧 zip 直传时代历史遗留**（v4 起不再读取、不对外暴露；列保留仅为存量数据不动） |
| skill_zip_path | varchar(500) | skill 包相对路径（保留上传原文件名；skill_zip_url 数据源；skill 部件替换换名时旧文件自动清理；落盘 zip 内 SKILL.md 为 name 改写后版本） |
| preview_disabled | bool | 预览页面禁用标记（v4.5；默认 false=启用）：true 时 preview_url 返回 null（展示端回落模板渲染），preview_entry_path/parts.preview/落盘文件不变；切换通道仅 PATCH `preview_enabled` 字段 |
| is_disabled | bool | 系统级禁用标记（v4.6；默认 false=启用）：true 时展示端列表过滤、详情与 views/usage/7b 打点 404（数据/文件/统计全保留）；管理台列表 include_disabled 可见；切换通道仅 PATCH `enabled` 字段 |
| file_size | int | `{slug}` 目录落盘内容合计（design-system.json + source.md + tokens.json + assets/** + skill 包；旧数据为 zip/MD 原件大小） |
| created_by / updated_by | varchar(100) | 操作人（AuthMiddleware 解密） |
| is_deleted | int | 软删标记 |
| created_at / updated_at | datetime | |

## 存储布局

```
{FILE_ROOT_DIR}/                      本地 ./storage，生产 /data/resource
└─ design-systems/
   ├─ covers/                         内置封面（cover-blue/cyan/purple/violet.jpg）+ 自定义封面（{slug}.{jpg|png|webp}）
   ├─ icons/                          内置默认图标（icon-default.svg）+ 自定义图标（{slug}.{jpg|png|webp|svg}；svg 消毒 + CSP 响应头）
   ├─ a7xk92mf/                       （slug = 后端 8 位随机）
   │  ├─ design-system.json           服务端解析产物（token 区块 + components/patterns，展示端数据源；存储版已瘦身——不内嵌源码/概览）
   │  ├─ source.md                    design_md 部件落盘件（DESIGN.md 原文，展示端概览数据源）
   │  ├─ tokens.json                  tokens 部件原件（唯一数据源留档；老系统无此文件）
   │  ├─ my-skill-pack.zip            skill 包原样保留（上传原文件名；skill_zip_url 可下载）
   │  ├─ preview/…                    预览页面包整站落盘（preview_url 指向其入口 html；单层包裹已剥离；v4.5 起永久保留——禁用仅 preview_url 置 null，文件不删）
   │  └─ assets/{components,patterns}/…  组件包 / Pattern 包落盘资产（html/css 经 /static 可直接访问；同名嵌套层已剥离）
   ├─ h-design/…                      （存量：design-system.json + source.md 两件，编辑部件时原样兼容）
   └─ zips-era/…                      （旧 zip 直传时代系统：磁盘上可能残留 source.zip 历史文件，v4 起无任何入口引用）
```

## 种子迁移

首次部署：将 `design-system-app/public/design-systems/detail/systems/{h-design,ict-pc,text-to-ui}/design-system.json`
拷入 `design-systems/{slug}/`，执行导入脚本写表（meta：作者/调用量/封面/默认标记见 design-system-app 的 `src/pages/design-system/data/*.json`）。

## 二期预留（不在本期范围）

- usage 埋点统计（更细粒度的调用维度）
