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
 * 拼接处：runMatch（向导匹配）与 fillEditDD（下拉选组件）两处 */
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
  warn: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.9l5.3 9.2H1.7L7 1.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 5.7v2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7" cy="10.2" r="0.75" fill="currentColor"/></svg>',
  chev: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.6l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
}

export async function editSetup(ctx) {
  const { slug, components, redraw, main, esc, apiBase } = ctx
  var API = (apiBase || "") + "/api/design-systems/"
  const applyErows = ctx.applyErows
  const res = ctx.res

  let MC
  try { MC = await import("./match-core.js") } catch (e) { console.warn("[edit] match-core:", e); return }
  const { buildCandidates, matchAll, buildInstanceSpec, parsePixsoUrl, pickSetThumb, thumbVal } = MC

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

  /* 订阅库列表缓存（fileKey → 库名映射用，下拉顶部显示"当前组件库"） */
  var libListP = fetchSubscribedLibraries().then(function (s) { return s.libraries || [] }).catch(function () { return [] })

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
        const list = snap.libraries || []
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

  let W = { stage: "select", libs: [], dom: "", libId: "", q: "", results: [], matchLib: null, tab: "all", saving: false, err: "" }
  let Ed = { comp: null, zh: "", en: "", url: "", parsed: { fileKey: null, guid: null }, resolved: null, ddOpen: false, ddItems: [], scopeFk: null, scopeName: "", saving: false, err: "" }

  const root = document.createElement("div")
  document.body.appendChild(root)

  function dlgBody() { return root.querySelector(".em-dlg-body") }
  function dlgFoot() { return root.querySelector(".em-dlg-foot") }
  function setBody(html) { const b = dlgBody(); if (b) b.innerHTML = html }
  function setFoot(html) { const f = dlgFoot(); if (f) f.innerHTML = html }

  main.addEventListener("click", e => {
    if (e.target.closest("[data-em-wizard]")) { void openWizard(); return }
    const eb = e.target.closest("[data-em-edit]")
    if (eb) { const name = eb.dataset.emEdit; const comp = components.find(x => x.name === name); if (comp) openEdit(comp); return }
  })

  /* ═════ 向导 ═════ */

  function libItemHtml(l) {
    var sel = W.libId === l.id
    var cls = sel ? "em-lib sel" : "em-lib"
    var chk = sel ? '<span class="em-check">' + IC.check + "</span>" : ""
    return '<button class="' + cls + '" data-em-lib="' + esc(l.id) + '">' +
      '<span class="em-lib-ic">' + esc((l.name || "?").slice(0, 1)) + "</span>" +
      '<span class="em-lib-txt"><span class="em-lib-name">' + esc(l.name) + "</span>" +
      '<span class="em-lib-meta">版本 ' + esc(l.version || "—") + " · " + (l.componentCount ?? "?") + "个组件</span></span>" + chk + "</button>"
  }

  function resultRowHtml(r) {
    var zh = erows[r.component_name] && erows[r.component_name].html_zh
    var zhSpan = zh ? '<span class="zh">' + esc(zh) + "</span>" : ""
    var pixso = r.pixso_name ? '<span class="em-rt-pname">' + esc(r.pixso_name) + "</span>" : '<span class="em-rt-none">—</span>'
    var kept = r.kept ? '<span style="margin-left:6px;font-size:11px;color:var(--text-3);background:var(--fill-1);border-radius:4px;padding:1px 6px;">已保留</span>' : ""
    var st = r.pixso_guid ? '<span class="em-st ok">' + IC.check + "成功</span>" + kept : '<span class="em-st miss">' + IC.warn + "未匹配</span>"
    return '<div class="em-rt-tr em-row"><div class="em-rt-name">' + esc(r.component_name) + zhSpan + "</div><div>" + pixso + "</div><div>" + st + "</div></div>"
  }

  function openWizard() {
    W = { stage: "select", libs: W.libs, dom: W.libs[0] ? W.libs[0].domain : "", libId: "", q: "", results: [], matchLib: null, tab: "all", saving: false, err: "" }
    root.innerHTML = '<div class="em-mask" data-em-wiz-close><div class="em-dlg" onclick="event.stopPropagation()">' +
      '<div class="em-dlg-head"><span class="t">关联设计组件</span><button class="em-dlg-x" data-em-wiz-close>' + IC.x + "</button></div>" +
      '<div class="em-dlg-body em-dlg-body-flex"></div>' +
      '<div class="em-dlg-foot"></div></div></div>'
    root.querySelectorAll("[data-em-wiz-close]").forEach(function (b) { b.addEventListener("click", closeWiz) })
    fillSelect()
    if (!W.libs.length) {
      fetchSubscribedLibraries()
        .then(function (d) { W.libs = d.libraries || []; W.dom = W.libs[0] ? W.libs[0].domain : ""; fillSelectBody() })
        .catch(function (e) { W.err = "组件库列表加载失败：" + e.message; fillSelectBody() })
    }
  }
  function closeWiz() { root.innerHTML = "" }

  function fillSelect() { fillSelectBody(); fillSelectFoot() }

  function fillSelectFoot() {
    setFoot('<span class="spacer"></span><button class="em-btn" data-em-wiz-close>取消</button><button class="em-btn em-btn-primary" data-em-start>开始匹配</button>')
    var startBtn = dlgFoot() ? dlgFoot().querySelector("[data-em-start]") : null
    if (startBtn) startBtn.disabled = !W.libId
    dlgFoot().querySelectorAll("[data-em-wiz-close]").forEach(function (b) { b.addEventListener("click", closeWiz) })
    if (startBtn) startBtn.addEventListener("click", function () { runMatch() })
  }

  function fillSelectBody() {
    var domains = []
    var seen = {}
    for (var i = 0; i < W.libs.length; i++) {
      var d = W.libs[i].domain || "其他"
      if (!seen[d]) { seen[d] = 1; domains.push(d) }
    }
    var domHtml = domains.map(function (d) {
      var on = (W.dom || domains[0]) === d
      return '<button class="em-dom-item' + (on ? " on" : "") + '" data-em-dom="' + esc(d) + '">' + esc(d) + "</button>"
    }).join("")
    setBody('<label class="em-wiz-search">' + IC.search + '<input placeholder="搜索全部组件库" value="' + esc(W.q) + '" data-em-wq></label>' +
      (W.libs.length
        ? '<div class="em-wiz-cols"><div class="em-dom-list">' + domHtml + '</div><div class="em-lib-list"></div></div>'
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
    var listEl = dlgBody() ? dlgBody().querySelector(".em-lib-list") : null
    if (!listEl) return
    var q = W.q.trim().toLowerCase()
    var rightLibs = q
      ? W.libs.filter(function (l) { return (l.name + " " + (l.domain || "")).toLowerCase().indexOf(q) >= 0 })
      : W.libs.filter(function (l) { return (l.domain || "其他") === (W.dom || "") })
    var count = '<div class="em-lib-count">' + rightLibs.length + "个组件库</div>"
    var items = rightLibs.length
      ? rightLibs.map(libItemHtml).join("")
      : '<div class="em-wiz-empty">没有匹配搜索的组件库</div>'
    listEl.innerHTML = count + items
    listEl.querySelectorAll("[data-em-lib]").forEach(function (b) {
      b.addEventListener("click", function () {
        W.libId = b.dataset.emLib
        listEl.querySelectorAll(".em-lib").forEach(function (el) {
          var isSel = el.dataset.emLib === W.libId
          el.classList.toggle("sel", isSel)
          var chk = el.querySelector(".em-check")
          if (isSel && !chk) {
            var s = document.createElement("span")
            s.className = "em-check"
            s.innerHTML = IC.check
            el.appendChild(s)
          } else if (!isSel && chk) chk.remove()
        })
        var start = dlgFoot() ? dlgFoot().querySelector("[data-em-start]") : null
        if (start) start.disabled = !W.libId
      })
    })
  }

  function showMatching() {
    var libName = ""
    for (var i = 0; i < W.libs.length; i++) if (W.libs[i].id === W.libId) libName = W.libs[i].name
    setBody('<div class="em-matching"><div class="em-spinner"></div><div class="t">正在匹配设计组件</div><div class="s">核对本地组件 ID 与样别名，保留已有链接</div></div>')
    setFoot('<span style="font-size:13px;color:var(--text-3);margin-right:auto;">已选：' + esc(libName) + '</span><button class="em-btn" data-em-wiz-close>取消</button>')
    dlgFoot().querySelector("[data-em-wiz-close]").addEventListener("click", closeWiz)
  }

  function showResult() {
    var matched = W.results.filter(function (r) { return r.pixso_guid }).length
    var libCard = ""
    if (W.matchLib) {
      libCard = '<div class="em-sel-lib"><span class="em-lib-ic">' + esc((W.matchLib.name || "?").slice(0, 1)) + "</span>" +
        "<span><span class=\"em-sel-lib-name\">" + esc(W.matchLib.name) + "</span>" +
        '<span class="em-sel-lib-meta">版本 ' + esc(W.matchLib.version || "—") + " · " + (W.matchLib.componentCount ?? "?") + '个组件</span></span>' +
        '<span class="em-check">' + IC.check + "</span></div>"
    }
    var tabs = '<div class="em-tabs">' +
      '<button class="' + (W.tab === "all" ? "on" : "") + '" data-em-tab="all">全部（' + W.results.length + "）</button>" +
      '<button class="' + (W.tab === "matched" ? "on" : "") + '" data-em-tab="matched">已匹配（' + matched + "）</button>" +
      '<button class="' + (W.tab === "missing" ? "on" : "") + '" data-em-tab="missing">未匹配（' + (W.results.length - matched) + "）</button></div>"
    setBody(libCard + tabs + '<div class="em-rt"></div>')
    var errSpan = W.err ? '<span class="em-dlg-err">' + esc(W.err) + "</span>" : '<span style="font-size:13px;color:var(--text-3);margin-right:auto;">已选：' + esc(W.matchLib ? W.matchLib.name : "") + "</span>"
    setFoot(errSpan + '<span class="spacer"></span><button class="em-btn" data-em-wiz-close>取消</button><button class="em-btn em-btn-primary" data-em-confirm>确定</button>')
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
    rt.innerHTML = '<div class="em-rt-tr em-th"><div>原型组件</div><div>关联的设计组件</div><div>匹配状态</div></div>' +
      items.map(resultRowHtml).join("")
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
    Ed = { comp: comp, zh: erows[comp.name] ? erows[comp.name].html_zh || "" : "", en: comp.name, url: erows[comp.name] ? erows[comp.name].url || "" : "", parsed: { fileKey: null, guid: null }, resolved: null, ddOpen: false, ddItems: [], scopeFk: null, scopeName: "", saving: false, err: "" }
    onUrlInput(Ed.url)
    /* 下拉范围（系统组件共用一个 file_key）：行 URL 解析值 → 行自身 file_key → 本次会话
     * 向导选中的库（W.matchLib，内存态）→ base 众数（系统级共用值）→ null 全库兜底
     *（从未关联过的新系统）。openEdit 时一次算定：之后清空/粘贴 URL 不再改变下拉范围
     *（粘贴是显式人工动作，本次不拦）。 */
    var row = erows[comp.name] || {}
    Ed.scopeFk = Ed.parsed.fileKey || row.file_key || (W.matchLib && W.matchLib.fileKey) || systemFileKey() || null
    root.innerHTML = '<div class="em-mask" data-em-edit-close><div class="em-dlg em-dlg-edit" onclick="event.stopPropagation()">' +
      '<div class="em-dlg-head"><span class="t">编辑组件</span><button class="em-dlg-x" data-em-edit-close>' + IC.x + "</button></div>" +
      '<div class="em-dlg-body"></div><div class="em-dlg-foot"></div></div></div>'
    root.querySelectorAll("[data-em-edit-close]").forEach(function (b) { b.addEventListener("click", closeEdit) })
    fillEditBody()
    fillEditFoot()
  }
  function closeEdit() { root.innerHTML = "" }
  function onUrlInput(v) {
    Ed.url = v
    Ed.parsed = parsePixsoUrl(v)
    Ed.resolved = null
    var g = Ed.parsed.guid
    if (!g) { fillEditParse(); fillEditRoRight(); return }
    guidIndex(Ed.parsed.fileKey).then(function (idx) {
      if (parsePixsoUrl(Ed.url).guid === g) Ed.resolved = idx.get(g) || null
      if (root.querySelector(".em-dlg-edit")) { fillEditParse(); fillEditRoRight() }
    })
  }

  function toggleDD() {
    if (Ed.ddOpen) { Ed.ddOpen = false; fillEditDD(); return }
    Ed.ddOpen = true
    /* 下拉限定在 Ed.scopeFk（openEdit 算定的系统共用 file_key）——选中项同库，
       切换组件不再漂移 file_key；scope 为 null（从未关联过的新系统）才回退全部订阅库 */
    Promise.all([guidIndex(Ed.scopeFk), libListP]).then(function (arr) {
      var idx = arr[0], libs = arr[1] || []
      var seen = new Set(), out = []
      for (var r of idx.values()) {
        if (r.name.indexOf(".") === 0 || r.name.indexOf("TUI-SVG") === 0 || r.name.indexOf("Text-to-UI Icon") === 0) continue
        if (!seen.has(r.guid)) { seen.add(r.guid); out.push(r) }
      }
      out.sort(function (a, b) { return a.name.localeCompare(b.name) })
      Ed.ddItems = out
      /* 下拉顶部"当前组件库"标识：scope 有值 → 订阅列表里查库名（查不到显示 fileKey 本身） */
      Ed.scopeName = Ed.scopeFk
        ? ((libs.find(function (l) { return l.fileKey === Ed.scopeFk }) || {}).name || Ed.scopeFk)
        : ""
      fillEditDD()
    })
  }

  function fillEditBody() {
    var c = Ed.comp
    if (!c) return
    var zh = erows[c.name] ? erows[c.name].html_zh || "" : ""
    var frameHtml = c.html ? '<iframe src="' + esc(res(c.html)) + '" style="margin-top:10px;width:100%;height:120px;border:1px solid var(--border-1);border-radius:6px;background:#fff;" loading="lazy"></iframe>' : ""
    setBody('<div class="em-form">' +
      '<div class="em-form-row">' +
      '<label><span class="cap">中文名称</span><input value="' + esc(Ed.zh) + '" data-em-zh placeholder="组件中文名"></label>' +
      '<label><span class="cap">英文名称</span><input value="' + esc(Ed.en) + '" data-em-en placeholder="组件英文名"></label>' +
      "</div>" +
      '<div class="em-form-row em-form-row-link">' +
      '<label><span class="cap">设计组件链接</span><input value="' + esc(Ed.url) + '" data-em-url placeholder="粘贴 Pixso 组件链接"></label>' +
      '<div style="position:relative;"><button data-em-dd style="height:28px;margin-top:30px;border:0;background:transparent;color:var(--brand);font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:2px;padding:0;white-space:nowrap;">关联组件 ' + IC.chev + '</button><div class="em-dd-slot"></div></div>' +
      "</div></div>" +
      '<div class="em-parse-slot"></div>' +
      '<div class="em-ro">' +
      '<div class="em-ro-col"><div class="em-ro-cap"><span>原型组件</span></div><div class="em-ro-name">' + esc(c.name) + (zh ? '<span class="zh">' + esc(zh) + "</span>" : "") + "</div>" + frameHtml + "</div>" +
      '<div class="em-ro-col em-ro-right"></div></div>')
    dlgBody().querySelector("[data-em-zh]").addEventListener("input", function (e) { Ed.zh = e.target.value })
    dlgBody().querySelector("[data-em-en]").addEventListener("input", function (e) { Ed.en = e.target.value })
    dlgBody().querySelector("[data-em-url]").addEventListener("input", function (e) { onUrlInput(e.target.value) })
    dlgBody().querySelector("[data-em-dd]").addEventListener("click", function () { toggleDD() })
    fillEditParse()
    fillEditRoRight()
  }

  function fillEditParse() {
    var slot = dlgBody() ? dlgBody().querySelector(".em-parse-slot") : null
    if (!slot) return
    if (!Ed.parsed.guid) { slot.innerHTML = ""; return }
    var g = Ed.resolved ? Ed.resolved.guid : Ed.parsed.guid
    var n = Ed.resolved ? Ed.resolved.name : ""
    slot.innerHTML = '<div class="em-parse">已识别：fileKey ' + esc(Ed.parsed.fileKey || "（未识别）") + " · 组件锚点 " + esc(g) + (n ? " · " + esc(n) : "") + "</div>"
  }

  function fillEditRoRight() {
    var col = dlgBody() ? dlgBody().querySelector(".em-ro-right") : null
    if (!col) return
    var row = Ed.comp ? erows[Ed.comp.name] : null
    var name = Ed.resolved ? Ed.resolved.name : row ? row.pixso_name : null
    /* 缩略图：选中组件（resolved，guidIndex 已按 pickSetThumb 选好）优先，回落工作态行的 thumbnail_url；
       渲染经 absThumb 拼 origin+/api 前缀（图片服务的相对路径），加载失败仅隐藏无回落图 */
    var thumb = Ed.resolved ? Ed.resolved.thumb : row ? row.thumbnail_url : null
    var tag = name ? '<span class="em-tag-ok">已关联</span>' : ""
    var nameHtml = name ? esc(name) : '<span class="em-ro-empty">未关联——粘贴设计组件链接后自动识别</span>'
    var img = thumb ? '<img src="' + esc(absThumb(thumb)) + '" style="margin-top:10px;width:100%;height:68px;object-fit:contain;border-radius:4px;display:block;" onerror="this.style.display=\'none\'">' : ""
    col.innerHTML = '<div class="em-ro-cap"><span>设计组件</span>' + tag + '</div><div class="em-ro-name">' + nameHtml + "</div>" + img
  }

  function fillEditDD() {
    var slot = dlgBody() ? dlgBody().querySelector(".em-dd-slot") : null
    if (!slot) return
    if (!Ed.ddOpen) { slot.innerHTML = ""; return }
    /* 下拉小图：thumbnail_url 经 absThumb 拼 origin+/api 前缀（与卡片大图同链路） */
    var items = Ed.ddItems.map(function (r) {
      var imgHtml = r.thumb ? '<img src="' + esc(absThumb(r.thumb)) + '" style="width:36px;height:20px;object-fit:contain;border-radius:3px;flex-shrink:0;background:var(--fill-3);">' : '<span style="width:36px;height:20px;background:var(--fill-3);border-radius:3px;flex-shrink:0;"></span>'
      return '<button data-em-dd-pick="' + esc(r.guid) + '" data-em-dd-fk="' + esc(r.fileKey || "") + '" style="width:100%;display:flex;align-items:center;gap:8px;border:0;background:transparent;border-radius:6px;padding:7px 8px;cursor:pointer;text-align:left;font-size:13px;color:var(--text-1);">' + imgHtml + "<span>" + esc(r.name) + "</span></button>"
    }).join("")
    var inner = Ed.ddItems.length ? items : '<div style="padding:14px;text-align:center;color:var(--text-3);font-size:12px;">没有可关联的组件</div>'
    /* 顶部标识当前限定的组件库（scope 为 null 的全新系统显示"全部订阅库"） */
    var cap = '<div style="padding:6px 8px 4px;font-size:11px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">当前组件库：' + esc(Ed.scopeName || "全部订阅库") + "</div>"
    slot.innerHTML = '<div style="position:absolute;top:34px;right:0;width:300px;max-height:264px;overflow:auto;background:#fff;border:1px solid var(--border-1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:20;padding:6px;">' + cap + inner + "</div>"
    slot.querySelectorAll("[data-em-dd-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var guid = b.dataset.emDdPick
        var fk = b.dataset.emDdFk
        for (var i = 0; i < Ed.ddItems.length; i++) {
          var r = Ed.ddItems[i]
          if (r.guid === guid && r.fileKey === fk) {
            Ed.ddOpen = false
            /* Pixso 跳转链接拼接处（模板见文件头 PIXSO_URL_BASE 注释）：下拉选中组件的 fileKey + guid */
            var url = PIXSO_URL_BASE + "/design/" + (r.fileKey || fk) + "?item-id=" + r.guid
            var input = dlgBody().querySelector("[data-em-url]")
            if (input) input.value = url
            onUrlInput(url)
            fillEditDD()
            break
          }
        }
      })
    })
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
    if (Ed.url.trim()) {
      item.url = Ed.url.trim()
      if (Ed.parsed.guid) {
        item.pixso_guid = Ed.resolved ? Ed.resolved.guid : Ed.parsed.guid
        if (Ed.resolved && Ed.resolved.name) item.pixso_name = Ed.resolved.name
        if (Ed.resolved && Ed.resolved.category) item.pixso_category = Ed.resolved.category
        if (Ed.parsed.fileKey) item.file_key = Ed.parsed.fileKey
        item.status = "aligned"
      }
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
