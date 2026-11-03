---
format: octo-design-md/1
id: your-system-slug
name: "你的设计系统名称"
author: "author-account"
cover: cover-cyan.jpg
usage: 0
---

# 你的设计系统名称

> 这里是文档级说明（frontmatter 之后、第一个 `## ` 之前的引用块），
> 会写入 meta.note。

## 概览 {#overview}

这里是概览正文第一段，会作为 overview.text 展示。

### 设计原则

> 来源：references/interaction-spec.md

- 原则一：一致性优先。
- 原则二：少即是多。

## 颜色 {#color}

本章正文第一段作为 color 区块的 desc。

### 使用规则

- 主色用于主要操作。
- 语义色（成功/警告/危险）仅用于状态反馈。

```json design
{
  "title": "颜色",
  "groups": [
    {
      "name": "品牌色",
      "tokens": [
        { "name": "--color-primary", "value": "#1677ff", "comment": "主色" },
        { "name": "--color-primary-hover", "value": "#4096ff", "comment": "主色悬停" }
      ]
    },
    {
      "name": "语义色",
      "tokens": [
        { "name": "--color-success", "value": "#52c41a", "comment": "成功" },
        { "name": "--color-warning", "value": "#faad14", "comment": "警告" },
        { "name": "--color-danger", "value": "#ff4d4f", "comment": "危险" }
      ]
    }
  ]
}
```

## 字体 {#typography}

本章正文第一段作为 typography 区块的 desc。

### 使用规则

- 正文 14px，辅助信息 12px。

```json design
{
  "title": "字体",
  "scale": [
    { "name": "caption", "size": 12, "lineHeight": 1.5, "comment": "辅助说明" },
    { "name": "body", "size": 14, "lineHeight": 1.5, "comment": "正文" },
    { "name": "title", "size": 18, "lineHeight": 1.4, "comment": "卡片标题" },
    { "name": "headline", "size": 24, "lineHeight": 1.3, "comment": "页面标题" }
  ]
}
```

## 间距 {#spacing}

本章正文第一段作为 spacing 区块的 desc。

```json design
{
  "title": "间距",
  "tokens": [
    { "name": "--space-xs", "value": 4, "comment": "紧凑" },
    { "name": "--space-md", "value": 16, "comment": "默认" },
    { "name": "--space-lg", "value": 24, "comment": "卡片内边距" }
  ],
  "scenes": [
    { "name": "表单", "tokens": [{ "name": "表单项间距", "value": 16 }] }
  ]
}
```

## 圆角 {#radius}

本章正文第一段作为 radius 区块的 desc。

```json design
{
  "title": "圆角",
  "tokens": [
    { "name": "--radius-sm", "value": 4, "comment": "小控件" },
    { "name": "--radius-md", "value": 8, "comment": "按钮/输入框" },
    { "name": "--radius-lg", "value": 12, "comment": "卡片" }
  ]
}
```

## 阴影 {#shadow}

本章正文第一段作为 shadow 区块的 desc。

```json design
{
  "title": "阴影",
  "tokens": [
    { "name": "--shadow-card", "value": "0 2px 8px rgba(0,0,0,0.08)", "comment": "卡片" },
    { "name": "--shadow-modal", "value": "0 8px 32px rgba(0,0,0,0.16)", "comment": "弹窗" }
  ]
}
```
