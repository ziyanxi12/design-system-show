# 设计系统展示端（design-system-app）

设计系统模块的展示端：卡片列表 + 详情页（Token Viewer）。
数据全部来自后端 `lib-resource-service` 的 api1（`GET /aaa/api/design-systems`），本地无静态兜底——加载中显示提示，失败显示错误态；内容管理请用 [design-system-admin](../design-system-admin/README.md)。

## 页面与数据流

```
/design-system            卡片列表：api1 → 封面（cover_url）/ 名称 / 作者 / 调用量 / 默认徽标，支持搜索
/design-system/:id        详情页：外层壳 + 内嵌 Token Viewer 模板（iframe）
```

详情页采用 iframe + postMessage 握手（见 `src/pages/design-system/detail.tsx`）：

```
父页面                          iframe（public/design-systems/detail/template.html）
─────                          ──────────────────────────────────────────────
<iframe src=template.html>  →  模板加载完成
← postMessage {type:"ds-ready"}
postMessage {type:"ds-data", data:{id, meta}}
                             →  按 meta.jsonUrl fetch design-system.json
                             →  buildPage 渲染 8 个分区（概览/颜色/字体/间距/圆角/阴影/组件/资产）
← postMessage {type:"ds-back"}（用户点面包屑返回）
navigate("/design-system")     回列表
```

## 技术栈

SolidJS 1.9 + Vite 7 + TypeScript（路由 @solidjs/router）

## 启动与构建

```bash
npm i
npm run dev      # 8091 端口，/aaa 代理到 http://localhost:8009
npm run build    # vite build，产物 dist/
```

后端依赖：`lib-resource-service` 需在 8009 端口运行（契约见 `../requirement/api.md`）。

## 目录结构

```
src/
├── index.tsx                        路由（/ → /design-system 重定向）
├── index.css
└── pages/design-system/
    ├── index.tsx                    列表页（api1 数据 → 卡片 + 搜索 + 加载/错误/空态）
    ├── data.ts                      数据层（api1 → DsEntry[]，signal 共享；对齐 api.md 契约）
    └── detail.tsx                   详情页（iframe 模板 + postMessage 协议）
public/
└── design-systems/detail/
    ├── template.html                Token Viewer 模板（按 jsonUrl 拉取 JSON 并渲染）
    └── avatar-author.png            作者头像占位图
```

## 已知约定

- 列表排序由后端决定（default 置顶，其余按 slug 字典序）
- 详情数据源是 api1 返回的 `json_url`（完整 URL，由后端 `PUBLIC_ORIGIN` 驱动），模板直接 fetch
- 调用量（usage）由调用方显式自增（api 契约 7 号接口），展示端只读展示
