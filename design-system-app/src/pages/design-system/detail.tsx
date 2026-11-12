import { createEffect, createSignal, on, onCleanup, onMount, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { getDsData, faceUrl, authorLabel, type DsData } from "./data"
import { getEncryptedUserData } from "../../utils/auth"
import { API_BASE } from "../../config"

const BACK_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" fill="none"><path d="M6 1L2 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const USAGE_ICON = '<svg viewBox="0 0 14 14" fill="none"><path d="M10.9375 6.98558C10.9375 8.38936 10.1975 9.62093 9.08492 10.3142L9.08456 11.7112C9.08456 11.969 8.87562 12.1779 8.61789 12.1779L5.38211 12.1779C5.12438 12.1779 4.91544 11.969 4.91544 11.7112L4.91508 10.3142C3.80252 9.62093 3.0625 8.38936 3.0625 6.98558C3.0625 4.81892 4.82538 3.0625 7 3.0625C9.17462 3.0625 10.9375 4.81892 10.9375 6.98558Z" fill-rule="evenodd" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875"/><line x1="4.91552734" x2="9.08464432" y1="13.4472656" y2="13.4472656" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875"/><path d="M6.99984 0.729492L6.99984 1.45866M11.434 2.56618L10.9184 3.08178M13.2707 7.00033L12.5415 7.00033M0.729004 7.00033L1.45817 7.00033M2.56569 2.56618L3.08129 3.08178" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875"/></svg>'
const VIEWS_ICON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7 10.5 10.5 7 10.5 1.5 7 1.5 7z"/><circle cx="7" cy="7" r="1.7"/></svg>'

/**
 * 设计系统详情页 —— 头部（外层壳）+ Token Viewer 模板（iframe）。
 *
 * 职责分离：
 *   壳（本组件）：面包屑返回 / 标题 / 作者头像组 / 调用量 —— 数据全部来自 api1 列表接口（getDsData().meta）
 *   iframe 模板：左侧导航 + 右侧 token 数据 —— 按 meta.jsonUrl fetch design-system.json 渲染
 *
 * 数据流：
 *   <iframe src=template.html>  →  模板加载完成
 *   ← postMessage {type:"ds-ready"}
 *   postMessage {type:"ds-data", data:{id, meta}}（meta.jsonUrl 为模板唯一数据源）
 */
export default function DesignSystemDetail(props: { id: string }): JSX.Element {
  const navigate = useNavigate()
  const [loaded, setLoaded] = createSignal(false)
  /** 预览量：详情页每次加载 +1（/views 接口返回值即时显示；失败回落 api1 快照） */
  const [views, setViews] = createSignal<number | null>(null)
  let iframe: HTMLIFrameElement | undefined

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === "ds-ready") {
      const ent = getDsData(props.id)
      if (ent) (e.source as Window).postMessage({ type: "ds-data", data: { id: props.id, meta: ent.meta } }, "*")
    }
  }

  onMount(() => {
    window.addEventListener("message", onMessage)
    // 预览量埋点：每次进入详情页自增一次，fire-and-forget；
    // 携带 X-User-Data（登录态 userInfo 加密）供统计页聚合人员/部门，无登录态则匿名降级
    void (async () => {
      const headers: Record<string, string> = {
        "octo-vs-token": "octo_vs_7e91e862389139bab49247ba2550f366",
      }
      try {
        const userData = await getEncryptedUserData()
        if (userData) headers["X-User-Data"] = userData
      } catch { /* 加密失败 → 匿名 */ }
      fetch(`${API_BASE}/api/design-systems/${props.id}/views`, { method: "POST", headers })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
        .then((d: { views?: number }) => { if (typeof d.views === "number") setViews(d.views) })
        .catch(() => {})
    })()
  })
  onCleanup(() => window.removeEventListener("message", onMessage))

  /* hash 直跳两个详情页（浏览器前进/后退）时 iframe DOM 会被复用而不重载，
     导致模板仍显示上一个设计系统的数据 —— id 变化时强制重载 iframe 重新走 ds-ready 握手 */
  createEffect(
    on(
      () => props.id,
      () => {
        try { iframe?.contentWindow?.location.reload() } catch { /* 同源才能 reload，异常时忽略 */ }
      },
      { defer: true },
    ),
  )

  return (
    <div class="flex-1 relative overflow-hidden" style="background:#F3F4F6;display:flex;flex-direction:column">
      <Show
        when={getDsData(props.id)}
        fallback={
          <div class="absolute inset-0 flex items-center justify-center" style="color:rgba(0,0,0,0.4);font-size:15px">
            未找到该设计系统的数据
          </div>
        }
      >
        {(ent: () => DsData) => (
          <>
            <style>{`
              .dsd-head { background:#fff; padding:22px 24px 0 40px; height:134px; flex-shrink:0; }
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

            {/* 头部：api1 meta 数据（名称 / 作者头像组+昵称 / 调用量），返回由壳直接处理 */}
            <div class="dsd-head">
              <div class="crumb" onClick={() => navigate("/design-system")}>
                <span class="back" innerHTML={BACK_ICON} />
                <span class="cur">设计系统</span>
                <span class="sep">/</span>
                <span class="cur">{ent().meta.name}</span>
              </div>
              <div class="dsd-title">
                <span class="dsd-logo"><img src={ent().meta.iconUrl} alt={ent().meta.name} /></span>
                <div>
                  <div class="dsd-name">{ent().meta.name}</div>
                  <div class="dsd-meta">
                    <span class="faces">
                      <For each={ent().meta.authors ?? []}>
                        {(a) => <img class="face" src={a.account ? faceUrl(a.account) : "/design-systems/avatar-author.png"} alt={authorLabel(a)} />}
                      </For>
                    </span>
                    <span>{(ent().meta.authors ?? []).map(authorLabel).filter(Boolean).join("、") || "Octo Agent"}</span>
                    <span class="bar"></span>
                    <span class="usage-ic" innerHTML={USAGE_ICON} />
                    <span>调用量 {ent().meta.usage ?? 0}</span>
                    <span class="bar"></span>
                    <span class="usage-ic" innerHTML={VIEWS_ICON} />
                    <span>预览量 {views() ?? ent().meta.views ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 模板区：左侧导航 + 右侧 token 数据（json_url） */}
            <div class="flex-1 relative" style="min-height:0">
              <Show when={!loaded()}>
                <div
                  class="absolute inset-0 z-10 flex items-center justify-center"
                  style="color:rgba(0,0,0,0.4);font-size:15px;background:#F3F4F6"
                >
                  加载中...
                </div>
              </Show>
              <iframe
                ref={iframe}
                src="./design-systems/detail/template.html"
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
