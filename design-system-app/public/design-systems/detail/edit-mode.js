/* 组件↔Pixso 映射编辑模式（template.html EDIT=true 时动态加载）
 * 渲染策略：弹窗骨架一次创建，交互用局部 DOM 更新（class toggle / 局部 HTML），避免闪烁。
 * 模板字面量嵌套 ≤ 2 层，复杂 HTML 用辅助函数构建。
 */

const PIXSO_API_BASE = "http://localhost:3090"
const PIXSO_URL_BASE = "http://localhost:3667"

const IC = {
  search: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.4" stroke="currentColor" stroke-width="1.3"/><path d="M9.4 9.4L12.5 12.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.6 7.4l2.8 2.8 6-6.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1.9l5.3 9.2H1.7L7 1.9z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M7 5.7v2.6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7" cy="10.2" r="0.75" fill="currentColor"/></svg>',
  chev: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.6l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.6 3.6l6.8 6.8M10.4 3.6l-6.8 6.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
}

export async function editSetup(ctx) {
  const { slug, components, redraw, main, esc } = ctx
  let erows = ctx.erows
  const res = ctx.res

  let MC
  try { MC = await import("./match-core.js") } catch (e) { console.warn("[edit] match-core:", e); return }
  const { buildCandidates, matchAll, buildInstanceSpec, parsePixsoUrl, pixsoThumb } = MC

  /* ── guidIndex ── */
  const libIdx = new Map()
  async function guidIndex(fk) {
    const k = fk || "*"
    if (!libIdx.has(k)) libIdx.set(k, (async () => {
      const m = new Map()
      try {
        const lr = await fetch(PIXSO_API_BASE + "/pixso/libraries")
        if (!lr.ok) return m
        const list = (await lr.json()).libraries || []
        for (const l of (fk ? list.filter(x => x.fileKey === fk) : list)) {
          try {
            const r = await fetch(PIXSO_API_BASE + "/pixso/libraries/" + l.id)
            if (!r.ok) continue
            const lib = await r.json()
            for (const e of Object.values(lib.components || {})) {
              const cf = e.containing_frame || {}
              const sg = cf.containingStateGroup
              if (e.isVariant && sg) {
                const info = { guid: sg.nodeId, name: sg.name, category: cf.name || "", thumb: e.thumbnail_url || "", fileKey: lib.fileKey || "" }
                if (e.node_id) m.set(e.node_id, info)
                if (!m.has(sg.nodeId)) m.set(sg.nodeId, info)
              } else if (!e.isVariant && e.node_id) {
                m.set(e.node_id, { guid: e.node_id, name: String(e.name || "").split("/")[0], category: cf.name || "", thumb: e.thumbnail_url || "", fileKey: lib.fileKey || "" })
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
  let Ed = { comp: null, zh: "", en: "", url: "", parsed: { fileKey: null, guid: null }, resolved: null, ddOpen: false, ddItems: [], saving: false, err: "" }

  const root = document.createElement("div")
  document.body.appendChild(root)

  function dlgBody() { return root.querySelector(".em-dlg-body") }
  function dlgFoot() { return root.querySelector(".em-dlg-foot") }
  function setBody(html) { const b = dlgBody(); if (b) b.innerHTML = html }
  function setFoot(html) { const f = dlgFoot(); if (f) f.innerHTML = html }

  async function reloadEROWS() {
    try {
      const r = await fetch("/api/design-systems/" + slug + "/mapping")
      if (r.ok) { const d = await r.json(); erows = Object.fromEntries((d.items || []).map(x => [x.component_name, x])) }
    } catch (e) { }
  }
  async function refresh() { await reloadEROWS(); redraw() }

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
      fetch(PIXSO_API_BASE + "/pixso/libraries")
        .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)) })
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
    Promise.all([
      fetch(PIXSO_API_BASE + "/pixso/libraries/" + lib.id).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status)) }),
      new Promise(function (r) { setTimeout(r, 1200) }),
      (async function () { try { await fetch("/api/design-systems/" + slug + "/mapping/sync", { method: "POST" }); await reloadEROWS() } catch (e) { } })(),
    ]).then(function (arr) {
      var full = arr[0]
      var candidates = buildCandidates(full.components)
      var ms = matchAll(components.map(function (x) { return x.name }), candidates)
      W.results = ms.map(function (m) {
        var ex = erows[m.component_name]
        if (ex && ex.pixso_guid && (ex.match_type === "manual" || !m.pixso_guid)) {
          return { component_name: m.component_name, pixso_name: ex.pixso_name, pixso_guid: ex.pixso_guid, pixso_category: ex.pixso_category || "", match_type: ex.match_type, status: ex.status || "aligned", url: ex.url || "", fileKey: ex.file_key || "", spec: null, contentKey: null, kept: true, changed: false }
        }
        var set = m.kind === "set" && m.pixso_name ? candidates.sets.get(m.pixso_name) : null
        return { component_name: m.component_name, pixso_name: m.pixso_name, pixso_guid: m.pixso_guid, pixso_category: m.pixso_category, match_type: m.match_type, status: m.status, url: m.pixso_guid && full.fileKey ? PIXSO_URL_BASE + "/design/" + full.fileKey + "?item-id=" + m.pixso_guid : "", fileKey: full.fileKey || "", spec: set ? buildInstanceSpec(set.variants) : null, contentKey: set ? set.contentKey : null, kept: false, changed: !!m.pixso_guid && (ex && ex.pixso_guid !== m.pixso_guid || (m.kind === "set" && !(ex && ex.instance_spec))) }
      })
      W.matchLib = full; W.stage = "result"; W.tab = "all"
      showResult()
    }).catch(function (e) { W.err = "匹配失败：" + e.message; W.stage = "select"; fillSelect() })
  }

  function confirmMatch() {
    var items = W.results.filter(function (r) { return r.changed && !r.kept && r.pixso_guid }).map(function (r) {
      var o = { component_name: r.component_name, pixso_name: r.pixso_name, pixso_guid: r.pixso_guid, pixso_category: r.pixso_category || "", file_key: r.fileKey, match_type: r.match_type, status: r.status, url: r.url || "" }
      if (r.spec) o.instance_spec = r.spec
      if (r.contentKey) o.component_content_key = r.contentKey
      return o
    })
    if (!items.length) { closeWiz(); return }
    W.saving = true; W.err = ""
    setFoot('<span class="spacer"></span><button class="em-btn" disabled>取消</button><button class="em-btn em-btn-primary" disabled>保存中...</button>')
    fetch("/api/design-systems/" + slug + "/mapping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items }) })
      .then(function (res) {
        if (!res.ok) return res.json().catch(function () { return null }).then(function (b) { throw new Error("HTTP " + res.status + (b && b.detail ? "：" + b.detail : "")) })
        closeWiz(); return refresh()
      })
      .catch(function (e) {
        W.err = "保存失败：" + e.message; W.saving = false
        setFoot('<span class="em-dlg-err">' + esc(W.err) + '</span><span class="spacer"></span><button class="em-btn" data-em-wiz-close>取消</button><button class="em-btn em-btn-primary" data-em-confirm>确定</button>')
        dlgFoot().querySelector("[data-em-wiz-close]").addEventListener("click", closeWiz)
        dlgFoot().querySelector("[data-em-confirm]").addEventListener("click", function () { confirmMatch() })
      })
  }

  /* ═════ 编辑组件弹窗 ═════ */

  function openEdit(comp) {
    Ed = { comp: comp, zh: erows[comp.name] ? erows[comp.name].html_zh || "" : "", en: comp.name, url: erows[comp.name] ? erows[comp.name].url || "" : "", parsed: { fileKey: null, guid: null }, resolved: null, ddOpen: false, ddItems: [], saving: false, err: "" }
    onUrlInput(Ed.url)
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
    guidIndex(Ed.parsed.fileKey).then(function (idx) {
      var seen = new Set(), out = []
      for (var r of idx.values()) {
        if (r.name.indexOf(".") === 0 || r.name.indexOf("TUI-SVG") === 0 || r.name.indexOf("Text-to-UI Icon") === 0) continue
        if (!seen.has(r.guid)) { seen.add(r.guid); out.push(r) }
      }
      out.sort(function (a, b) { return a.name.localeCompare(b.name) })
      Ed.ddItems = out
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
    var name = Ed.resolved ? Ed.resolved.name : erows[Ed.comp ? Ed.comp.name : ""] ? erows[Ed.comp.name].pixso_name : null
    var guid = Ed.resolved ? Ed.resolved.guid : erows[Ed.comp ? Ed.comp.name : ""] ? erows[Ed.comp.name].pixso_guid : null
    var tag = name ? '<span class="em-tag-ok">已关联</span>' : ""
    var nameHtml = name ? esc(name) : '<span class="em-ro-empty">未关联——粘贴设计组件链接后自动识别</span>'
    var img = guid ? '<img src="' + esc(pixsoThumb(guid, "-preview")) + '" style="margin-top:10px;width:100%;height:68px;object-fit:contain;border-radius:4px;display:block;" onerror="this.onerror=null;this.src=\'' + esc(pixsoThumb(guid)) + "'\">" : ""
    col.innerHTML = '<div class="em-ro-cap"><span>设计组件</span>' + tag + '</div><div class="em-ro-name">' + nameHtml + "</div>" + img
  }

  function fillEditDD() {
    var slot = dlgBody() ? dlgBody().querySelector(".em-dd-slot") : null
    if (!slot) return
    if (!Ed.ddOpen) { slot.innerHTML = ""; return }
    var items = Ed.ddItems.map(function (r) {
      var imgHtml = r.thumb ? '<img src="' + esc(r.thumb) + '" style="width:36px;height:20px;object-fit:contain;border-radius:3px;flex-shrink:0;background:var(--fill-3);">' : '<span style="width:36px;height:20px;background:var(--fill-3);border-radius:3px;flex-shrink:0;"></span>'
      return '<button data-em-dd-pick="' + esc(r.guid) + '" data-em-dd-fk="' + esc(r.fileKey || "") + '" style="width:100%;display:flex;align-items:center;gap:8px;border:0;background:transparent;border-radius:6px;padding:7px 8px;cursor:pointer;text-align:left;font-size:13px;color:var(--text-1);">' + imgHtml + "<span>" + esc(r.name) + "</span></button>"
    }).join("")
    var inner = Ed.ddItems.length ? items : '<div style="padding:14px;text-align:center;color:var(--text-3);font-size:12px;">没有可关联的组件</div>'
    slot.innerHTML = '<div style="position:absolute;top:34px;right:0;width:300px;max-height:264px;overflow:auto;background:#fff;border:1px solid var(--border-1);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:20;padding:6px;">' + inner + "</div>"
    slot.querySelectorAll("[data-em-dd-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        var guid = b.dataset.emDdPick
        var fk = b.dataset.emDdFk
        for (var i = 0; i < Ed.ddItems.length; i++) {
          var r = Ed.ddItems[i]
          if (r.guid === guid && r.fileKey === fk) {
            Ed.ddOpen = false
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
    Ed.saving = true; Ed.err = ""
    setFoot('<span class="spacer"></span><button class="em-btn" disabled>取消</button><button class="em-btn em-btn-primary" disabled>保存中...</button>')
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
    var doPut = function () {
      return fetch("/api/design-systems/" + slug + "/mapping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [item] }) })
    }
    doPut().then(function (res) {
      if (res.status === 400) {
        return fetch("/api/design-systems/" + slug + "/mapping/sync", { method: "POST" }).catch(function () { }).then(doPut)
      }
      return res
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return null }).then(function (b) { throw new Error("HTTP " + res.status + (b && b.detail ? "：" + b.detail : "")) })
      closeEdit(); return refresh()
    }).catch(function (e) {
      Ed.err = "保存失败：" + e.message; Ed.saving = false
      fillEditFoot()
    })
  }
}
