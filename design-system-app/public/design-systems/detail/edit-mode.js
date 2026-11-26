/* 组件↔Pixso 映射编辑模式（template.html EDIT=true 时动态加载）
  * 渲染策略：弹窗骨架一次创建，交互用局部 DOM 更新（class toggle / 局部 HTML），避免闪烁。
  * 模板字面量嵌套 ≤ 2 层，复杂 HTML 用辅助函数构建。
  *
 * 暂存-发布模型（v2）：
 * - confirmMatch / confirmEdit 不再立即 PUT——修改写入内存暂存层 staged（纯内存不持久化：
 *   刷新/关闭页面即清空，只有点「确认发布」落库的数据才能在刷新后存在），
 *   表格经 ctx.applyErows 即时重渲染，宿主「确认发布」按钮亮起（postMessage ds-dirty）；
 * - 宿主点发布 → postMessage ds-publish → publish() 一次 PUT 全量暂存行（400→sync→重试兜底）；
 * - 匹配阶段零后端写入（sync 推迟到发布时触发）；boot 时清理旧版遗留的 sessionStorage 暂存键。
 */

/* Pixso 跳转链接拼接模板：{PIXSO_URL_BASE}/design/{fileKey}?item-id={guid}
 * - PIXSO_URL_BASE：Pixso 端地址（demo = 本地桌面端 3667；换环境只改这里）
 * - fileKey：Pixso 文件 id，来自库明细数据——真实顶层为 snake_case file_key（无顶层时从条目
 *   file_key 推导），fetchLibraryComponents 已归一化成 lib.fileKey 统一取用
 * - guid：组件锚点（普通组件 node_id / 组件集 containingStateGroup.nodeId，即匹配命中的 pixso_guid）
 * 拼接处：runMatch（向导匹配）与 openPicker 确认回填两处 */
const PIXSO_URL_BASE = "http://localhost:3667"

/* 组件库列表：直接 import fetch-subscribe.js（轻量元数据，demo 写死；正式换实现） */
import { fetchSubscribedLibraries } from "./fetch-subscribe.js"

/* 组件明细数据：点「开始匹配」时按需 HTTP 获取（正式同源网关接口）。
 * GET /main/rest.root/workspace/pixsoFile/library?fileKey={fileKey}
 *   请求：uiplusToken 头（登录态 localStorage）+ cookie（credentials:"include"）+ Accept
 *   响应：信封 {content: "<JSON 字符串>"}——库数据本体被序列化成 JSON 字符串放在 content，
 *         前端必须二次 JSON.parse 才是对象
 * 真实明细顶层为 Pixso 文件级结构（snake_case）：team_id/version_id/space_id/file_key/
 *   components/type/styles/variables——无 name/version/componentCount（向导展示元数据
 *   走订阅列表 fetch-subscribe，见 runMatch 的 W.matchLib）；
 *   条目字段：node_id/name/component_key/containing_frame/file_key/thumbnail_url
 * demo：vite 代理 /main → mock-api(3090)，响应结构按真实剥离（仅 file_key + components） */
async function fetchLibraryComponents(fileKey) {
  const r = await fetch("/main/rest.root/workspace/pixsoFile/library?fileKey=" + encodeURIComponent(fileKey), {
    headers: { uiplusToken: localStorage.getItem("uiplusToken") || "", Accept: "application/json" },
    credentials: "include",
  })
  if (!r.ok) throw new Error("HTTP " + r.status)
  const data = await r.json()
  /* content 双重编码校验：必须是 JSON 字符串且能解析为对象——格式不对给明确报错，不静默炸在调用方 */
  if (!data || typeof data.content !== "string" || !data.content.trim()) throw new Error("接口未返回有效的 content（应为 JSON 字符串）")
  var lib
  try { lib = JSON.parse(data.content) } catch (e) { throw new Error("content 不是合法 JSON：" + e.message) }
  if (!lib || typeof lib !== "object") throw new Error("content 解析结果不是对象")
  /* fileKey 归一化成 lib.fileKey 供下游统一消费（runMatch url 拼接 / guidIndex 下拉 / 暂存行 file_key）：
   * 顶层 fileKey（demo 快照）→ 顶层 file_key（真实）→ 首个条目 file_key 推导，逐级兜底 */
  lib.fileKey = lib.fileKey || lib.file_key || (Object.values(lib.components || {})[0] || {}).file_key || ""
  return lib
}

/* 缩略图完整 URL：thumbnail_url 是图片服务（组件库后端）的相对路径（/ 开头），
 * 前端经同源 /api 前缀访问——dev 由 vite 代理 /api/static → mock-api:3090，
 * 生产由网关把 /api 路由到图片服务（图片不在本前端/后端，只通过链接访问）。
 * 空 → 空串；http(s) 绝对地址原样返回；origin 异常（file:// 独立预览）回落相对值。 */
function absThumb(u) {
  if (!u) return ""
  if (/^https?:\/\//i.test(u)) return u
  try { var o = window.location.origin; if (o && o.indexOf("http") === 0) return o + "/api" + u } catch (e) { }
  return u
}

const IC = {
  search: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.4" stroke="currentColor" stroke-width="1.3"/><path d="M9.4 9.4L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.6 7.4l2.8 2.8 6-6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ok: "<svg viewBox='0 0 16 16' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='16.000000' height='16.000000' fill='none' customFrame='#000000'> <rect id='前缀图标' width='16.000000' height='16.000000' x='0.000000' y='0.000000' /> <path id='path' d='M8 0C3.5888 0 0 3.5888 0 8C0 12.4112 3.5888 16 8 16C12.4112 16 16 12.4112 16 8C16 3.5888 12.4112 0 8 0ZM7.60398 10.8041L12.404 6.00408C12.6303 5.77781 12.6303 5.42223 12.404 5.19596C12.1777 4.96969 11.8221 4.96969 11.5959 5.19596L7.19992 9.5919L4.80398 7.19596C4.5777 6.96969 4.22213 6.96969 3.99586 7.19596C3.76958 7.42223 3.76958 7.77781 3.99586 8.00408L6.79586 10.8041C6.93054 10.9388 7.06523 11.0061 7.19992 11.0061C7.3346 11.0061 7.46929 10.9388 7.60398 10.8041Z' fill='rgb(10,89,247)' fill-rule='evenodd' /> </svg>",
  warn: '<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="14.000000" height="14.000000" fill="none" customFrame="#000000"><path id="path" d="M7 0C3.1339 0 0 3.1339 0 7C0 10.8661 3.1339 14 7 14C10.8661 14 14 10.8661 14 7C14 3.1339 10.8661 0 7 0ZM6.5 9.04172C6.5 9.32172 6.72 9.54172 7 9.54172C7.28 9.54172 7.5 9.32172 7.5 9.04172L7.5 3.50003C7.5 3.22003 7.28 3.00003 7 3.00003C6.72 3.00003 6.5 3.22003 6.5 3.50003L6.5 9.04172ZM6.41667 10.6458C6.41667 10.3236 6.67783 10.0625 7 10.0625C7.32217 10.0625 7.58333 10.3236 7.58333 10.6458C7.58333 10.968 7.32217 11.2291 7 11.2291C6.67783 11.2291 6.41667 10.968 6.41667 10.6458Z" fill="rgb(255,187,51)" fill-rule="evenodd" /></svg>',
  chev: '<svg viewBox="0 0 12.0049 12" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="12.004883" height="12.000000" fill="none" customFrame="#000000"> <rect id="箭头" width="12.000000" height="12.000000" x="0.000000" y="0.000000" transform="matrix(-6.12258e-08,1,-1,-6.12258e-08,12.0005,0)" /> <path id="合并" d="M11.8356 1.0176L6.43564 6.65238C6.29125 6.79076 6.1303 6.87649 5.98891 6.87349C5.84753 6.87048 5.70764 6.79678 5.56926 6.65238L0.169259 1.0176C-0.0632212 0.775007 -0.0552793 0.401739 0.187309 0.169259C0.429897 -0.0632209 0.803165 -0.0552791 1.03564 0.187309L6.00245 5.37006L10.9693 0.187309C11.2017 -0.0552798 11.575 -0.0632209 11.8176 0.169259C12.0602 0.401739 12.0681 0.775007 11.8356 1.0176Z" fill="rgb(25,25,25)" fill-rule="evenodd" transform="matrix(-1,-6.12258e-08,-6.12258e-08,1,12.0054,2.99768)" /> </svg>',
  lib: "<svg viewBox=\"0 0 24 24\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" fill=\"none\"><rect width=\"24\" height=\"24\" rx=\"3.428572\" fill=\"rgb(10,89,247)\"/><path d=\"M18.2686 11.9885C18.2686 10.8533 17.9867 9.80569 17.4229 8.84569C16.8629 7.88568 16.1029 7.12378 15.1429 6.55997C14.1829 5.99997 13.1353 5.71997 12 5.71997C10.8648 5.71997 9.81716 5.99997 8.85716 6.55997C7.89716 7.12378 7.13716 7.88568 6.57716 8.84569C6.01335 9.80569 5.73145 10.8533 5.73145 11.9885L7.0743 11.9885C7.0743 11.0895 7.29716 10.2628 7.74287 9.50854C8.18478 8.75426 8.78287 8.15807 9.53716 7.71997C10.2914 7.28188 11.1124 7.06283 12 7.06283C12.8876 7.06283 13.7086 7.28188 14.4629 7.71997C15.2172 8.15807 15.8153 8.75426 16.2572 9.50854C16.7029 10.2628 16.9257 11.0895 16.9257 11.9885L18.2686 11.9885Z\" fill=\"rgb(255,255,255)\" fill-rule=\"nonzero\"/><path d=\"M5.77148 12.6971C5.84767 13.2381 5.97148 13.7467 6.14291 14.2229L7.61148 14.2229C7.37529 13.7467 7.21529 13.2381 7.13148 12.6971L5.77148 12.6971ZM16.8686 12.6971C16.7848 13.2381 16.6248 13.7467 16.3886 14.2229L17.8572 14.2229C18.0286 13.7467 18.1524 13.2381 18.2286 12.6971L16.8686 12.6971ZM9.52006 16.24C9.27244 16.0914 9.03815 15.9219 8.8172 15.7314C8.60006 15.5371 8.39434 15.3314 8.20006 15.1143L6.57148 15.1143C6.80006 15.5067 7.07815 15.8819 7.40577 16.24L9.52006 16.24ZM16.5943 16.24C16.922 15.8819 17.2001 15.5067 17.4286 15.1143L15.8001 15.1143C15.4153 15.5714 14.9753 15.9467 14.4801 16.24L16.5943 16.24ZM8.43434 17.1314C8.94482 17.4857 9.50291 17.76 10.1086 17.9543C10.7105 18.1448 11.341 18.24 12.0001 18.24C12.6591 18.24 13.2896 18.1448 13.8915 17.9543C14.4972 17.76 15.0553 17.4857 15.5658 17.1314L8.43434 17.1314Z\" fill=\"rgb(255,255,255)\" fill-rule=\"nonzero\"/></svg>",
  chevL: '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16.000000" height="16.000000" fill="none"> <rect id="ic_public_left_arrow" width="16.000000" height="16.000000" x="0.000000" y="0.000000" /> <g id="ic_public_left_arrow-左箭头/base/ic_public_left_arrow"> <path id="path4" d="M0 0L6.5 6.66667L13 0" fill-rule="evenodd" stroke="rgb(25,25,25)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.000000" transform="matrix(0,-1,-1,0,11.3335,14.5)" /> </g> </svg>',
  link: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5.5 8.5l3-3M4.2 7.2L3 8.4C2.2 9.2 2.2 10.4 3 11.2c.8.8 2 .8 2.8 0l1.2-1.2M9.8 6.8L11 5.6c.8-.8.8-2 0-2.8-.8-.8-2-.8-2.8 0L7 4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
}

export async function editSetup(ctx) {
  const { slug, components, redraw, main, esc, apiBase } = ctx
  var API = (apiBase || "") + "/api/design-systems/"
  const applyErows = ctx.applyErows
  const res = ctx.res

  let MC
  try { MC = await import("./match-core.js") } catch (e) { console.warn("[edit] match-core:", e); return }
  const { buildCandidates, matchAll, buildInstanceSpec, pickSetThumb, thumbVal } = MC

  /* ── 暂存层 ──
   * base   = GET /mapping 服务端快照（发布成功后刷新）
   * staged = Map<name, row> 内存暂存覆盖层（confirmMatch/confirmEdit 写入；不持久化，刷新即清空）
   * erows  = 工作态 base⊕staged —— 表格渲染 / 向导 kept 基线 / 编辑弹窗回填统一读它 */
  let base = ctx.erows || {}
  let erows = base
  const staged = new Map()
  const P = { busy: false }
  var PUT_FIELDS = ["html_zh", "pixso_name", "pixso_guid", "pixso_category", "file_key", "component_content_key", "match_type", "status", "url", "instance_spec", "thumbnail_url"]

  function postParent(msg) { try { if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*") } catch (e) { } }
  function notifyDirty() { postParent({ type: "ds-dirty", dirty: staged.size > 0, count: staged.size }) }
  function rebuildWork() { erows = Object.assign({}, base, Object.fromEntries(staged)) }
  async function loadBase() {
    try {
      var r = await fetch(API + slug + "/mapping")
      if (r.ok) { var d = await r.json(); base = Object.fromEntries((d.items || []).map(function (x) { return [x.component_name, x] })) }
    } catch (e) { }
  }
  function applyView() { if (applyErows) applyErows(erows); else redraw(); notifyDirty() }

  /* 订阅库列表缓存（预留：正式环境可能需要展示当前库名） */
  var libListP = fetchSubscribedLibraries().then(function (s) { return flatTree(s.tree || []) }).catch(function () { return [] })

  /* 系统共用 file_key：base 已关联行里出现最多的 file_key——系统内组件默认共用一个库，
   * 取众数兜住个别历史杂值；无已关联行 → null（下拉回退全部订阅库） */
  function systemFileKey() {
    var counts = {}, best = null, bestN = 0
    for (var n in base) {
      var r = base[n]
      if (r && r.pixso_guid && r.file_key) {
        counts[r.file_key] = (counts[r.file_key] || 0) + 1
        if (counts[r.file_key] > bestN) { bestN = counts[r.file_key]; best = r.file_key }
      }
    }
    return best
  }

  /* ── guidIndex ── */
  const libIdx = new Map()
  async function guidIndex(fk) {
    const k = fk || "*"
    if (!libIdx.has(k)) libIdx.set(k, (async () => {
      const m = new Map()
      try {
        const snap = await fetchSubscribedLibraries()
        const list = flatTree(snap.tree || [])
        for (const l of (fk ? list.filter(x => x.fileKey === fk) : list)) {
          try {
            const lib = await fetchLibraryComponents(l.fileKey)
            if (!lib) continue
            for (const e of Object.values(lib.components || {})) {
              const cf = e.containing_frame || {}
              const sg = cf.containingStateGroup
              if (sg) {
                /* 变体：归并到组件集锚点（首个变体建 info，后续变体补充缩略图候选后按 pickSetThumb 重选，
                   与 buildCandidates 同规则——保证下拉/卡片/弹窗三处图一致） */
                let info = m.get(sg.nodeId)
                if (!info) {
                  info = { guid: sg.nodeId, name: sg.name, category: cf.name || "", thumb: "", vthumbs: [], fileKey: lib.fileKey || "" }
                  m.set(sg.nodeId, info)
                }
                const t = thumbVal(e)
                if (t) { info.vthumbs.push(t); info.thumb = pickSetThumb(info.vthumbs, info.guid) }
                if (e.node_id) m.set(e.node_id, info)
              } else if (e.node_id) {
                m.set(e.node_id, { guid: e.node_id, name: String(e.name || "").split("/")[0], category: cf.name || "", thumb: thumbVal(e), fileKey: lib.fileKey || "" })
              }
            }
          } catch (e) { }
        }
      } catch (e) { }
      return m
    })())
    return libIdx.get(k)
  }

  let W = { stage: "select", tree: [], libs: [], dom: "", libId: "", q: "", results: [], matchLib: null, tab: "all", saving: false, err: "", open: new Set() }
  let Ed = { comp: null, zh: "", en: "", resolved: null, saving: false, err: "" }
  let Pk = { q: "", groups: {}, selected: null, loading: true }

  const root = document.createElement("div")
  document.body.appendChild(root)

  function dlgBody() { return root.querySelector(".em-dlg-body") }
  function dlgFoot() { return root.querySelector(".em-dlg-foot") }
  function setBody(html) { const b = dlgBody(); if (b) b.innerHTML = html }
  function setFoot(html) { const f = dlgFoot(); if (f) f.innerHTML = html }

  main.addEventListener("click", e => {
    if (e.target.closest("[data-em-wizard]")) { void openWizard(); return }
    const eb = e.target.closest("[data-em-edit]")
    if (eb) { const name = eb.dataset.emEdit; const comp = components.find(x => x.name === name); if (!systemFileKey()) { void openWizard(); return } if (comp) openEdit(comp); return }
  })

  /* ═════ 向导 ═════ */

  /* 树工具：摊平（叶子附祖先链 path）/ 修剪（搜索命中分支）/ 递归渲染（分组 + 叶子） */
  function flatTree(nodes, prefix, out) {
    out = out || []
    prefix = prefix || []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n.children && n.children.length) flatTree(n.children, prefix.concat(n.name), out)
      else {
        n.path = prefix.slice()
        out.push(n)
      }
    }
    return out
  }
  function pruneAll(nodes) {
    var out = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      out.push(n.children && n.children.length ? { name: n.name, children: pruneAll(n.children) } : n)
    }
    return out
  }
  function pruneTree(nodes, q) {
    var out = []
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n.children && n.children.length) {
        if (n.name.toLowerCase().indexOf(q) >= 0) out.push({ name: n.name, children: pruneAll(n.children) })
        else {
          var kids = pruneTree(n.children, q)
          if (kids.length) out.push({ name: n.name, children: kids })
        }
      } else if (n.name.toLowerCase().indexOf(q) >= 0) out.push(n)
    }
    return out
  }
  function countLeaves(nodes) {
    var c = 0
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      if (n.children && n.children.length) c += countLeaves(n.children)
      else c++
    }
    return c
  }
  function renderNodes(nodes, depth, prefix, expandAll) {
    var out = ""
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i]
      var key = prefix ? prefix + "/" + n.name : n.name
      var pad = 16 + depth * 24
      if (n.children && n.children.length) {
        var open = expandAll || W.open.has(key)
        var cnt = depth === 0 ? '<span class="em-tree-cnt">' + countLeaves(n.children) + "个组件库</span>" : ""
        out += '<button type="button" class="em-tree-grp' + (open ? " open" : "") + '" data-grp="' + esc(key) + '" style="padding-left:' + pad + 'px">' +
          '<span class="em-tree-chev">' + IC.chev + "</span>" +
          '<span class="em-tree-name">' + esc(n.name) + "</span>" + cnt + "</button>" +
          '<div class="em-tree-kids"' + (open ? "" : " hidden") + ">" + renderNodes(n.children, depth + 1, key, expandAll) + "</div>"
      } else {
        var sel = W.libId === n.id
        out += '<button type="button" class="em-tree-leaf' + (sel ? " sel" : "") + '" data-lib="' + esc(n.id) + '">' +
          '<span class="em-lib-ic">' + IC.lib + "</span>" +
          '<span class="em-lib-txt"><span class="em-lib-name">' + esc(n.name) + "</span></span>" +
          (sel ? '<span class="em-check">' + IC.check + "</span>" : "") + "</button>"
      }
    }
    return out
  }

  function resultRowHtml(r) {
    var zh = erows[r.component_name] && erows[r.component_name].html_zh
    var zhSpan = zh ? '<span class="zh">' + esc(zh) + "</span>" : ""
    var pixso = r.pixso_name ? '<span class="em-rt-pname">' + esc(r.pixso_name) + "</span>" : '<span class="em-rt-none">尚未关联设计组件</span>'
    var kept = r.kept ? '<span style="margin-left:6px;font-size:14px;color:var(--text-3);background:var(--fill-1);border-radius:4px;padding:1px 6px;">已保留</span>' : ""
    var st = r.pixso_guid ? '<span class="em-st ok">' + IC.ok + "成功</span>" + kept : '<span class="em-st miss">' + IC.warn + "未匹配</span>"
    return '<div class="em-rt-tr em-row"><div class="em-rt-name">' + esc(r.component_name) + zhSpan + "</div><div>" + pixso + "</div><div>" + st + "</div></div>"
  }

  function openWizard() {
    W = { stage: "select", tree: W.tree, libs: W.libs, dom: W.tree[0] ? W.tree[0].name : "", libId: "", q: "", results: [], matchLib: null, tab: "all", saving: false, err: "", open: new Set() }
    root.innerHTML = '<div class="em-mask" data-em-wiz-close><div class="em-dlg" onclick="event.stopPropagation()">' +
      '<div class="em-dlg-head"><span class="t">关联设计组件</span><button class="em-dlg-x" data-em-wiz-close>' + IC.x + "</button></div>" +
      '<div class="em-dlg-body em-dlg-body-flex"></div>' +
      '<div class="em-dlg-foot"></div></div></div>'
    root.querySelectorAll("[data-em-wiz-close]").forEach(function (b) { b.addEventListener("click", closeWiz) })
    fillSelect()
    if (!W.libs.length) {
      fetchSubscribedLibraries()
        .then(function (d) { W.tree = d.tree || []; W.libs = flatTree(W.tree); W.dom = W.tree[0] ? W.tree[0].name : ""; fillSelectBody() })
        .catch(function (e) { W.err = "组件库列表加载失败：" + e.message; fillSelectBody() })
    }
  }
  function closeWiz() { root.innerHTML = "" }

  function fillSelect() { fillSelectBody(); fillSelectFoot() }

  function fillSelectFoot() {
    setFoot('<span class="spacer"></span><button class="em-btn" data-em-wiz-close>取消</button><button class="em-btn em-btn-primary" data-em-start>关联</button>')
    var startBtn = dlgFoot() ? dlgFoot().querySelector("[data-em-start]") : null
    if (startBtn) startBtn.disabled = !W.libId
    dlgFoot().querySelectorAll("[data-em-wiz-close]").forEach(function (b) { b.addEventListener("click", closeWiz) })
    if (startBtn) startBtn.addEventListener("click", function () { runMatch() })
  }

  function fillSelectBody() {
    var domHtml = W.tree.map(function (n) {
      var on = (W.dom || (W.tree[0] && W.tree[0].name)) === n.name
      return '<button class="em-dom-item' + (on ? " on" : "") + '" data-em-dom="' + esc(n.name) + '">' + esc(n.name) + "</button>"
    }).join("")
    setBody('<label class="em-wiz-search">' + IC.search + '<input placeholder="搜索全部组件库" value="' + esc(W.q) + '" data-em-wq></label>' +
      (W.tree.length
        ? '<div class="em-wiz-cols"><div class="em-dom-list">' + domHtml + '</div><div class="em-tree"></div></div>'
        : '<div class="em-wiz-empty" style="flex:1">' + (W.err || "组件库加载中...") + "</div>"))
    var input = dlgBody() ? dlgBody().querySelector("[data-em-wq]") : null
    if (input) input.addEventListener("input", function (e) { W.q = e.target.value; updateLibList() })
    dlgBody().querySelectorAll("[data-em-dom]").forEach(function (b) {
      b.addEventListener("click", function () {
        W.dom = b.dataset.emDom
        W.q = ""
        var inp = dlgBody().querySelector("[data-em-wq]")
        if (inp) inp.value = ""
        dlgBody().querySelectorAll(".em-dom-item").forEach(function (el) { el.classList.toggle("on", el.dataset.emDom === W.dom) })
        updateLibList()
      })
    })
    updateLibList()
  }

  function updateLibList() {
    var treeEl = dlgBody() ? dlgBody().querySelector(".em-tree") : null
    if (!treeEl) return
    var q = W.q.trim().toLowerCase()
    var html = ""
    if (q) {
      var pruned = pruneTree(W.tree, q)
      html = pruned.length ? renderNodes(pruned, 0, "", true) : '<div class="em-wiz-empty">没有匹配搜索的组件库</div>'
    } else {
      var domNode = null
      for (var i = 0; i < W.tree.length; i++) if (W.tree[i].name === W.dom) domNode = W.tree[i]
      var kids = domNode ? domNode.children || [] : []
      html = kids.length ? renderNodes(kids, 0, domNode.name, false) : '<div class="em-wiz-empty">没有可选择的组件库</div>'
    }
    treeEl.innerHTML = html
    treeEl.onclick = function (e) {
      var g = e.target.closest("[data-grp]")
      if (g) {
        var key = g.dataset.grp
        var kidsEl = g.nextElementSibling
        var nowOpen = !kidsEl || kidsEl.hidden
        if (kidsEl) kidsEl.hidden = !nowOpen
        g.classList.toggle("open", nowOpen)
        if (nowOpen) W.open.add(key); else W.open.delete(key)
        return
      }
      var l = e.target.closest("[data-lib]")
      if (l) {
        W.libId = l.dataset.lib
        var lib = null
        for (var i = 0; i < W.libs.length; i++) if (W.libs[i].id === W.libId) lib = W.libs[i]
        if (lib && lib.path) for (var j = 1; j <= lib.path.length; j++) W.open.add(lib.path.slice(0, j).join("/"))
        updateLibList()
        var start = dlgFoot() ? dlgFoot().querySelector("[data-em-start]") : null
        if (start) start.disabled = !W.libId
      }
    }
  }

  function showMatching() {
    var libName = ""
    for (var i = 0; i < W.libs.length; i++) if (W.libs[i].id === W.libId) libName = W.libs[i].name
    setBody('<div class="em-matching"><div class="em-spinner"></div><div class="t">正在匹配设计组件</div><div class="s">核对本地组件 ID 与样别名，保留已有链接</div></div>')
    setFoot('<span style="font-size:14px;line-height:22px;height:22px;color:#777777;margin-right:auto;">已选：' + esc(libName) + '</span><button class="em-btn" data-em-wiz-close>取消</button><button class="em-btn em-btn-primary" disabled>关联</button>')
    dlgFoot().querySelector("[data-em-wiz-close]").addEventListener("click", closeWiz)
  }

  function showResult() {
    var matched = W.results.filter(function (r) { return r.pixso_guid }).length
    var libCard = ""
    if (W.matchLib) {
      libCard = '<div class="em-sel-lib"><span class="em-lib-ic">' + IC.lib + "</span>" +
        "<span><span class=\"em-sel-lib-name\">" + esc(W.matchLib.name) + "</span>" +
        '<span class="em-sel-lib-meta">版本 ' + esc(W.matchLib.version || "—") + " · " + (W.matchLib.componentCount ?? "?") + '个组件</span></span>' +
        "</div>"
    }
    var tabs = '<div class="em-tabs">' +
      '<button class="' + (W.tab === "all" ? "on" : "") + '" data-em-tab="all">全部（' + W.results.length + "）</button>" +
      '<button class="' + (W.tab === "matched" ? "on" : "") + '" data-em-tab="matched">已匹配（' + matched + "）</button>" +
      '<button class="' + (W.tab === "missing" ? "on" : "") + '" data-em-tab="missing">未匹配（' + (W.results.length - matched) + "）</button></div>"
    setBody(libCard + tabs + '<div class="em-rt"></div>')
    var errSpan = W.err ? '<span class="em-dlg-err">' + esc(W.err) + "</span>" : '<span style="font-size:14px;line-height:22px;height:22px;color:#777777;margin-right:auto;">已选：' + esc(W.matchLib ? W.matchLib.name : "") + "</span>"
    setFoot(errSpan + '<span class="spacer"></span><button class="em-btn" data-em-wiz-close>取消</button><button class="em-btn em-btn-primary" data-em-confirm>关联</button>')
    dlgFoot().querySelectorAll("[data-em-wiz-close]").forEach(function (b) { b.addEventListener("click", closeWiz) })
    dlgFoot().querySelector("[data-em-confirm]").addEventListener("click", function () { confirmMatch() })
    dlgBody().querySelectorAll("[data-em-tab]").forEach(function (b) {
      b.addEventListener("click", function () {
        W.tab = b.dataset.emTab
        dlgBody().querySelectorAll(".em-tabs button").forEach(function (el) { el.classList.toggle("on", el.dataset.emTab === W.tab) })
        updateResultRows()
      })
    })
    updateResultRows()
  }

  function updateResultRows() {
    var rt = dlgBody() ? dlgBody().querySelector(".em-rt") : null
    if (!rt) return
    var items = W.tab === "matched" ? W.results.filter(function (r) { return r.pixso_guid })
      : W.tab === "missing" ? W.results.filter(function (r) { return !r.pixso_guid }) : W.results
    rt.innerHTML = '<div class="em-rt-tr em-th"><div>原型组件</div><div>关联的设计组件</div><div>匹配状态</div></div><div class="em-rt-body">' +
      items.map(resultRowHtml).join("") + "</div>"
  }

  function runMatch() {
    var lib = null
    for (var i = 0; i < W.libs.length; i++) if (W.libs[i].id === W.libId) lib = W.libs[i]
    if (!lib) return
    W.err = ""
    showMatching()
    /* 暂存模型：匹配阶段零后端写入——sync 推迟到发布时（publish 内 400→sync→重试兜底） */
    Promise.all([
      fetchLibraryComponents(lib.fileKey),
      new Promise(function (r) { setTimeout(r, 1200) }),
    ]).then(function (arr) {
      var full = arr[0]
      var candidates = buildCandidates(full.components)
      var ms = matchAll(components.map(function (x) { return x.name }), candidates)
      W.results = ms.map(function (m) {
        var ex = erows[m.component_name]
        if (ex && ex.pixso_guid && (ex.match_type === "manual" || !m.pixso_guid)) {
          return { component_name: m.component_name, pixso_name: ex.pixso_name, pixso_guid: ex.pixso_guid, pixso_category: ex.pixso_category || "", match_type: ex.match_type, status: ex.status || "aligned", url: ex.url || "", fileKey: ex.file_key || "", thumbnail_url: ex.thumbnail_url || null, spec: null, contentKey: null, kept: true, changed: false }
        }
        var set = m.kind === "set" && m.pixso_name ? candidates.sets.get(m.pixso_name) : null
        return {
          component_name: m.component_name, pixso_name: m.pixso_name, pixso_guid: m.pixso_guid, pixso_category: m.pixso_category, match_type: m.match_type, status: m.status,
          /* Pixso 跳转链接拼接处（模板见文件头 PIXSO_URL_BASE 注释）：fileKey 来自组件库清单，guid 为命中锚点 */
          url: m.pixso_guid && full.fileKey ? PIXSO_URL_BASE + "/design/" + full.fileKey + "?item-id=" + m.pixso_guid : "",
          fileKey: full.fileKey || "",
          /* 缩略图：命中候选的 thumbnail_url 原始相对值（渲染时 absThumb 拼 origin+/api 前缀） */
          thumbnail_url: m.pixso_thumb || null,
          spec: set ? buildInstanceSpec(set.variants) : null, contentKey: set ? set.contentKey : null, kept: false,
          /* 已关联但缺缩略图的行重跑匹配也视为有变化——可补上 thumbnail_url */
          changed: !!m.pixso_guid && (!ex || ex.pixso_guid !== m.pixso_guid || (m.kind === "set" && !ex.instance_spec) || (!ex.thumbnail_url && m.pixso_thumb))
        }
      })
      /* 结果页库卡片展示元数据（库名/版本/组件数）改读订阅列表条目——真实明细响应顶层
         无 name/version/componentCount（仅 file_key/components 等），full 只作数据源 */
      W.matchLib = lib; W.stage = "result"; W.tab = "all"
      showResult()
    }).catch(function (e) { W.err = "匹配失败：" + e.message; W.stage = "select"; fillSelect() })
  }

  function confirmMatch() {
    var items = W.results.filter(function (r) { return r.changed && !r.kept && r.pixso_guid }).map(function (r) {
      var o = { component_name: r.component_name, pixso_name: r.pixso_name, pixso_guid: r.pixso_guid, pixso_category: r.pixso_category || "", file_key: r.fileKey, match_type: r.match_type, status: r.status, url: r.url || "" }
      if (r.spec) o.instance_spec = r.spec
      if (r.contentKey) o.component_content_key = r.contentKey
      if (r.thumbnail_url) o.thumbnail_url = r.thumbnail_url /* 缩略图原始相对值（暂存行即带，发布时随 PUT 提交） */
      return o
    })
    if (!items.length) { closeWiz(); return }
    /* 暂存：不 PUT——写 staged 层，工作态即时上屏（宿主发布按钮亮起），发布时统一提交 */
    items.forEach(function (o) {
      var prev = erows[o.component_name] || { component_name: o.component_name }
      staged.set(o.component_name, Object.assign({}, prev, o))
    })
    closeWiz()
    rebuildWork()
    applyView()
  }

  /* ═════ 编辑组件弹窗 ═════ */

  function openEdit(comp) {
    var row = erows[comp.name] || {}
    Ed = {
      comp: comp,
      zh: row.html_zh || "",
      en: comp.name,
      resolved: row.pixso_guid ? { guid: row.pixso_guid, name: row.pixso_name || "", category: row.pixso_category || "", thumb: row.thumbnail_url || "", fileKey: row.file_key || systemFileKey() || "" } : null,
      saving: false,
      err: ""
    }
    renderEdit()
  }
  function renderEdit() {
    root.innerHTML = '<div class="em-mask" data-em-edit-close><div class="em-dlg em-dlg-edit" onclick="event.stopPropagation()">' +
      '<div class="em-dlg-head"><span class="t">编辑组件</span><button class="em-dlg-x" data-em-edit-close>' + IC.x + "</button></div>" +
      '<div class="em-dlg-body"></div><div class="em-dlg-foot"></div></div></div>'
    root.querySelectorAll("[data-em-edit-close]").forEach(function (b) { b.addEventListener("click", closeEdit) })
    fillEditBody()
    fillEditFoot()
  }
  function closeEdit() { root.innerHTML = "" }
  /* ═════ 选择关联组件弹窗（从关联库的组件中单选一个） ═════ */

  function openPicker() {
    var fk = systemFileKey()
    if (!fk) { openWizard(); return }
    Pk = { q: "", groups: {}, selected: Ed.resolved ? Ed.resolved.guid : null, openCats: new Set(), openPages: new Set(), loading: true }
    root.innerHTML = '<div class="em-mask"><div class="em-dlg em-picker" onclick="event.stopPropagation()">' +
      '<div class="em-dlg-head">' +
      '<button class="em-picker-back" data-em-picker-back>' + IC.chevL + "</button>" +
      '<span class="t">选择关联组件</span>' +
      '<button class="em-dlg-x" data-em-picker-back>' + IC.x + "</button>" +
      "</div>" +
      '<div class="em-dlg-body em-dlg-body-flex">' +
      '<label class="em-wiz-search">' + IC.search + '<input placeholder="搜索全部组件" data-em-pq></label>' +
      '<div class="em-picker-list"><div class="em-wiz-empty" style="flex:1">组件加载中...</div></div>' +
      "</div>" +
      '<div class="em-dlg-foot"></div></div></div>'
    root.querySelectorAll("[data-em-picker-back]").forEach(function (b) { b.addEventListener("click", function () { renderEdit() }) })
    var selName = Ed.resolved ? Ed.resolved.name : "未选择"
    setFoot('<span class="em-picker-sel">已选：' + esc(selName) + '</span><span class="spacer"></span><button class="em-btn" data-em-picker-back>取消</button><button class="em-btn em-btn-primary" data-em-pick-ok' + (Pk.selected ? "" : " disabled") + '>确认</button>')
    dlgFoot().querySelector("[data-em-picker-back]").addEventListener("click", function () { renderEdit() })
    dlgFoot().querySelector("[data-em-pick-ok]").addEventListener("click", function () {
      if (!Pk.selected) return
      var sel = findPickerItem(Pk.selected)
      if (sel) { sel.fileKey = fk; Ed.resolved = sel }
      renderEdit()
    })
    var inp = dlgBody().querySelector("[data-em-pq]")
    if (inp) inp.addEventListener("input", function (e) { Pk.q = e.target.value; renderPickerContent() })
    fetchLibraryComponents(fk).then(function (lib) {
      if (!root.querySelector(".em-picker")) return
      var byGuid = new Map()
      for (var e of Object.values(lib.components || {})) {
        var cf = e.containing_frame || {}
        var sg = cf.containingStateGroup
        if (sg) {
          var info = byGuid.get(sg.nodeId)
          if (!info) { info = { guid: sg.nodeId, name: sg.name, category: cf.name || "", page: cf.pageName || "", thumb: "", vthumbs: [] }; byGuid.set(sg.nodeId, info) }
          var t = thumbVal(e)
          if (t) { info.vthumbs.push(t); info.thumb = pickSetThumb(info.vthumbs, info.guid) }
        } else if (e.node_id && !byGuid.has(e.node_id)) {
          byGuid.set(e.node_id, { guid: e.node_id, name: String(e.name || "").split("/")[0], category: cf.name || "", page: cf.pageName || "", thumb: thumbVal(e) })
        }
      }
      /* 两级归组：一层 containing_frame.pageName（值非占位页名 NewComponents 时才渲染该层）
       * → 二层 containing_frame.name（分类）→ 格子（containingStateGroup.name + 缩略图） */
      Pk.groups = {}
      for (var r of byGuid.values()) {
        if (r.name.indexOf(".") === 0 || r.name.indexOf("TUI-SVG") === 0 || r.name.indexOf("Text-to-UI Icon") === 0) continue
        var g = Pk.groups[r.page]
        if (!g) g = Pk.groups[r.page] = { page: r.page, cats: {} }
        var ck = r.category || "未分类"
        if (!g.cats[ck]) g.cats[ck] = []
        g.cats[ck].push(r)
      }
      /* 初始全折叠：页/分类/变体三级均收起，点击哪级展开哪级（搜索时强制展开）
       * 选中项回显靠底部「已选：xxx」，不自动展开定位 */
      Pk.loading = false
      renderPickerContent()
    }).catch(function (e) {
      if (!root.querySelector(".em-picker")) return
      var listEl = dlgBody().querySelector(".em-picker-list")
      if (listEl) listEl.innerHTML = '<div class="em-wiz-empty" style="flex:1">组件加载失败：' + esc(e.message || String(e)) + "</div>"
    })
  }

  function findPickerItem(guid) {
    for (var pk in Pk.groups) {
      var cats = Pk.groups[pk].cats
      for (var ck in cats) {
        for (var i = 0; i < cats[ck].length; i++) {
          if (cats[ck][i].guid === guid) return cats[ck][i]
        }
      }
    }
    return null
  }

  function renderPickerContent() {
    var listEl = dlgBody() ? dlgBody().querySelector(".em-picker-list") : null
    if (!listEl) return
    var q = Pk.q.trim().toLowerCase()
    var html = ""
    /* 页/分类均按名称排序（编号页面「1.操作类…」自然按序），不受数据插入顺序影响 */
    var pages = Object.keys(Pk.groups).sort()
    for (var pi = 0; pi < pages.length; pi++) {
      var pk = pages[pi]
      var g = Pk.groups[pk]
      /* 一层：containing_frame.pageName 组头（可折叠）——值为占位页名（NewComponents，
       * demo/新组件暂存页）或空时不显示该层，直接铺二层分类；真实页面名（如「1.操作类」）正常展示 */
      var showPage = g.page && g.page !== "NewComponents"
      var pageOpen = q ? true : Pk.openPages.has(pk)
      if (showPage) {
        var pageCount = 0
        var catKeys0 = Object.keys(g.cats)
        for (var pc = 0; pc < catKeys0.length; pc++) pageCount += g.cats[catKeys0[pc]].length
        html += '<div class="em-picker-page-node' + (pageOpen ? " open" : "") + '" data-page-toggle="' + esc(pk) + '">' +
          '<span class="em-tree-chev">' + IC.chev + "</span>" +
          '<span class="em-picker-page-name">' + esc(g.page) + "</span>" +
          '<span class="em-picker-page-count">' + pageCount + "个组件</span>" +
          "</div>"
      }
      if (pageOpen || !showPage) {
        var catKeys = Object.keys(g.cats).sort()
        for (var ci = 0; ci < catKeys.length; ci++) {
          var ck = catKeys[ci]
          var all = g.cats[ck]
        var filtered = q ? all.filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0 }) : all
        if (!filtered.length) continue
        var catKey = pk + "\u0001" + ck
        var open = q ? true : Pk.openCats.has(catKey)
        html += '<div class="em-picker-cat-node' + (open ? " open" : "") + (showPage ? " in-page" : "") + '" data-cat-toggle="' + esc(catKey) + '">' +
          '<span class="em-tree-chev">' + IC.chev + "</span>" +
            '<span class="em-picker-cat-name">' + esc(showPage ? g.page + " / " + ck : ck) + "</span>" +
          '<span class="em-picker-cat-count">' + filtered.length + "个组件</span>" +
          "</div>"
      if (open) {
        html += '<div class="em-picker-grid">'
        for (var i = 0; i < filtered.length; i++) {
          var it = filtered[i]
          var sel = Pk.selected === it.guid
          html += '<div class="em-picker-card' + (sel ? " sel" : "") + '" data-guid="' + esc(it.guid) + '">' +
            '<div class="em-picker-thumb">' +
            (it.thumb ? '<img src="' + esc(absThumb(it.thumb)) + '" loading="lazy">' : "") +
            '<span class="em-picker-check">' + (sel ? IC.check : "") + "</span>" +
            "</div>" +
            '<div class="em-picker-label">' + esc(it.name) + "</div>" +
            "</div>"
        }
        html += "</div>"
        }
        }
      }
    }
    if (!html) html = '<div class="em-wiz-empty" style="flex:1">' + (Pk.loading ? "组件加载中..." : q ? "没有匹配的组件" : "暂无组件") + "</div>"
    listEl.innerHTML = html
    listEl.onclick = function (e) {
      var pageNode = e.target.closest("[data-page-toggle]")
      if (pageNode) {
        var pg = pageNode.dataset.pageToggle
        if (Pk.openPages.has(pg)) Pk.openPages.delete(pg)
        else Pk.openPages.add(pg)
        renderPickerContent()
        return
      }
      var catNode = e.target.closest("[data-cat-toggle]")
      if (catNode) {
        var cn = catNode.dataset.catToggle
        if (Pk.openCats.has(cn)) Pk.openCats.delete(cn)
        else Pk.openCats.add(cn)
        renderPickerContent()
        return
      }
      var el = e.target.closest("[data-guid]")
      if (!el) return
      Pk.selected = el.dataset.guid
      renderPickerContent()
      var selItem = findPickerItem(Pk.selected)
      var selEl = dlgFoot().querySelector(".em-picker-sel")
      if (selEl) selEl.textContent = "已选：" + (selItem ? selItem.name : "未选择")
      var okBtn = dlgFoot().querySelector("[data-em-pick-ok]")
      if (okBtn) okBtn.disabled = !Pk.selected
    }
  }

  function fillEditBody() {
    var c = Ed.comp
    if (!c) return
    var zh = erows[c.name] ? erows[c.name].html_zh || "" : ""
    setBody('<div class="em-form">' +
      '<div class="em-form-row">' +
      '<label><span class="cap">中文名称</span><input value="' + esc(Ed.zh) + '" data-em-zh placeholder="组件中文名"></label>' +
      '<label><span class="cap">英文名称</span><input value="' + esc(Ed.en) + '" data-em-en placeholder="组件英文名"></label>' +
      "</div>" +
      '<div class="em-pick-sec"><span class="cap">选择设计组件</span>' +
      '<button type="button" class="em-pick-btn" data-em-pick>' + IC.link + "选择关联组件</button>" +
      "</div></div>" +
      '<div class="em-ro">' +
      '<div class="em-ro-col"><div class="em-ro-head"><span class="em-ro-cap">原型组件</span></div><div class="em-ro-name">' + esc(c.name) + (zh ? '<span class="zh">' + esc(zh) + "</span>" : "") + '</div><div class="em-ro-divider"></div><div class="em-ro-content">' + (c.html ? '<iframe src="' + esc(res(c.html)) + '" class="em-ro-frame" loading="lazy"></iframe>' : "") + "</div></div>" +
      '<div class="em-ro-col em-ro-right"></div></div>')
    dlgBody().querySelector("[data-em-zh]").addEventListener("input", function (e) { Ed.zh = e.target.value })
    dlgBody().querySelector("[data-em-en]").addEventListener("input", function (e) { Ed.en = e.target.value })
    dlgBody().querySelector("[data-em-pick]").addEventListener("click", function () { openPicker() })
    fillEditRoRight()
  }

  function fillEditRoRight() {
    var col = dlgBody() ? dlgBody().querySelector(".em-ro-right") : null
    if (!col) return
    var resolved = Ed.resolved
    if (resolved) {
      var thumb = resolved.thumb ? absThumb(resolved.thumb) : ""
      col.innerHTML =
        '<div class="em-ro-head"><span class="em-ro-cap">设计组件</span></div>' +
        '<div class="em-ro-name">' + esc(resolved.name) + "</div>" +
        '<div class="em-ro-divider"></div>' +
        '<div class="em-ro-content">' +
        (thumb ? '<img src="' + esc(thumb) + '" style="max-width:100%;max-height:100%;object-fit:contain;" onerror="this.style.display=\'none\'">' : "") +
        "</div>"
    } else {
      col.innerHTML =
        '<div class="em-ro-head"><span class="em-ro-cap">设计组件</span></div>' +
        '<div class="em-ro-name" style="color:var(--text-3);font-weight:400">未关联</div>' +
        '<div class="em-ro-divider"></div>' +
        '<div class="em-ro-content"><div class="em-ro-empty">未关联设计组件</div></div>'
    }
  }

  function fillEditFoot() {
    var err = Ed.err ? '<span class="em-dlg-err">' + esc(Ed.err) + "</span>" : ""
    setFoot(err + '<span class="spacer"></span><button class="em-btn" data-em-edit-close>取消</button><button class="em-btn em-btn-primary" data-em-edit-confirm>确认</button>')
    dlgFoot().querySelector("[data-em-edit-close]").addEventListener("click", closeEdit)
    dlgFoot().querySelector("[data-em-edit-confirm]").addEventListener("click", function () { confirmEdit() })
  }

  function confirmEdit() {
    var c = Ed.comp
    if (!c) return
    var item = { component_name: c.name, html_zh: Ed.zh.trim(), match_type: "manual" }
    if (Ed.resolved) {
      item.pixso_guid = Ed.resolved.guid
      item.pixso_name = Ed.resolved.name
      if (Ed.resolved.category) item.pixso_category = Ed.resolved.category
      if (Ed.resolved.fileKey) item.file_key = Ed.resolved.fileKey
      item.status = "aligned"
      item.url = PIXSO_URL_BASE + "/design/" + (Ed.resolved.fileKey || systemFileKey() || "") + "?item-id=" + Ed.resolved.guid
      if (Ed.resolved.thumb) item.thumbnail_url = Ed.resolved.thumb
    }
    /* 缩略图随选中组件拷贝（guidIndex 已按 pickSetThumb 规则选好；空值覆盖旧值防串图） */
    if (Ed.resolved) item.thumbnail_url = Ed.resolved.thumb || ""
    /* 暂存：不 PUT——写 staged 层（manual 通道），工作态即时上屏，发布时统一提交 */
    var prev = erows[c.name] || { component_name: c.name }
    staged.set(c.name, Object.assign({}, prev, item))
    closeEdit()
    rebuildWork()
    applyView()
  }

  /* ═══ 发布 / 放弃（宿主顶部按钮经 postMessage 触发） ═══ */

  async function publish() {
    if (P.busy) return
    if (!staged.size) { postParent({ type: "ds-publish-result", ok: true, stats: {}, dropped: [] }); return }
    P.busy = true
    postParent({ type: "ds-publishing" })
    var dropped = []
    try {
      await loadBase() /* 发布预检：按最新表过滤暂存行，防单行缺失导致整批 400 */
      var items = [], r = null, retried = false
      for (;;) {
        items = []; dropped = []
        staged.forEach(function (row, name) {
          if (!base[name]) { dropped.push(name); return }
          var o = { component_name: name }
          PUT_FIELDS.forEach(function (f) { if (row[f] !== undefined && row[f] !== null) o[f] = row[f] })
          items.push(o)
        })
        if (items.length) {
          r = await fetch(API + slug + "/mapping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items }) })
          if (r.status !== 400 || retried) break
        }
        if (retried) break
        /* 表无行（PUT 400 或预检 items 为空——老系统未 sync；暂存模型下 sync 已推迟至此）
         * → sync 重建表 → 刷新 base → 重建 items 重试一次；sync 后仍缺失的行进 dropped */
        retried = true
        try { await fetch(API + slug + "/mapping/sync", { method: "POST" }) } catch (e) { }
        await loadBase()
      }
      if (!r) throw new Error("暂存的 " + dropped.length + " 个组件均不在映射表中（组件包未上传或清单已变化），可点「放弃修改」清除")
      if (!r.ok) {
        var b = null; try { b = await r.json() } catch (e) { }
        throw new Error("HTTP " + r.status + (b && b.detail ? "：" + b.detail : ""))
      }
      var stats = {}; try { stats = await r.json() } catch (e) { }
      items.forEach(function (o) { staged.delete(o.component_name) }) /* 已提交行出暂存；dropped 行保留待用户处置 */
      await loadBase()
      rebuildWork()
      applyView()
      postParent({ type: "ds-publish-result", ok: true, stats: stats, dropped: dropped })
    } catch (e) {
      postParent({ type: "ds-publish-result", ok: false, error: e && e.message ? e.message : String(e), dropped: dropped })
    } finally {
      P.busy = false
    }
  }

  function discard() {
    if (P.busy) return
    staged.clear()
    rebuildWork()
    applyView()
    postParent({ type: "ds-discard-done" })
  }

  /* 宿主 → iframe：ds-publish 触发发布 / ds-discard 触发放弃 */
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return
    var d = e.data
    if (!d) return
    if (d.type === "ds-publish") void publish()
    else if (d.type === "ds-discard") discard()
  })

  /* boot：暂存为纯内存态（刷新即清空，仅发布落库持久化）——顺手清理旧版遗留的
   * sessionStorage 暂存键（ds-map-staged:*），避免残留缓存难清；然后报告宿主干净态 */
  try {
    var legacy = []
    for (var i = 0; i < sessionStorage.length; i++) {
      var k = sessionStorage.key(i)
      if (k && k.indexOf("ds-map-staged:") === 0) legacy.push(k)
    }
    legacy.forEach(function (k) { sessionStorage.removeItem(k) })
  } catch (e) { }
  notifyDirty()
}
