/* 组件 ↔ Pixso 组件名字匹配 → 回填映射表（阶段 2 匹配脚本）
 *
 * 用法：
 *   node match-mapping.mjs <slug> [--dry] [--base http://localhost:8009] [--json ./pixso-components.json]
 *
 * 数据流：
 *   pixso-components.json（组件库全量快照，guid 为 key）
 *     → 候选构建（变体按 containingStateGroup 聚合成组件集；普通组件取名字首段；
 *       过滤噪音：`.` 前缀私有 / TUI-SVG / Text-to-UI Icon）
 *   GET {base}/static/design-systems/{slug}/assets/components/index.json（HTML 组件清单）
 *     → 匹配（L1 精确 exact → L2 归一化 fuzzy → 未命中 missing）→ PUT /{slug}/mapping 入库
 *
 * 语义：merge 回填（manual 行不覆盖，由后端保护）；--dry 只打印对照表不写库。
 * url 字段：URL_BASE 未配置时留空（展示端对无 url 条目不渲染跳转按钮）。
 */
import { Buffer } from "node:buffer"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/* ── 参数 ── */
const argv = process.argv.slice(2)
const slug = argv.find(a => !a.startsWith("--"))
const DRY = argv.includes("--dry")
const BASE = (argv.find(a => a.startsWith("--base=")) || `--base=http://localhost:8009`).split("=")[1]
const JSON_PATH = argv.find(a => a.startsWith("--json="))?.split("=")[1] || join(__dirname, "pixso-components.json")
const URL_BASE = "http://localhost:3667"   // Pixso 跳转域名（占位本地服务；换真实域名只改这里重跑）

if (!slug) { console.error("用法: node match-mapping.mjs <slug> [--dry] [--base=…] [--json=…]"); process.exit(1) }

/* ── Pixso 候选构建 ── */
const norm = s => String(s).replace(/[-_\s]/g, "").toLowerCase()
const snapshot = JSON.parse(readFileSync(JSON_PATH, "utf-8"))
const comps = snapshot.components

const sets = new Map()      // 组件集：name → {guid, category}
const plains = new Map()    // 普通组件：首段名 → {guid, category}
for (const x of Object.values(comps)) {
  const cf = x.containing_frame || {}
  const sg = cf.containingStateGroup
  if (x.isVariant && sg) {
    if (!sets.has(sg.name)) sets.set(sg.name, { guid: sg.nodeId, category: cf.name || "" })
  } else if (!x.isVariant) {
    const first = x.name.split("/")[0]
    if (first.startsWith(".") || first.startsWith("TUI-SVG") || first.startsWith("Text-to-UI Icon")) continue
    if (!plains.has(first)) plains.set(first, { guid: x.node_id, category: cf.name || "" })
  }
}

/* ── HTML 组件清单 ── */
const ixRes = await fetch(`${BASE}/static/design-systems/${slug}/assets/components/index.json`)
if (!ixRes.ok) { console.error(`组件清单读取失败（HTTP ${ixRes.status}）—— 系统可能没有组件包，先上传或 PUT parts`); process.exit(1) }
const ix = await ixRes.json()
const htmlNames = [...new Set(ix.items.map(p => p.replace(/\\/g, "/").split("/").filter(Boolean).at(-2)).filter(Boolean))]

/* ── 匹配（L1 精确 → L2 归一化 → missing；单射防串） ── */
const used = new Set()
const matchOne = name => {
  for (const [store, kind] of [[sets, "set"], [plains, "plain"]]) {
    for (const [pname, info] of store) {
      if (!used.has(pname) && name === pname)
        return { pixso_name: pname, pixso_guid: info.guid, pixso_category: info.category, match_type: "exact", status: "aligned", kind }
    }
  }
  for (const [store] of [[sets], [plains]]) {
    for (const [pname, info] of store) {
      if (!used.has(pname) && norm(name) === norm(pname))
        return { pixso_name: pname, pixso_guid: info.guid, pixso_category: info.category, match_type: "fuzzy", status: "partial", kind: store === sets ? "set" : "plain" }
    }
  }
  return null
}

const results = []
for (const name of htmlNames) {
  const m = matchOne(name)
  if (m) used.add(m.pixso_name)
  results.push({ component_name: name, ...m })
}

/* ── 对照表（dry 与正式跑都打印） ── */
const stat = { aligned: 0, partial: 0, missing: 0 }
console.log(`\n${slug} 匹配对照表（Pixso 候选：${sets.size} 个组件集 + ${plains.size} 个普通组件）`)
console.log("─".repeat(88))
for (const r of results) {
  stat[r.status || "missing"]++
  const mark = r.status === "aligned" ? "✔" : r.status === "partial" ? "◐" : "✘"
  const guid = r.pixso_guid ? `${r.pixso_guid}${r.kind === "set" ? "（集）" : ""}` : ""
  console.log(`${mark} ${r.component_name.padEnd(24)} ${r.pixso_name || "（未命中）".padEnd(22)} ${guid.padEnd(16)} ${r.match_type || ""}`)
}
console.log("─".repeat(88))
console.log(`汇总：精确 ${results.filter(r => r.match_type === "exact").length} / 归一化 ${results.filter(r => r.match_type === "fuzzy").length} / 未命中 ${stat.missing} / 共 ${results.length}`)

if (DRY) { console.log("\n[dry] 未写库。去掉 --dry 正式执行 PUT 回填。"); process.exit(0) }

/* ── 入库（PUT merge：manual 行后端自动跳过） ── */
const KEY = "igdLyDijk4RO2v8qoacX4i99u+CMO7xzReG6aVNHf28="
const rawKey = Buffer.from(KEY, "base64")
const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["encrypt"])
const iv = crypto.getRandomValues(new Uint8Array(16))
const payload = new TextEncoder().encode(JSON.stringify({ account: "admin", nickName: "管理员", loginTime: Date.now() }))
const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, payload)
const combined = new Uint8Array(16 + ct.byteLength)
combined.set(iv); combined.set(new Uint8Array(ct), 16)

const items = results.map(r => ({
  component_name: r.component_name,
  ...(r.pixso_guid ? {
    pixso_name: r.pixso_name,
    pixso_guid: r.pixso_guid,
    pixso_category: r.pixso_category || "",
    file_key: snapshot.fileKey,
    match_type: r.match_type,
    status: r.status,
    url: URL_BASE ? `${URL_BASE}/design/${snapshot.fileKey}?item-id=${r.pixso_guid}` : "",
  } : {}),
}))

const res = await fetch(`${BASE}/api/design-systems/${slug}/mapping`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-User-Data": Buffer.from(combined).toString("base64") },
  body: JSON.stringify({ items }),
})
const body = await res.json()
if (!res.ok) { console.error(`入库失败 HTTP ${res.status}:`, JSON.stringify(body)); process.exit(1) }
console.log(`\n入库成功：${JSON.stringify(body)}`)
