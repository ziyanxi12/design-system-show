# 设计系统管理 API 契约（v1）

> 前端：`design-system-admin`（管理台 4 栏：设计系统管理 / 人员管理 / 操作记录 / 数据统计）+ `design-system-app`（展示端）
> 后端：在 `lib-resource-service` 中新增 `routers/design_systems.py` 实现，存储走 `FILE_ROOT_DIR`
> （本地 `./storage`，生产 `/data/resource`），文件相对路径 `design-systems/{slug}/design-system.json`
>
> 上传文件为 **DESIGN.md**（octo-design-md/1 格式：YAML frontmatter + `## 章节 {#anchor}` 正文 +
> ` ```json design ` 代码块），服务端解析为 design-system.json（`app/services/design_system_md.py`，
> 移植自 demo 的 `script/extract_design_md.py`）；MD 模版见管理台 `public/templates/design-system.template.md`。
>
> 请求头：`octo-vs-token` + `X-User-Data`（AES-CBC 加密 userInfo）；人员搜索走独立服务 `GET /getAccount?keyword=`（mock 3090，需 `uiplusToken` 头），头像走 `GET /face/{account去首字符}/{size}`（mock 3091），见 mock-api/api.md。

## 通用约定

- 路由前缀：`/api/design-systems`（生产经 nginx `/aaa/` 反代剥前缀，与 lib-resource-ui 一致）
- 请求头：`octo-vs-token`（固定值）+ `X-User-Data`（AES-CBC 加密的 userInfo，同 lib-resource-ui）；`created_by/updated_by` 取自解密结果
- 错误响应：`{"detail": "错误描述"}`，状态码 400（校验失败）/ 404（不存在）/ 409（slug 重复）/ 413（超限）
- 时间格式：`design_systems` 表相关为 ISO 8601；白名单与操作记录接口返回 epoch 毫秒（见第 8/9 节）

## 接口

### 1. GET /api/design-systems —— api1：列表（含个数）

展示端首页卡片与管理台列表共用。

**查询参数**（可选）：`search=关键词` —— 按 `name` / `slug` / `author` 模糊匹配（ilike）。展示端不带 search 取全量。

**响应**：

```json
{
  "count": 3,
  "items": [
    {
      "slug": "h-design",
      "name": "H Design 官网设计规范",
      "desc": "…",
      "author": [
        { "id": 112, "userID": "u00112", "account": "l20031135", "nickName": "罗唯", "dept": ["华为", "2012实验室", "UX部", "设计二组"] }
      ],
      "usage": 143,
      "cover": "cover-blue.jpg",
      "cover_url": "/static/design-systems/covers/cover-blue.jpg",
      "icon": "design-systems/icons/h-design.svg",
      "icon_url": "/static/design-systems/icons/h-design.svg",
      "json_url": "/static/design-systems/h-design/design-system.json",
      "design_md_url": "/static/design-systems/h-design/source.md",
      "default": true,
      "file_size": 194067,
      "created_by": "luowei",
      "updated_by": "luowei",
      "created_by_name": "罗唯 luowei",
      "updated_by_name": "罗唯 luowei",
      "updated_at": "2026-10-30T08:00:00"
    }
  ]
}
```

- `author`：**对象数组**，条目为 `/getAccount`（人员搜索服务）返回的**完整值**（驼峰原样）：
  `[{id, userID, account, nickName, dept: [4级部门数组]}]`；写入时服务端按 account 兜底补全 nickName/dept
  （查 users 表，查不到保持原值，允许外部作者）。旧字符串数据读取时自动包装为单元素（昵称语义）。
  展示约定（前端）：**管理台**显示 `nickName(account)`（列表/弹窗 >2 人折叠为「前 2 + 等 N 人」，
  hover tip 展示全量）；**展示端**只显示 `nickName`（回落 account；卡片 >2 人同样折叠 + hover 气泡全量）；
  头像来自独立服务 `GET /face/{account 去掉首字符}/{size}`（mock 3091 直连）
- `icon` / `icon_url`：`icon` 为自定义图标相对路径（**null=未自定义**）；`icon_url` **恒有值**——未自定义时回落内置默认图标
  `design-systems/icons/icon-default.svg`（品牌紫圆角 + DS 字样；`BUILTIN_ICONS` 列表结构，便于后续扩充内置图标集）；
  `file_size` 为上传的 MD 原件大小
- `json_url` / `design_md_url`：**design-system.json（服务端解析产物，展示端数据源）与 DESIGN.md 原件**的可访问 URL；
  当前部署约定为**相对路径**（`PUBLIC_ORIGIN` 置空 → `/static/...`）：本地 dev 走前端 vite 代理
  （`/api`、`/static` 直通 8009，纯同源无 CORS 依赖）；生产由 nginx 同域配置 `/api` 与 `/static` 直通后端。
  管理台文件行展示/下载的是 DESIGN.md（用户面主文件）；无 MD 的旧数据 `design_md_url` 为 null
  （`PUBLIC_ORIGIN` 若非空仍会生成 `{PUBLIC_ORIGIN}{ROOT_PATH}/static/...` 绝对 URL，为 lib-resource 兼容保留）
- `json_url`：展示端详情数据源；`created_by/updated_by` 为 account，`*_name` 为「昵称 account」显示名——直查 users 表解析，无记录时回落 account
- 排序：`default` 置顶，其余按 slug 字典序

### 2. POST /api/design-systems —— 上传

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| file | File | **DESIGN.md**（octo-design-md/1 格式，≤10MB；仅收 .md/.markdown，服务端解析为 design-system.json） |
| name / desc | 可选 | 卡片字段，覆盖从 MD 派生的默认值 |
| author | 可选 | 作者，**JSON 数组字符串**（/getAccount 返回的完整值条目：`[{id, userID, account, nickName, dept}]`）；缺省回落 MD 派生（frontmatter author 视为 account）；写入时服务端按 account 兜底补全 |
| usage / default | 可选 | 调用量 / 默认标记 |
| cover_file | File? | 可选自定义封面（jpg/png/webp ≤2MB），存 `design-systems/covers/{slug}.{ext}`；不上传则 `cover` 回落内置名（默认 `cover-cyan.jpg`） |
| icon_file | File? | 可选图标（jpg/png/webp/svg ≤2MB），存 `design-systems/icons/{slug}.{ext}`；svg 服务端消毒（剥离 script/on*= / javascript: / foreignObject）+ 响应加 CSP 头 |

**服务端校验**（失败返回 400，detail 为错误说明/错误列表拼接）：

1. 扩展名 .md / .markdown（其余 400「仅支持上传 DESIGN.md」）
2. MD 可解析：必须有 frontmatter；各章节 ` ```json design ` 代码块须为合法 JSON
3. 解析结果的 `id` 匹配 `^[a-z0-9][a-z0-9-]*$`（作为 slug）
4. `name` 非空
5. `color` / `typography` / `spacing` / `radius` / `shadow` 至少一个区块（保证展示端模板可渲染）
6. slug 已存在（活跃记录）→ **409**（提示走重传）；**软删记录**占用 slug 的 DB 唯一约束 → 同 slug 重建时**复活该行**（保留 id 与历史操作日志关联，字段全量覆盖）
7. `cover_file` / `icon_file` 超 2MB / 类型不符 → 400

**行为**：MD 解析为 design-system.json 存 `design-systems/{slug}/design-system.json`，MD 原件存
`design-systems/{slug}/source.md`（`source_md_path` 列记录，驱动 `design_md_url`）；写 `design_systems`
表记录与操作日志；`default=true` 时清除其他系统的默认标记。

**响应**：同列表 item 结构。

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

### 5. PUT /api/design-systems/{slug}/json —— 重传覆盖

**请求**：`multipart/form-data`，字段 `file`（新 **DESIGN.md**，仅收 .md）。
**校验**：同上传 1-5；另要求解析结果的 `id` 与 `{slug}` 一致，否则 400。
**行为**：解析新 MD 后替换 `design-system.json` 与 `source.md`（同步更新 `source_md_path`）；`name/file_size`
跟随新 MD；**封面/图标/作者/调用量/描述/默认标记保留**（管理字段不被 MD 重置）。

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
| slug | varchar(100) UNIQUE | 系统标识（解析自 MD 的 id），对外统一使用 |
| name / desc | varchar(255) / text | 卡片字段 |
| usage | int | 调用量（默认 0） |
| author | text | 作者，JSON 数组字符串（/getAccount 完整值：`[{id, userID, account, nickName, dept}]`）；旧数据为纯字符串（昵称语义），读取时自动包装 |
| cover | varchar(100) | 内置封面名（cover-cyan.jpg）或自定义封面相对路径（design-systems/covers/{slug}.webp） |
| icon | text | 图标相对路径（design-systems/icons/{slug}.svg），无则空 |
| is_default | bool | 默认系统（全局至多一个） |
| file_path | varchar(500) | 解析产物 JSON 相对路径 |
| source_md_path | varchar(500) | DESIGN.md 原件相对路径（design_md_url 数据源，软删重建时也更新） |
| file_size | int | 上传的 MD 原件 bytes |
| created_by / updated_by | varchar(100) | 操作人（AuthMiddleware 解密） |
| is_deleted | int | 软删标记 |
| created_at / updated_at | datetime | |

## 存储布局

```
{FILE_ROOT_DIR}/                      本地 ./storage，生产 /data/resource
└─ design-systems/
   ├─ covers/                         内置封面（cover-blue/cyan/purple/violet.jpg）+ 自定义封面（{slug}.{jpg|png|webp}）
   ├─ icons/                          内置默认图标（icon-default.svg）+ 自定义图标（{slug}.{jpg|png|webp|svg}；svg 消毒 + CSP 响应头）
   ├─ h-design/
   │  ├─ design-system.json           服务端解析 MD 产物（展示端数据源）
   │  └─ source.md                    上传的 DESIGN.md 原件（可追溯）
   ├─ ict-pc/…
   └─ text-to-ui/…                    （种子：现有 3 系统由脚本导入）
```

## 种子迁移

首次部署：将 `design-system-app/public/design-systems/detail/systems/{h-design,ict-pc,text-to-ui}/design-system.json`
拷入 `design-systems/{slug}/`，执行导入脚本写表（meta：作者/调用量/封面/默认标记见 design-system-app 的 `src/pages/design-system/data/*.json`）。

## 二期预留（不在本期范围）

- zip 上传（含图标/截图等资产文件，解压到 `design-systems/{slug}/assets/`）
- usage 埋点统计（更细粒度的调用维度）
