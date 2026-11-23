/* 组件 ↔ Pixso 组件名字匹配 → 回填映射表（阶段 2 匹配脚本）
 *
 * 用法：
 *   node match-mapping.mjs <slug> [--library=<库id>] [--dry] [--base http://localhost:8009]
 *
 * 数据流：
 *   fetch-subscribe.js（订阅组件库快照——demo 写死 / 正式环境真实获取，输出结构见其文件头）
 *     → 选库（--library=<id> 指定，缺省取第一个有组件的库）
 *     → match-core.js（共享匹配核心：只用名字——L1 精确 exact→aligned / L2 归一化 fuzzy→partial /
 *       未命中 missing，单射防串）
 *   GET {base}/static/design-systems/{slug}/assets/components/index.json（HTML 组件清单）
 *     → 匹配 → PUT /{slug}/mapping 入库（merge：manual 行后端自动跳过）
 *   组件集命中行随行生成 instance_spec（变体名反推轴值对照）+ component_content_key（变更检测）
 *
 * 匹配核心与展示端编辑路由（design-system-app/src/pages/design-system/edit.tsx）共用
 * design-system-app/src/lib/match-core.js——改匹配口径只改那一处。
 */
import { Buffer } from "node:buffer"
import { fetchSubscribedLibraries } from "./fetch-subscribe.js"
import { buildCandidates, matchAll, buildInstanceSpec } from "../../design-system-app/public/design-systems/detail/match-core.js"

/* ── 参数 ── */
const argv = process.argv.slice(2)
const slug = argv.find(a => !a.startsWith("--"))
const DRY = argv.includes("--dry")
const BASE = (argv.find(a => a.startsWith("--base=")) || `--base=http://localhost:8009`).split("=")[1]
const LIBRARY_ID = argv.find(a => a.startsWith("--library="))?.split("=")[1] || ""
const URL_BASE = "http://localhost:3667"   // Pixso 跳转域名（占位本地服务；换真实域名只改这里重跑）

if (!slug) { console.error("用法: node match-mapping.mjs <slug> [--library=<库id>] [--dry] [--base=…]"); process.exit(1) }

/* ── 订阅组件库快照与选库 ── */
const snapshot = await fetchSubscribedLibraries()
const lib = (LIBRARY_ID ? snapshot.libraries.find(l => l.id === LIBRARY_ID) : null)
  || snapshot.libraries.find(l => l.components && Object.keys(l.components).length)
if (!lib) {
  console.error(`未找到组件库${LIBRARY_ID ? `（--library=${LIBRARY_ID}）` : ""}；可用：${snapshot.libraries.map(l => `${l.id}（${l.name}）`).join("、")}`)
  process.exit(1)
}

/* ── Pixso 候选构建（共享核心）── */
const candidates = buildCandidates(lib.components)

/* ── HTML 组件清单 ── */
const ixRes = await fetch(`${BASE}/static/design-systems/${slug}/assets/components/index.json`)
if (!ixRes.ok) { console.error(`组件清单读取失败（HTTP ${ixRes.status}）—— 系统可能没有组件包，先上传或 PUT parts`); process.exit(1) }
const ix = await ixRes.json()
const htmlNames = [...new Set(ix.items.map(p => p.replace(/\\/g, "/").split("/").filter(Boolean).at(-2)).filter(Boolean))]

/* ── 匹配（共享核心：L1 精确 → L2 归一化 → missing；单射防串）── */
const results = matchAll(htmlNames, candidates)

/* ── 对照表（dry 与正式跑都打印）── */
const stat = { aligned: 0, partial: 0, missing: 0 }
console.log(`\n${slug} 匹配对照表（组件库「${lib.name}」${lib.id !== slug ? ` · ${lib.id}` : ""}：${candidates.sets.size} 个组件集 + ${candidates.plains.size} 个普通组件）`)
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

/* ── 入库（PUT merge：manual 行后端自动跳过）── */
const KEY = "igdLyDijk4RO2v8qoacX4i99u+CMO7xzReG6aVNHf28="
const rawKey = Buffer.from(KEY, "base64")
const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-CBC" }, false, ["encrypt"])
const iv = crypto.getRandomValues(new Uint8Array(16))
const payload = new TextEncoder().encode(JSON.stringify({ account: "admin", nickName: "管理员", loginTime: Date.now() }))
const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, payload)
const combined = new Uint8Array(16 + ct.byteLength)
combined.set(iv); combined.set(new Uint8Array(ct), 16)

/* 命中行：Pixso 侧字段 + 跳转 url；组件集命中行追加 instance_spec（轴值对照）与 component_content_key（变更检测） */
const items = results.map(r => {
  if (!r.pixso_guid) return null
  const set = r.kind === "set" ? candidates.sets.get(r.pixso_name) : null
  const spec = set ? buildInstanceSpec(set.variants) : null
  return {
    component_name: r.component_name,
    pixso_name: r.pixso_name,
    pixso_guid: r.pixso_guid,
    pixso_category: r.pixso_category || "",
    file_key: lib.fileKey,
    match_type: r.match_type,
    status: r.status,
    url: URL_BASE ? `${URL_BASE}/design/${lib.fileKey}?item-id=${r.pixso_guid}` : "",
    ...(spec ? { instance_spec: spec } : {}),
    ...(set && set.contentKey ? { component_content_key: set.contentKey } : {}),
  }
}).filter(Boolean)

const res = await fetch(`${BASE}/api/design-systems/${slug}/mapping`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", "X-User-Data": Buffer.from(combined).toString("base64") },
  body: JSON.stringify({ items }),
})
const body = await res.json()
if (!res.ok) { console.error(`入库失败 HTTP ${res.status}:`, JSON.stringify(body)); process.exit(1) }
console.log(`\n入库成功：${JSON.stringify(body)}`)
