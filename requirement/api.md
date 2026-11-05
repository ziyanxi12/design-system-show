# 设计系统管理 API 契约（v2 · zip 上传）

> 前端：`design-system-admin`（管理台 5 栏：设计系统管理 / Zip 解析 / 人员管理 / 操作记录 / 数据统计）+ `design-system-app`（展示端）
> 后端：在 `lib-resource-service` 中新增 `routers/design_systems.py` 实现，存储走 `FILE_ROOT_DIR`
> （本地 `./storage`，生产 `/data/resource`），文件相对路径 `design-systems/{slug}/…`
>
> **v2 变更（requirement/1.md）**：上传物从 DESIGN.md 改为 **zip 包**（octo-design-zip/1）：
> `DESIGN.md`（展示数据，服务端解析）+ `assets/`（components、patterns 递归目录到 html，
> html 文件名 = 组件名）+ 附件（DESIGN.md 同级**任意 .zip**，不强制命名，保留原文件名可下载）。
> **slug 由后端分配**（8 位随机 `[a-z0-9]`，API 路径/落盘目录/静态 URL），
> MD frontmatter 的 id 原样保留在 `source_slug`（不唯一，允许重复）——同 id 重传不再 409。
> **usage 不从 MD 派生**（md 里的 `usage: 143` 不允许直接使用）：新增恒 0，修正通道仅表单字段。
> 大文件分片：>20MB 走 `init → chunks → complete`（5MB/片，前端 console 打印分片日志）。
>
> 请求头：`octo-vs-token` + `X-User-Data`（AES-CBC 加密 userInfo）；人员搜索走独立服务 `GET /getAccount?keyword=`（mock 3090，需 `uiplusToken` 头），头像走 `GET /face/{account去首字符}/{size}`（mock 3091），见 mock-api/api.md。
>
> 生产 nginx：`client_max_body_size` 需 ≥ 25m（分片单片 5MB + 余量；直传路径 200MB 上限走分片，不受此限）。

## 通用约定

- 路由前缀：`/api/design-systems`（生产经 nginx `/aaa/` 反代剥前缀，与 lib-resource-ui 一致）
- 请求头：`octo-vs-token`（固定值）+ `X-User-Data`（AES-CBC 加密的 userInfo，同 lib-resource-ui）；`created_by/updated_by` 取自解密结果
- 错误响应：`{"detail": "错误描述"}`，状态码 400（校验失败）/ 404（不存在）/ 413（超限）；~~409（slug 重复）~~ **v2 移除**（slug 后端随机分配，结构上不可能冲突；同一 source_slug 可共存多条记录）
- 时间格式：`design_systems` 表相关为 ISO 8601；白名单与操作记录接口返回 epoch 毫秒（见第 8/9 节）

## zip 包格式（octo-design-zip/1）

```
xxx.zip                          ≤200MB
├─ assets/
│  ├─ components/                递归目录 → html 文件（文件名去扩展 = 组件名）
│  └─ patterns/                  递归目录 → html 文件
├─ DESIGN.md                     必须在 zip 根（octo-design-md/1 格式；支持单层包裹目录）
└─ <任意名>.zip                   可选附件：DESIGN.md 同级任意 .zip 即视为附件（不强制命名）；
                                 多个时取名称排序第一个；保留原文件名落盘（skill_zip_url 可下载）
```

**服务端处理**：zip 先落盘（`source.zip`）再解压 → `DESIGN.md` 解析为 design-system.json（复用
`app/services/design_system_md.py`）→ 递归扫描 `assets/components`、`assets/patterns`
（目录层级保留在 `group` 字段 + name 前缀；html 源码内嵌 `source.files[].code`，
同目录 css/scss 一并内嵌——展示端模板 sandbox iframe 直接渲染）→ 合并为最终 design-system.json。

**安全校验（400）**：zip slip（`..`/绝对路径/反斜杠/symlink/特殊文件类型）、zip bomb
（条目数 >5000、解压总量 >500MB、单文件 >10MB 且压缩比 >100）、缺 DESIGN.md、
DESIGN.md 不可解析 / 结构校验失败（同 v1 规则 2-5）。

## 接口

### 1. GET /api/design-systems —— api1：列表（含个数）

展示端首页卡片与管理台列表共用。

**查询参数**（可选）：`search=关键词` —— 按 `name` / `slug` / `source_slug`（规范 id） / `author` 模糊匹配（ilike）。展示端不带 search 取全量。

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
      "zip_url": "/static/design-systems/a7xk92mf/source.zip",
      "skill_zip_url": "/static/design-systems/a7xk92mf/my-skill-pack.zip",
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
  DESIGN.md frontmatter 的 `id` 原样保留（不唯一，允许重复——同一规范 id 重传/多版本共存）；
  存量数据 `source_slug == slug`（启动时回填），URL 零变化
- `author`：**对象数组**，条目为 `/getAccount`（人员搜索服务）返回的**完整值**（驼峰原样）：
  `[{id, userID, account, nickName, dept: [4级部门数组]}]`；写入时服务端按 account 兜底补全 nickName/dept
  （查 users 表，查不到保持原值，允许外部作者）。旧字符串数据读取时自动包装为单元素（昵称语义）。
  展示约定（前端）：**管理台**显示 `nickName(account)`（列表/弹窗 >2 人折叠为「前 2 + 等 N 人」，
  hover tip 展示全量）；**展示端**只显示 `nickName`（回落 account；卡片 >2 人同样折叠 + hover 气泡全量）；
  头像来自独立服务 `GET /face/{account 去掉首字符}/{size}`（mock 3091 直连）
- `icon` / `icon_url`：`icon` 为自定义图标相对路径（**null=未自定义**）；`icon_url` **恒有值**——未自定义时回落内置默认图标
  `design-systems/icons/icon-default.svg`（品牌紫圆角 + DS 字样；`BUILTIN_ICONS` 列表结构，便于后续扩充内置图标集）；
  `file_size` 为上传的 **zip 原件**大小（旧 MD 数据为 MD 大小）
- `json_url` / `design_md_url` / `zip_url` / `skill_zip_url`：design-system.json（服务端解析产物，展示端数据源）、
  zip 内提取的 DESIGN.md 原件、**zip 原件**、**附件**（DESIGN.md 同级任意 .zip，保留原文件名；zip 内无 .zip 则 null）的可访问 URL；
  当前部署约定为**相对路径**（`PUBLIC_ORIGIN` 置空 → `/static/...`）：本地 dev 走前端 vite 代理
  （`/api`、`/static` 直通 8009，纯同源无 CORS 依赖）；生产由 nginx 同域配置 `/api` 与 `/static` 直通后端。
  管理台文件行展示/下载的主文件是 source.zip；无 zip 的旧数据 `zip_url` 为 null（回落 DESIGN.md → JSON）
  （`PUBLIC_ORIGIN` 若非空仍会生成 `{PUBLIC_ORIGIN}{ROOT_PATH}/static/...` 绝对 URL，为 lib-resource 兼容保留）
- `usage`：**不从 MD frontmatter 派生**（v2 需求：md 里的 usage 值不允许直接使用）——新增恒 0，
  修正通道仅 PATCH 的 `usage` 字段与 `/usage` 自增接口；重传保留现值
- `views`：**预览量**——展示端设计系统详情页**每次加载自动 +1**（`POST /{slug}/views`），
  新增恒 0；高频调用不写操作日志、不动 `updated_at`；展示端头部用接口返回值即时显示
- `created_by/updated_by` 为 account，`*_name` 为「昵称 account」显示名——直查 users 表解析，无记录时回落 account
- 排序：`default` 置顶，其余按 `created_at` 倒序（slug 已随机化，字典序无意义）

### 2. POST /api/design-systems —— 上传（zip 直传，≤200MB）

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| file | File | **zip 包**（octo-design-zip/1 格式，≤200MB；仅收 .zip，服务端解压解析为 design-system.json） |
| name / desc | 可选 | 卡片字段，覆盖从 MD 派生的默认值 |
| author | 可选 | 作者，**JSON 数组字符串**（/getAccount 返回的完整值条目：`[{id, userID, account, nickName, dept}]`）；缺省回落 MD 派生（frontmatter author 视为 account）；写入时服务端按 account 兜底补全 |
| usage / default | 可选 | 调用量 / 默认标记（usage 为手动修正通道；不传则恒 0，**不读 MD 值**） |
| cover_file | File? | 可选自定义封面（jpg/png/webp ≤2MB），存 `design-systems/covers/{slug}.{ext}`；不上传则 `cover` 回落内置名（默认 `cover-cyan.jpg`） |
| icon_file | File? | 可选图标（jpg/png/webp/svg ≤2MB），存 `design-systems/icons/{slug}.{ext}`；svg 服务端消毒（剥离 script/on*= / javascript: / foreignObject）+ 响应加 CSP 头 |

**服务端校验**（失败返回 400，detail 为错误说明/错误列表拼接）：

1. 扩展名 .zip（其余 400「仅支持上传 zip 包」）
2. zip 安全校验（slip / bomb / 条目数，见「zip 包格式」节）；必须含根级（或单层包裹目录下）DESIGN.md
3. MD 可解析：必须有 frontmatter；各章节 ` ```json design ` 代码块须为合法 JSON
4. 解析结果的 `id`（→ source_slug）匹配 `^[a-z0-9][a-z0-9-]*$`；`name` 非空
5. `color` / `typography` / `spacing` / `radius` / `shadow` 至少一个区块（保证展示端模板可渲染）
6. 附件文件名与系统保留文件（`source.zip` / `source.md` / `design-system.json`，大小写不敏感）冲突 → 400
7. `cover_file` / `icon_file` 超 2MB / 类型不符 → 400
8. zip 超 200MB → **413**

**行为**：解压解析为 design-system.json（含 components/patterns 区块）存
`design-systems/{slug}/design-system.json`；zip 原件存 `source.zip`（`source_zip_path` 列）；
DESIGN.md 提取存 `source.md`（`source_md_path` 列）；附件原样存
`design-systems/{slug}/{附件原文件名}`（`skill_zip_path` 列）；assets 目录解压到
`design-systems/{slug}/assets/**`（html/css 等经 /static 可直接访问）。**slug 后端随机生成**——
无冲突无 409；同 source_slug 重复上传可共存（多版本/分支场景）。写 `design_systems`
表记录与操作日志；`default=true` 时清除其他系统的默认标记。

**响应**：同列表 item 结构（`slug` 为新生成的随机 id）。

### 2a. POST /api/design-systems/parse —— zip 解析预览（不落库）

管理台「Zip 解析」页数据源：上传 zip → 返回解析结果，右侧模板渲染预览。

**请求**：`multipart/form-data`，字段 `file`（zip，直传 ≤200MB，校验同上传 1-5）。

**响应**：

```json
{
  "ds": { "…": "design-system.json 同构 dict（token 区块 + components/patterns）" },
  "stats": {
    "slug": "h-design", "name": "…",
    "components": 12, "patterns": 3,
    "levels": ["basic", "form", "list"],
    "zip_size": 5242880
  },
  "skill_zip": { "present": true, "filename": "my-skill-pack.zip", "size": 1048576, "content_base64": "…" }
}
```

- `skill_zip.filename`：附件原文件名（不强制命名）；`content_base64`：附件 ≤50MB 时 base64 回传
  （管理台「Zip 解析」页直接提供下载链接），超限为 null（提示入库后经 `skill_zip_url` 下载）

### 2b. 分片上传（>20MB 由前端自动切换）

```
POST /api/design-systems/uploads/init        body: {"filename": "x.zip", "size": 52428800}
  → {"upload_id": "…32hex…", "chunk_size": 5242880, "chunk_count": 10}
PUT  /api/design-systems/uploads/{upload_id}/chunks/{index}
  body: raw binary（Content-Type: application/octet-stream；单片 5MB，末片为余量）
  → {"received": 3, "size": 5242880}
POST /api/design-systems/uploads/{upload_id}/complete
  multipart 表单（name/desc/author/usage/default/cover_file/icon_file，同上传；
  另可选 slug 字段 = 重传模式，语义对齐 PUT /{slug}/json）
  → 合并校验 → zip 导入 → 同列表 item 结构
```

- 会话目录 `FILE_ROOT_DIR/design-systems/uploads/{upload_id}/`（meta.json + `{index}.part`），
  **TTL 24h 自动清理**（init 时顺带扫描）；分片序号/大小不符、会话缺失或已结束 → 400
- 导入失败（zip 内容问题）→ 400，会话清理；成功 → 会话清理后返回 item
- 前端（client.ts `uploadZipFlow`）按大小自动切换直传/分片，**console.log 打印每片进度与成功/失败**（v2 需求）

### 3. GET /api/design-systems/{slug}/json —— 详情 JSON

返回原始 design-system.json（`FileResponse`）。等价于静态路径 `/static/design-systems/{slug}/design-system.json`，展示端 template.html 直接 fetch 后者。

### 4. PATCH /api/design-systems/{slug} —— 编辑卡片 meta

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| name / desc / default | 可选表单字段 | 卡片字段（slug 不可改） |
| author | 可选 | 作者，**JSON 数组字符串**（/getAccount 完整值条目，空数组清空作者）；写入时按 account 兜底补全 |
| usage | 可选 | 调用量修正通道（API 层保留）；**界面不提供编辑入口**，手动修正走此字段 |
| cover_file | File? | 可选新封面（jpg/png/webp ≤2MB）；上传则覆盖现有封面，不上传则保留现有封面 |
| icon_file | File? | 可选新图标（jpg/png/webp/svg ≤2MB）；上传则覆盖现有图标，不上传则保留现有图标 |

**行为**：更新记录与 `updated_at`，写操作日志；`default=true` 时清除其他默认。
**响应**：更新后的 item。

### 5. PUT /api/design-systems/{slug}/json —— 重传覆盖（zip）

**请求**：`multipart/form-data`，字段 `file`（新 **zip 包**，仅收 .zip，≤200MB；>20MB 前端走分片 complete 的 `slug` 重传模式，语义一致）。
**校验**：同上传 1-5（zip 安全 + MD 结构）。
**行为**：解压解析后**全量替换内容文件**：design-system.json / source.zip / source.md / 附件
（新包无附件或附件名不同时，按 `skill_zip_path` 列清理旧附件——保留原文件名后固定路径
「覆盖」不到旧文件）/ assets/**（目录整体替换）；`name`/`file_size` 跟随新 MD/zip；
MD id 变化只更新 `source_slug`（slug 与落盘目录不动，操作日志记录变化）；
**封面/图标/作者/调用量/描述/默认标记保留**（管理字段不被覆盖）。

### 6. DELETE /api/design-systems/{slug} —— 删除

**行为**：软删（`is_deleted=1`），列表不再返回；写操作日志。**响应**：`200 {"detail": "ok"}`。

### 7. POST /api/design-systems/{slug}/usage —— 调用量自增

**语义**：该设计系统被调用/使用一次记一次。**调用方**：使用方（如 Octo Design 或其他服务）显式调用——
展示端/管理台 UI **不会**自动触发；手动修正调用量走接口 4 的 `usage` 字段。

**行为**：
- 每次调用 `usage += 1`，SQL 端原子自增（并发安全）
- 高频调用：不写操作日志；`updated_at` 保持不变（其语义是内容/管理字段更新时间）
- slug 不存在 → 404

**响应**：`{"slug": "text-to-ui", "usage": 4}`

### 7a. POST /api/design-systems/{slug}/views —— 预览量自增

**语义**：展示端设计系统详情页**每次加载**调用一次，`views += 1`（与 `/usage` 的外部显式调用不同，
本接口由展示端前端自动触发，用于「调用量旁边展示预览量」的需求）。

**行为**：

- 每次调用 `views += 1`，SQL 端原子自增（并发安全）
- 高频调用：不写操作日志；`updated_at` 保持不变
- slug 不存在 → 404

**响应**：`{"slug": "h-design", "views": 1287}`

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

**查询参数**：

| 参数 | 说明 |
|---|---|
| page | 页码，≥1，默认 1 |
| limit | 每页条数，1-100，默认 20 |
| action | 可选：`create` / `update_meta` / `reupload` / `delete` / `update` |
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
- 动作枚举：设计系统 → create / update_meta / reupload / delete；白名单 → create / update / delete

## 数据表（design_systems）

| 列 | 类型 | 说明 |
|---|---|---|
| id | int PK | 自增 |
| slug | varchar(100) UNIQUE | 系统标识（**后端生成 8 位随机 [a-z0-9]**）：API 路径 / 落盘目录 / 静态 URL |
| source_slug | varchar(100) | DESIGN.md frontmatter 的 id 原样保留（**不唯一，允许重复**；展示/搜索/追溯）。存量数据启动时回填 = slug |
| name / desc | varchar(255) / text | 卡片字段 |
| usage | int | 调用量（默认 0；**不从 MD 派生**） |
| views | int | 预览量（默认 0；展示端详情页每次加载自动 +1，走 /views 接口） |
| author | text | 作者，JSON 数组字符串（/getAccount 完整值：`[{id, userID, account, nickName, dept}]`）；旧数据为纯字符串（昵称语义），读取时自动包装 |
| cover | varchar(100) | 内置封面名（cover-cyan.jpg）或自定义封面相对路径（design-systems/covers/{slug}.webp） |
| icon | text | 图标相对路径（design-systems/icons/{slug}.svg），无则空 |
| is_default | bool | 默认系统（全局至多一个） |
| file_path | varchar(500) | 解析产物 JSON 相对路径 |
| source_md_path | varchar(500) | DESIGN.md 原件相对路径（design_md_url 数据源，软删重建时也更新） |
| source_zip_path | varchar(500) | zip 原件相对路径（zip_url 数据源；旧 MD 数据为 NULL） |
| skill_zip_path | varchar(500) | 附件相对路径（DESIGN.md 同级任意 .zip，保留原文件名；skill_zip_url 数据源） |
| file_size | int | 上传 zip 原件 bytes（旧数据为 MD 大小） |
| created_by / updated_by | varchar(100) | 操作人（AuthMiddleware 解密） |
| is_deleted | int | 软删标记 |
| created_at / updated_at | datetime | |

## 存储布局

```
{FILE_ROOT_DIR}/                      本地 ./storage，生产 /data/resource
└─ design-systems/
   ├─ covers/                         内置封面（cover-blue/cyan/purple/violet.jpg）+ 自定义封面（{slug}.{jpg|png|webp}）
   ├─ icons/                          内置默认图标（icon-default.svg）+ 自定义图标（{slug}.{jpg|png|webp|svg}；svg 消毒 + CSP 响应头）
   ├─ uploads/                         分片上传会话目录（{upload_id}/meta.json + {index}.part，TTL 24h 清理）
   ├─ templates/                       design-system.template.zip（v2 zip 示例模版：DESIGN.md + assets 骨架 + 示例附件）
   ├─ a7xk92mf/                        （slug = 后端 8 位随机）
   │  ├─ design-system.json           服务端解析产物（token 区块 + components/patterns，展示端数据源）
   │  ├─ source.zip                    上传 zip 原件（zip_url 可下载，可追溯）
   │  ├─ source.md                     zip 内提取的 DESIGN.md
   │  ├─ my-skill-pack.zip             附件原样保留（原文件名；skill_zip_url 可下载）
   │  └─ assets/{components,patterns}/…  解压资产（html/css 经 /static 可直接访问）
   └─ h-design/…                       （存量：design-system.json + source.md 两件）
```

## 种子迁移

首次部署：将 `design-system-app/public/design-systems/detail/systems/{h-design,ict-pc,text-to-ui}/design-system.json`
拷入 `design-systems/{slug}/`，执行导入脚本写表（meta：作者/调用量/封面/默认标记见 design-system-app 的 `src/pages/design-system/data/*.json`）。

## 二期预留（不在本期范围）

- usage 埋点统计（更细粒度的调用维度）
