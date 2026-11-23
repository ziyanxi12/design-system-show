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
    }
  }

  onMount(() => window.addEventListener("message", onMessage))
  onCleanup(() => window.removeEventListener("message", onMessage))

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
        data: { id: id(), meta: m, edit: true },
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
            `}</style>

            {/* 头部：与查看路由完全一致（面包屑/图标/名称/作者/预览量） */}
            <div class="dsd-head">
              <div class="crumb" onClick={() => navigate("/design-system")}>
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
