# 设计系统管理 API 契约（v1）

> 前端：`design-system-admin`（管理台 4 栏：设计系统管理 / 人员管理 / 操作记录 / 数据统计）+ `design-system-app`（展示端）
> 后端：在 `lib-resource-service` 中新增 `routers/design_systems.py` 实现，存储走 `FILE_ROOT_DIR`
> （本地 `./storage`，生产 `/data/resource`），文件相对路径 `design-systems/{slug}/design-system.json`
>
> 请求头：`octo-vs-token` + `X-User-Data`（AES-CBC 加密 userInfo）；用户联想搜索复用 `/api/users/search`。

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
      "author": "罗唯",
      "usage": 143,
      "cover": "cover-blue.jpg",
      "cover_url": "/static/design-systems/covers/cover-blue.jpg",
      "json_url": "/static/design-systems/h-design/design-system.json",
      "default": true,
      "file_size": 234726,
      "created_by": "luowei",
      "updated_by": "luowei",
      "created_by_name": "罗唯 luowei",
      "updated_by_name": "罗唯 luowei",
      "updated_at": "2026-10-30T08:00:00"
    }
  ]
}
```

- `cover_url` / `json_url`：**完整 URL**（含域名），由 `PUBLIC_ORIGIN` 驱动（对齐 lib-resource `_to_public_url`）：
  `PUBLIC_ORIGIN` 非空 → `{PUBLIC_ORIGIN}{ROOT_PATH}/static/...`（生产：真实域名 + `ROOT_PATH=/aaa`；
  本地开发：`PUBLIC_ORIGIN=http://localhost:8009` 直接跨域访问，后端 CORS 已放开）
- `json_url`：展示端详情数据源；`created_by/updated_by` 为 account，`*_name` 为「昵称 account」显示名——直查 users 表解析，无记录时回落 account
- 排序：`default` 置顶，其余按 slug 字典序

### 2. POST /api/design-systems —— 上传

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| file | File | design-system.json（≤10MB） |
| name / desc / author / usage / cover / default | 可选 | 卡片字段，覆盖从 JSON 派生的默认值 |
| cover_file | File? | 可选自定义封面图片（jpg/png/webp ≤2MB），上传后存 `design-systems/covers/{slug}.{ext}`，`cover` 列存完整相对路径；不上传则 `cover` 字段回落内置名（默认 `cover-cyan.jpg`） |

**服务端校验**（失败返回 400，detail 为错误列表拼接）：

1. JSON 可解析且为对象
2. `id` 字段：匹配 `^[a-z0-9][a-z0-9-]*$`（作为 slug）
3. `name` 字段非空
4. `color` / `typography` / `spacing` / `radius` / `shadow` 至少一个为对象（保证展示端模板可渲染）
5. `cover` 字段（表单/JSON）：仅认内置封面名（cover-blue/cyan/purple/violet.jpg），其余回落默认 `cover-cyan.jpg`（不报错）；自定义封面由 `cover_file` 上传写入，不接受表单直接传入相对路径
6. slug 已存在 → **409**（提示走重传）
7. `cover_file` 超 2MB / 非 jpg/png/webp → 400

**行为**：存储文件到 `FILE_ROOT_DIR/design-systems/{slug}/design-system.json`；上传 `cover_file` 时另存到 `design-systems/covers/{slug}.{ext}`（文件名固定用 slug 拼扩展名，无路径注入风险），写 `design_systems` 表记录与操作日志；`default=true` 时清除其他系统的默认标记。

**响应**：同列表 item 结构。

### 3. GET /api/design-systems/{slug}/json —— 详情 JSON

返回原始 design-system.json（`FileResponse`）。等价于静态路径 `/static/design-systems/{slug}/design-system.json`，展示端 template.html 直接 fetch 后者。

### 4. PATCH /api/design-systems/{slug} —— 编辑卡片 meta

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| name / desc / author / default | 可选表单字段 | 卡片字段（slug 不可改） |
| usage | 可选 | 调用量修正通道（API 层保留）；**界面不提供编辑入口**，手动修正走此字段 |
| cover_file | File? | 可选新封面（jpg/png/webp ≤2MB）；上传则覆盖现有封面，不上传则保留现有封面 |

**行为**：更新记录与 `updated_at`，写操作日志；`default=true` 时清除其他默认。
**响应**：更新后的 item。

### 5. PUT /api/design-systems/{slug}/json —— 重传覆盖

**请求**：`multipart/form-data`，字段 `file`。
**校验**：同上传 1-5；另要求 JSON 的 `id` 与 `{slug}` 一致，否则 400。
**行为**：替换文件与记录的 `name/file_size/updated_at`；**现有封面保留**（不再被 JSON 的 cover 重置，避免自定义封面被冲掉）；作者/调用量/描述/默认标记保留。

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

## 数据表（design_systems）| 列 | 类型 | 说明 |
|---|---|---|
| id | int PK | 自增 |
| slug | varchar(100) UNIQUE | 系统标识（来自 JSON 的 id） |
| name / desc / author | varchar/text | 卡片字段 |
| usage | int | 调用量（默认 0） |
| cover | varchar(100) | 内置封面文件名（cover-cyan.jpg）或自定义封面完整相对路径（design-systems/covers/{slug}.webp） |
| is_default | bool | 默认系统（全局至多一个） |
| file_path | varchar(500) | 相对 FILE_ROOT_DIR 的路径 |
| file_size | int | bytes |
| created_by / updated_by | varchar(100) | 操作人（AuthMiddleware 解密） |
| is_deleted | int | 软删标记 |
| created_at / updated_at | datetime | |

## 存储布局

```
{FILE_ROOT_DIR}/                      本地 ./storage，生产 /data/resource
└─ design-systems/
   ├─ covers/                         内置封面（cover-blue/cyan/purple/violet.jpg）+ 自定义封面（{slug}.{jpg|png|webp}）
   ├─ h-design/design-system.json
   ├─ ict-pc/design-system.json
   └─ text-to-ui/design-system.json   （种子：现有 3 系统由脚本导入）
```

## 种子迁移

首次部署：将 `design-system-app/public/design-systems/detail/systems/{h-design,ict-pc,text-to-ui}/design-system.json`
拷入 `design-systems/{slug}/`，执行导入脚本写表（meta：作者/调用量/封面/默认标记见 design-system-app 的 `src/pages/design-system/data/*.json`）。

## 二期预留（不在本期范围）

- zip 上传（含图标/截图等资产文件，解压到 `design-systems/{slug}/assets/`）
- usage 埋点统计（更细粒度的调用维度）
