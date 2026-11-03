import { createSignal, onCleanup, onMount, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { getDsData, faceUrl, authorLabel, type DsData } from "./data"

const BACK_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" fill="none"><path d="M6 1L2 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const DS_LOGO = '<svg viewBox="0 0 21.9399 21.9102" xmlns="http://www.w3.org/2000/svg" fill="none"> <g> <path d="M21.94 10.97C21.94 8.98333 21.4467 7.15 20.46 5.47C19.48 3.79 18.15 2.45667 16.47 1.47C14.79 0.49 12.9567 0 10.97 0C8.98333 0 7.15 0.49 5.47 1.47C3.79 2.45667 2.46 3.79 1.48 5.47C0.493333 7.15 0 8.98333 0 10.97L2.35 10.97C2.35 9.39667 2.74 7.95 3.52 6.63C4.29333 5.31 5.34 4.26667 6.66 3.5C7.98 2.73333 9.41667 2.35 10.97 2.35C12.5233 2.35 13.96 2.73333 15.28 3.5C16.6 4.26667 17.6467 5.31 18.42 6.63C19.2 7.95 19.59 9.39667 19.59 10.97L21.94 10.97Z" fill="rgb(255,255,255)" fill-rule="nonzero" /> <path d="M0.0703125 12.21C0.203646 13.1566 0.420312 14.0466 0.720312 14.88L3.29031 14.88C2.87698 14.0466 2.59698 13.1566 2.45031 12.21L0.0703125 12.21ZM19.4903 12.21C19.3436 13.1566 19.0636 14.0466 18.6503 14.88L21.2203 14.88C21.5203 14.0466 21.737 13.1566 21.8703 12.21L19.4903 12.21ZM6.63031 18.41C6.19698 18.15 5.78698 17.8533 5.40031 17.52C5.02031 17.18 4.66031 16.82 4.32031 16.44L1.47031 16.44C1.87031 17.1266 2.35698 17.7833 2.93031 18.41L6.63031 18.41ZM19.0103 18.41C19.5836 17.7833 20.0703 17.1266 20.4703 16.44L17.6203 16.44C16.947 17.24 16.177 17.8966 15.3103 18.41L19.0103 18.41ZM4.73031 19.97C5.62365 20.59 6.60031 21.07 7.66031 21.41C8.71365 21.7433 9.81698 21.91 10.9703 21.91C12.1236 21.91 13.227 21.7433 14.2803 21.41C15.3403 21.07 16.317 20.59 17.2103 19.97L4.73031 19.97Z" fill="rgb(255,255,255)" fill-rule="nonzero" /> </g> </svg>'
const USAGE_ICON = '<svg viewBox="0 0 14 14" fill="none"><path d="M10.9375 6.98558C10.9375 8.38936 10.1975 9.62093 9.08492 10.3142L9.08456 11.7112C9.08456 11.969 8.87562 12.1779 8.61789 12.1779L5.38211 12.1779C5.12438 12.1779 4.91544 11.969 4.91544 11.7112L4.91508 10.3142C3.80252 9.62093 3.0625 8.38936 3.0625 6.98558C3.0625 4.81892 4.82538 3.0625 7 3.0625C9.17462 3.0625 10.9375 4.81892 10.9375 6.98558Z" fill-rule="evenodd" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875"/><line x1="4.91552734" x2="9.08464432" y1="13.4472656" y2="13.4472656" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875"/><path d="M6.99984 0.729492L6.99984 1.45866M11.434 2.56618L10.9184 3.08178M13.2707 7.00033L12.5415 7.00033M0.729004 7.00033L1.45817 7.00033M2.56569 2.56618L3.08129 3.08178" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875"/></svg>'

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
  let iframe: HTMLIFrameElement | undefined

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === "ds-ready") {
      const ent = getDsData(props.id)
      if (ent) (e.source as Window).postMessage({ type: "ds-data", data: { id: props.id, meta: ent.meta } }, "*")
    }
  }

  onMount(() => window.addEventListener("message", onMessage))
  onCleanup(() => window.removeEventListener("message", onMessage))

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
              .dsd-logo { width:42px; height:42px; border-radius:10px; background:#0A59F7; display:flex; align-items:center; justify-content:center; color:#fff; flex-shrink:0; }
              .dsd-logo svg { width:22px; height:22px; }
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
                <span class="dsd-logo" innerHTML={DS_LOGO} />
                <div>
                  <div class="dsd-name">{ent().meta.name}</div>
                  <div class="dsd-meta">
                    <span class="faces">
                      <For each={ent().meta.authors ?? []}>
                        {(a) => <img class="face" src={a.account ? faceUrl(a.account, 48) : "/design-systems/avatar-author.png"} alt={authorLabel(a)} />}
                      </For>
                    </span>
                    <span>{(ent().meta.authors ?? []).map(authorLabel).filter(Boolean).join("、") || "Octo Agent"}</span>
                    <span class="bar"></span>
                    <span class="usage-ic" innerHTML={USAGE_ICON} />
                    <span>调用量 {ent().meta.usage ?? 0}</span>
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
                src="/design-systems/detail/template.html"
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
