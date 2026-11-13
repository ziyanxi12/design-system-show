import { createEffect, createSignal, on, onCleanup, onMount, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { itemToMeta, faceUrl, authorLabel, type DsMeta } from "./data"
import { getEncryptedUserData, getUserInfo } from "../../utils/auth"
import { API_BASE } from "../../config"

const BACK_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" fill="none"><path d="M6 1L2 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const USAGE_ICON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="0.875" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M10.9375 6.98558C10.9375 8.38936 10.1975 9.62093 9.08492 10.3142L9.08456 11.7112C9.08456 11.969 8.87562 12.1779 8.61789 12.1779L5.38211 12.1779C5.12438 12.1779 4.91544 11.969 4.91544 11.7112L4.91508 10.3142C3.80252 9.62093 3.0625 8.38936 3.0625 6.98558C3.0625 4.81892 4.82538 3.0625 7 3.0625C9.17462 3.0625 10.9375 4.81892 10.9375 6.98558Z" fill-rule="evenodd"/><line x1="4.91552734" x2="9.08464434" y1="13.4472926" y2="13.4472926"/><path d="M6.99984 0.729492L6.99984 1.45866M11.434 2.56618L10.918 3.08178M13.2707 7.00033L12.5415 7.00033M0.729004 7.00033L1.45817 7.00033M2.56569 2.56618L3.08129 3.08178" /></svg>'
const VIEWS_ICON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7 10.5 10.5 7 10.5 1.5 7 1.5 7z"/><circle cx="7" cy="7" r="1.7"/></svg>'

/**
 * 设计系统详情页 —— 头部（外层壳）+ Token Viewer 模板（iframe）。
 *
 * 职责分离：
 *   壳（本组件）：面包屑返回 / 标题 / 作者头像组 / 调用量·预览量
 *   iframe 模板：左侧导航 + 右侧 token 数据 —— 按 meta.jsonUrl fetch design-system.json 渲染
 *
 * 数据流（进页 / 换系统时**串行**，保证 views 已含本次浏览、头部一次渲染无跳变）：
 *   ① POST /api/design-systems/{slug}/views   预览量打点（尽力而为，失败不阻塞）
 *   ② GET  /api/design-systems/{slug}          单条详情（api1 item 同构，meta 全字段）
 *   ③ meta 一次性渲染头部 + postMessage 注入模板
 *   <iframe src=template.html>  →  模板加载完成
 *   ← postMessage {type:"ds-ready"}（与 ② 双就绪才发数据）
 *   postMessage {type:"ds-data", data:{id, meta}}（meta.jsonUrl 为模板唯一数据源）
 */
export default function DesignSystemDetail(props: { id: string; section?: string; item?: string }): JSX.Element {
  const navigate = useNavigate()
  const [loaded, setLoaded] = createSignal(false)
  /** 详情 meta（1a 单条接口产物；串行在打点之后 → views 已含本次浏览，无快照→自增跳变） */
  const [meta, setMeta] = createSignal<DsMeta | null>(null)
  const [notFound, setNotFound] = createSignal(false)
  /** 模板 ds-ready 握手标记（与 meta 双就绪后注入；id 变化重置，模板重载后重新握手） */
  const [dsReady, setDsReady] = createSignal(false)
  let iframe: HTMLIFrameElement | undefined

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === "ds-ready") {
      setDsReady(true)
    } else if (type === "ds-scroll") {
      /* 模板滚动/点导航上报当前位置 → replaceState 实时跟随（不触发 hashchange，不影响路由、不刷历史） */
      const d = (e.data as { section?: string; item?: string } | null) || {}
      const hash = "#/design-system/" + props.id + (d.section ? "/" + d.section : "") + (d.item ? "/" + d.item : "")
      if (location.hash !== hash) history.replaceState(null, "", hash)
    }
  }

  onMount(() => window.addEventListener("message", onMessage))
  onCleanup(() => window.removeEventListener("message", onMessage))

  /* 数据流主体：id 变化（含首次进入）→ 串行「打点 → 单条详情」。
     A→B 直跳（不经列表、组件复用）同样触发（旧 onMount 只在挂载时打点的洞一并修复）；
     在途请求随 id 切换取消，旧响应不得覆盖新页 */
  let aborter: AbortController | undefined
  createEffect(
    on(
      () => props.id,
      (id) => {
        aborter?.abort()
        const ctrl = new AbortController()
        aborter = ctrl
        setMeta(null)
        setNotFound(false)
        setDsReady(false)
        void (async () => {
          // ① 预览量打点：计入本次浏览（best-effort——失败仅本次少计一次，不阻塞详情加载）
          try {
            const headers: Record<string, string> = {
              "octo-vs-token": "octo_vs_7e91e862389139bab49247ba2550f366",
            }
            try {
              const userData = await getEncryptedUserData()
              if (userData) headers["X-User-Data"] = userData
              else console.info("[views] 匿名打点：", getUserInfo() ? "加密返回空串（AES key 未注入前端构建）" : "当前源无登录态（localStorage.userInfo 为空或缺 account/nickName）")
            } catch (e) { console.warn("[views] 加密失败 → 匿名:", e) }
            await fetch(`${API_BASE}/api/design-systems/${id}/views`, { method: "POST", headers, signal: ctrl.signal })
          } catch (e) {
            if ((e as Error).name !== "AbortError") console.warn("[views] 打点失败（不阻塞详情加载）:", e)
          }
          // ② 单条详情：①完成后串行拉取 → views 已含本次浏览，头部一次渲染
          try {
            const res = await fetch(`${API_BASE}/api/design-systems/${id}`, { signal: ctrl.signal })
            if (!res.ok) throw new Error("HTTP " + res.status)
            setMeta(itemToMeta(await res.json()))
          } catch (e) {
            if ((e as Error).name === "AbortError") return
            console.warn("[detail] 详情获取失败:", e)
            setNotFound(true)
          }
        })()
      },
    ),
  )

  /* 模板握手：ds-ready 与 meta 双就绪 → 注入数据（jsonUrl 为模板唯一数据源，深链段随行） */
  createEffect(() => {
    const m = meta()
    if (dsReady() && m && iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: "ds-data",
        data: { id: props.id, meta: m, deep: props.section || props.item ? { section: props.section, item: props.item } : undefined },
      }, "*")
    }
  })

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

  /* 同 id 下手改 URL 深链段（hashchange → 路由参数变化）→ 通知模板滚动到新位置（初始注入走 ds-data，不在此重复） */
  createEffect(
    on(
      () => [props.section, props.item] as const,
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

            {/* 头部：1a 单条详情数据（名称 / 作者头像组+昵称 / 调用量 / 预览量），返回由壳直接处理 */}
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
                      <For each={m().authors ?? []}>
                        {(a) => <img class="face" src={a.account ? faceUrl(a.account) : "/design-systems/avatar-author.png"} alt={authorLabel(a)} />}
                      </For>
                    </span>
                    <span>{(m().authors ?? []).map(authorLabel).filter(Boolean).join("、") || "Octo Agent"}</span>
                    <span class="bar"></span>
                    <span class="usage-ic" innerHTML={USAGE_ICON} />
                    <span>调用量 {m().usage ?? 0}</span>
                    <span class="bar"></span>
                    <span class="usage-ic" innerHTML={VIEWS_ICON} />
                    <span>预览量 {m().views ?? 0}</span>
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
