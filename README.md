# Octo Agent · 设计系统模块 Demo

用于演示「在 UX Agent 中增加设计系统模块」的完整交互流程。

- `design-system-app/`：展示端（纯 HTML + CSS + JS，无需构建，也可用其内 Vite 方式运行）
- `design-system-admin/`：设计系统管理台（React + Ant Design，四栏：设计系统管理 / 人员管理 / 操作记录 / 数据统计，详见其 [README](design-system-admin/README.md)）
- `requirement/`：需求记录与后端 API 契约（[api.md](requirement/api.md)），后端实现在 lib-resource-service

## 打开方式（展示端 Demo）

```bash
cd design-system-demo
python3 -m http.server 5178
# 浏览器打开 http://localhost:5178
```

也可以直接双击 `index.html`（个别浏览器对本地文件的剪贴板权限有限制，推荐用上面的方式）。按 1920×1080 设计稿还原。

## 演示路径

1. **首页**：点击输入框里的调色板按钮选择设计系统 → 直接发送（留空会使用默认需求「添加刷卡位置」）。
2. **生成页**：Agent 分步展示「理解需求 → 读取设计系统（命中的区块可点击跳转）→ 规划结构 → 生成界面」，右侧画布逐块生成页面。
   - 顶部标题旁或输入框里切换设计系统，同一页面即时换肤
   - 工具栏：预览/代码、桌面/平板/手机、局部修改、画布编辑、历史版本、下载 HTML、标注（查看元素引用的 token）、归档
   - 输入框追问「主按钮改为“立即添加”」会生成新版本
3. **设计系统管理页**：左下「设计系统」进入；搜索、卡片更多菜单（在对话中使用 / 设为默认 / 副本 / 重新同步 / 导出 JSON / 删除）。
4. **导入规范Skill**：从技能库选择或上传压缩包 → 回放转换日志 → 查看 8 个区块覆盖情况 → 生成设计系统并进入详情页。
5. **设计系统详情页**：概览 / 颜色 / 字体 / 间距 / 圆角 / 阴影 / 组件 / 资产，提取不到的区块显示空状态。

## 目录

```
index.html
assets/css      base（外壳）· agent（首页、生成页）· ds（管理页、详情页）
assets/js       core（工具、路由）· theme（token→主题变量）· shell · gen（生成页模板）· agent · ds
assets/img      Pixso 导出的图片
data/registry.js        设计系统列表、技能库
data/systems/<id>/      规范 Skill 提取结果（ICT、H Design 为真实提取）
data/mock-systems.js    其余设计系统的示意数据（同一结构）
skills/spec-skill-to-design-system   规范 Skill → 设计系统 转换 SKILL
design-system-admin/    设计系统管理台（React + TS + AntD，见其 README）
requirement/            需求记录（1.md）与后端 API 契约（api.md）
```

## 重新提取

```bash
python3 skills/spec-skill-to-design-system/scripts/extract.py "<规范Skill目录>" --id ict-pc --out data/systems
```
