import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { itemToMeta, faceUrl, authorLabel, type DsMeta } from "./data"
import { getEncryptedUserData, getUserInfo } from "../../utils/auth"
import { API_BASE } from "../../config"

const BACK_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" fill="none"><path d="M6 1L2 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const VIEWS_ICON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7 10.5 10.5 7 10.5 1.5 7 1.5 7z"/><circle cx="7" cy="7" r="1.7"/></svg>'

/** 预览页去缓存：追加时间戳参数，每次进详情页强制拉最新 HTML */
const cacheBust = (u: string) => `${u}${u.includes("?") ? "&" : "?"}t=${Date.now()}`

/**
 * 映射编辑页 #/design-system/:id/edit —— 与查看路由（detail.tsx）完全一致的壳，
 * 唯一差异：ds-data 多传 `edit: true` + 强制走 template.html（忽略 previewUrl）。
 * template.html 收到 edit 标记后加载 edit-mode.js（向导 + 编辑弹窗），其余栏目渲染完全相同。
 */
export default function EditMappingPage(): JSX.Element {
  const navigate = useNavigate()
  const params = useParams()
  const id = () => String(params.id || "")

  const [loaded, setLoaded] = createSignal(false)
  const [meta, setMeta] = createSignal<DsMeta | null>(null)
  const [notFound, setNotFound] = createSignal(false)
  const [dsReady, setDsReady] = createSignal(false)
  /* 映射暂存-发布：iframe(edit-mode.js) ↔ 宿主 双向 postMessage */
  const [dirty, setDirty] = createSignal(false)
  const [stagedCount, setStagedCount] = createSignal(0)
  const [pubState, setPubState] = createSignal<"idle" | "busy" | "ok" | "fail">("idle")
  const [pubMsg, setPubMsg] = createSignal("")
  let pubTimer: number | undefined
  let iframe: HTMLIFrameElement | undefined

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === "ds-ready") {
      setDsReady(true)
    } else if (type === "ds-scroll") {
      const d = (e.data as { section?: string; item?: string } | null) || {}
      const hash = "#/design-system/" + id() + (d.section ? "/" + d.section : "") + (d.item ? "/" + d.item : "")
      if (location.hash !== hash) history.replaceState(null, "", hash)
    } else if (type === "ds-dirty") {
      const d = (e.data as { dirty?: boolean; count?: number } | null) || {}
      setDirty(!!d.dirty)
      setStagedCount(Number(d.count) || 0)
    } else if (type === "ds-publishing") {
      setPubState("busy")
    } else if (type === "ds-publish-result") {
      const d = (e.data as { ok?: boolean; error?: string; dropped?: string[] } | null) || {}
      window.clearTimeout(pubTimer)
      if (d.ok) {
        setPubState("ok")
        setPubMsg(d.dropped && d.dropped.length ? `已发布；${d.dropped.length} 行不在映射表，仍保留暂存` : "")
        pubTimer = window.setTimeout(() => { setPubState("idle"); setPubMsg("") }, 2400)
      } else {
        setPubState("fail")
        setPubMsg(d.error || "发布失败")
        pubTimer = window.setTimeout(() => { setPubState("idle"); setPubMsg("") }, 6000)
      }
    }
  }

  /* 暂存修改未发布时离开页面拦截（关闭/刷新 + 面包屑返回；应用内其他入口不做全局守卫） */
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty()) { e.preventDefault(); e.returnValue = "" }
  }
  const canLeave = () => !dirty() || window.confirm("有未发布的关联修改，离开将丢失（暂存仅保存在当前标签页），确定离开？")

  const doPublish = () => {
    if (!dirty() || pubState() === "busy") return
    iframe?.contentWindow?.postMessage({ type: "ds-publish" }, "*")
  }
  const doDiscard = () => {
    if (!dirty() || pubState() === "busy") return
    if (!window.confirm("放弃全部未发布的关联修改？")) return
    iframe?.contentWindow?.postMessage({ type: "ds-discard" }, "*")
  }
  const pubLabel = () => {
    if (pubState() === "busy") return "发布中..."
    if (pubState() === "ok") return "已发布"
    return dirty() ? `确认发布${stagedCount() ? ` · ${stagedCount()}` : ""}` : "确认发布"
  }

  onMount(() => {
    window.addEventListener("message", onMessage)
    window.addEventListener("beforeunload", onBeforeUnload)
  })
  onCleanup(() => {
    window.removeEventListener("message", onMessage)
    window.removeEventListener("beforeunload", onBeforeUnload)
    window.clearTimeout(pubTimer)
  })

  /* 数据流：id 变化 → 串行「打点 → 单条详情」（与 detail.tsx 完全一致） */
  let aborter: AbortController | undefined
  createEffect(
    on(
      () => id(),
      (id) => {
        aborter?.abort()
        const ctrl = new AbortController()
        aborter = ctrl
        setMeta(null)
        setNotFound(false)
        setDsReady(false)
        setDirty(false)
        setStagedCount(0)
        setPubState("idle")
        setPubMsg("")
        window.clearTimeout(pubTimer)
        void (async () => {
          try {
            const headers: Record<string, string> = { "octo-vs-token": "octo_vs_7e91e862389139bab49247ba2550f366" }
            try {
              const userData = await getEncryptedUserData()
              if (userData) headers["X-User-Data"] = userData
            } catch { /* 匿名打点 */ }
            await fetch(`${API_BASE}/api/design-systems/${id}/views`, { method: "POST", headers, signal: ctrl.signal })
          } catch { /* best-effort */ }
          try {
            const res = await fetch(`${API_BASE}/api/design-systems/${id}`, { signal: ctrl.signal })
            if (!res.ok) throw new Error("HTTP " + res.status)
            setMeta(itemToMeta(await res.json()))
          } catch (e) {
            if ((e as Error).name === "AbortError") return
            console.warn("[edit] 详情获取失败:", e)
            setNotFound(true)
          }
        })()
      },
    ),
  )

  /* 模板握手：ds-ready 与 meta 双就绪 → 注入数据（edit:true → template 加载 edit-mode.js） */
  createEffect(() => {
    const m = meta()
    if (m && dsReady() && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: "ds-data",
        data: { id: id(), meta: m, edit: true, apiBase: API_BASE },
      }, "*")
    }
  })

  /* 同 id 下手改 URL 深链段 → 通知模板滚动 */
  createEffect(
    on(
      () => [params.section, params.item] as const,
      ([sec, item]) => {
        if (sec || item) iframe?.contentWindow?.postMessage({ type: "ds-deep", deep: { section: sec, item } }, "*")
      },
      { defer: true },
    ),
  )

  return (
    <div class="flex-1 relative overflow-hidden" style="background:#F3F4F6;display:flex;flex-direction:column">
      <Show
        when={meta()}
        fallback={
          <div class="absolute inset-0 flex items-center justify-center" style="color:rgba(0,0,0,0.4);font-size:15px">
            {notFound() ? "未找到该设计系统" : "加载中..."}
          </div>
        }
      >
        {(m: () => DsMeta) => (
          <>
            <style>{`
              .dsd-head { box-sizing:border-box; background:#fff; padding:22px 24px 0 40px; height:134px; flex-shrink:0; }
              .dsd-head .crumb { display:flex; align-items:center; gap:8px; color:#777777; height:24px; font-size:14px; margin-left:-4px; cursor:pointer; }
              .dsd-head .crumb .back { width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; border-radius:4px; color:#777777; }
              .dsd-head .crumb .back:hover { background:rgba(0,0,0,0.05); }
              .dsd-head .crumb .cur { color:#191919; }
              .dsd-head .crumb span.sep { color:rgba(0,0,0,0.4); }
              .dsd-title { margin-top:18px; display:flex; align-items:center; gap:12px; }
              .dsd-logo { width:42px; height:42px; border-radius:10px; overflow:hidden; flex-shrink:0; }
              .dsd-logo img { width:100%; height:100%; border-radius:10px; object-fit:cover; display:block; }
              .dsd-name { font-size:16px; line-height:24px; font-weight:500; color:#191919; }
              .dsd-meta { display:flex; align-items:center; gap:8px; margin-top:2px; color:#777777; font-size:14px; line-height:20px; }
              .dsd-meta .faces { display:inline-flex; align-items:center; }
              .dsd-meta .faces .face { width:18px; height:18px; border-radius:50%; margin-right:-6px; border:1px solid #fff; background:#E9EEF8; object-fit:cover; }
              .dsd-meta .faces .face:last-child { margin-right:0; }
              .dsd-meta .bar { width:1px; height:12px; background:rgba(0,0,0,0.1); }
              .dsd-meta .usage-ic { width:14px; height:14px; color:#777777; display:inline-flex; }
              .dsd-pub { margin-left:auto; align-self:flex-end; display:flex; align-items:center; gap:10px; padding-bottom:1px; }
              .dsd-pub-btn { height:32px; padding:0 20px; border-radius:999px; border:0; background:#0A59F7; color:#fff; font-size:13px; font-weight:500; cursor:pointer; white-space:nowrap; }
              .dsd-pub-btn:hover:enabled { background:#3B7BF9; }
              .dsd-pub-btn:disabled { background:#C5CDD8; color:#fff; cursor:not-allowed; }
              .dsd-pub-btn.ok { background:#12B76A; }
              .dsd-pub-btn.fail { background:#D92D20; }
              .dsd-pub-discard { height:32px; padding:0 14px; border-radius:999px; border:1px solid rgba(0,0,0,0.15); background:#fff; color:#777777; font-size:13px; cursor:pointer; white-space:nowrap; }
              .dsd-pub-discard:hover { color:#191919; border-color:rgba(0,0,0,0.3); }
              .dsd-pub-msg { font-size:12px; color:#777777; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
              .dsd-pub-msg.err { color:#D92D20; }
            `}</style>

            {/* 头部：与查看路由完全一致（面包屑/图标/名称/作者/预览量） */}
            <div class="dsd-head">
              <div class="crumb" onClick={() => { if (!canLeave()) return; navigate("/design-system") }}>
                <span class="back" innerHTML={BACK_ICON} />
                <span class="cur">设计系统</span>
                <span class="sep">/</span>
                <span class="cur">{m().name}</span>
              </div>
              <div class="dsd-title">
                <span class="dsd-logo"><img src={m().iconUrl} alt={m().name} /></span>
                <div>
                  <div class="dsd-name">{m().name}</div>
                  <div class="dsd-meta">
                    <span class="faces">
                      {(m().authors ?? []).map((a) => <img class="face" src={a.account ? faceUrl(a.account) : "/design-systems/avatar-author.png"} alt={authorLabel(a)} />)}
                    </span>
                    <span>{(m().authors ?? []).map(authorLabel).filter(Boolean).join("、") || "Octo Agent"}</span>
                    <span class="bar"></span>
                    <span class="usage-ic" innerHTML={VIEWS_ICON} />
                    <span>预览量 {m().views ?? 0}</span>
                  </div>
                </div>
                {/* 暂存-发布：与作者/调用量行右对齐——确认发布（dirty 时亮起）+ 放弃修改 + 结果反馈 */}
                <div class="dsd-pub">
                  <Show when={pubMsg()}>
                    <span class={`dsd-pub-msg ${pubState() === "fail" ? "err" : ""}`} title={pubMsg()}>{pubMsg()}</span>
                  </Show>
                  <Show when={dirty() && pubState() !== "busy"}>
                    <button class="dsd-pub-discard" onClick={doDiscard} title="清空全部未发布的暂存修改">放弃修改</button>
                  </Show>
                  <button
                    class="dsd-pub-btn"
                    classList={{ ok: pubState() === "ok", fail: pubState() === "fail" }}
                    disabled={!dirty() || pubState() === "busy"}
                    onClick={doPublish}
                  >
                    {pubLabel()}
                  </button>
                </div>
              </div>
            </div>

            {/* 模板区：与查看路由一致——编辑页强制走 template.html（previewUrl 忽略），ds-data 多带 edit:true */}
            <div class="flex-1 relative" style="min-height:0">
              <Show when={!loaded()}>
                <div class="absolute inset-0 z-10 flex items-center justify-center" style="color:rgba(0,0,0,0.4);font-size:15px;background:#F3F4F6">加载中...</div>
              </Show>
              <iframe
                ref={iframe}
                src={cacheBust("./design-systems/detail/template.html")}
                title="设计系统详情"
                style="width:100%;height:100%;border:0;display:block"
                onLoad={() => setLoaded(true)}
              />
            </div>
          </>
        )}
      </Show>
    </div>
  )
}
