# 设计系统管理台（design-system-admin）

设计系统模块的管理端，负责设计系统的增删改查、白名单人员管理、操作审计与调用量统计。
数据全部来自后端 `lib-resource-service`（`/api/design-systems` 前缀，契约见 `../requirement/api.md`），本地无 mock。

## 功能（4 栏）

| 菜单 | 路由 | 说明 |
|---|---|---|
| 设计系统管理 | `/#/list` | 列表搜索（名称/slug/作者，后端模糊匹配）；新增 / 编辑 / 查看统一走三态弹窗（JSON 拖拽上传 + 校验 + 字段自动填入、封面按钮选图 + 按钮区预览、下载模版）；编辑弹窗内可选替换 JSON（PUT 重传）与换封面 |
| 人员管理 | `/#/people` | 白名单账号 5 列表格（账号/昵称/角色/创建时间/操作）；角色支持行内下拉修改；账号联想搜索（外部用户 API）；写操作（新增/删除/改角色）仅 super |
| 操作记录 | `/#/logs` | 设计系统 + 白名单两类操作日志，动作/对象类型筛选，后端分页 |
| 数据统计 | `/#/stats` | api1 数据 → 调用量分布饼图（@ant-design/charts）+ 总数/总调用量卡片 |

## 权限模型

登录走统一 signIn（本地开发用 `public/signIn` mock 页）；进入前经 AuthGuard 调白名单校验接口：

- `super`：全部操作（新增/编辑/删除设计系统、人员管理写操作）
- `admin`：可编辑/重传设计系统；人员管理只读
- 白名单外：denied 页

角色与白名单数据存于后端 `ds_whitelist_accounts` 表（种子：admin/zhangsan=super，lisi/guest/wangwu=admin）。

## 技术栈

React 18 + TypeScript + Vite + Ant Design 5 + @ant-design/charts + react-router-dom（Hash 路由）

## 启动与构建

```bash
npm i
npm run dev      # 默认 8092 端口（被占用时自动换），/aaa 代理到 http://localhost:8009
npm run build    # tsc --noEmit + vite build，产物 dist/
```

后端依赖：`lib-resource-service` 需在 8009 端口运行（含 design-systems / ds_whitelist 路由）。

## 目录结构

```
src/
├── api/
│   ├── client.ts        统一请求层（octo-vs-token + X-User-Data 头；列表/CRUD/操作记录/白名单/用户联想搜索）
│   ├── errors.ts        ApiError
│   └── validate.ts      design-system.json 前端校验 + meta 派生
├── components/
│   ├── DesignSystemFormModal.tsx   三态弹窗（新增/编辑/查看），含 JSON 上传校验与封面选择
│   ├── JsonPreviewModal.tsx        JSON 预览/复制
│   └── AuthGuard.tsx               登录态 + 白名单校验 + 角色上下文（useRole）
├── pages/
│   ├── Layout.tsx       侧边栏布局（菜单 + 底部用户区）
│   ├── DesignSystemList.tsx   列表页（搜索 + 三态弹窗入口 + 删除）
│   ├── PeopleManagement.tsx   人员管理
│   ├── OperationLogs.tsx      操作记录
│   └── StatsPage.tsx          数据统计
├── types.ts             实体类型（DesignSystemItem / WhitelistAccount / OperationLog …）
└── utils/               auth（登录态）、crypto（X-User-Data AES）、whitelist（校验封装）
```

## 已知约定

- 调用量（usage）界面不提供编辑入口，仅作为 API 修正通道（见 api.md 接口 4）
- PUT 重传 JSON 保留现有封面；name 跟随新 JSON，其余管理字段保留
- 编辑提交做增量 diff：只发变化的字段，避免产生脏操作日志
