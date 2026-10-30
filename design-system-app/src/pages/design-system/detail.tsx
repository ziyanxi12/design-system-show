import { createSignal, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { getDsData } from "./data"

/**
 * 设计系统详情页 —— 内嵌 Token Viewer 模版（public/design-systems/detail/template.html）。
 *
 * 数据流：
 *   父页面                          iframe (template.html)
 *   ─────                          ─────────────────────
 *   <iframe src=template.html>  →  模版加载完成
 *   ← postMessage {type:"ds-ready"}
 *   postMessage {type:"ds-data", data:{id, meta}}
 *                                →  fetch systems/{id}/design-system.json + mapping.json
 *                                →  buildPage 渲染 8 个分区
 *   ← postMessage {type:"ds-back"}  （用户点面包屑返回）
 *   navigate("/design-system")      回列表
 */
export default function DesignSystemDetail(props: { id: string }): JSX.Element {
  const navigate = useNavigate()
  const [loaded, setLoaded] = createSignal(false)
  let iframe: HTMLIFrameElement | undefined

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === "ds-ready") {
      const entry = getDsData(props.id)
      if (entry) (e.source as Window).postMessage({ type: "ds-data", data: { id: props.id, meta: entry.meta } }, "*")
    }
    if (type === "ds-back") {
      navigate("/design-system")
    }
  }

  onMount(() => window.addEventListener("message", onMessage))
  onCleanup(() => window.removeEventListener("message", onMessage))

  return (
    <div class="flex-1 relative overflow-hidden" style="background:#F3F4F6">
      <Show when={!loaded()}>
        <div
          class="absolute inset-0 z-10 flex items-center justify-center"
          style="color:rgba(0,0,0,0.4);font-size:15px"
        >
          加载中...
        </div>
      </Show>
      <Show
        when={getDsData(props.id)}
        fallback={
          <div class="absolute inset-0 flex items-center justify-center" style="color:rgba(0,0,0,0.4);font-size:15px">
            未找到该设计系统的数据
          </div>
        }
      >
        <iframe
          ref={iframe}
          src="/design-systems/detail/template.html"
          title="设计系统详情"
          style="width:100%;height:100%;border:0;display:block"
          onLoad={() => setLoaded(true)}
        />
      </Show>
    </div>
  )
}
