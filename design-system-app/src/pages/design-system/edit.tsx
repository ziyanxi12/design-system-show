import { createEffect, createSignal, on, onCleanup, onMount, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { itemToMeta, faceUrl, authorLabel, type DsMeta } from "./data"
import { getEncryptedUserData, getUserInfo, checkIsAdmin } from "../../utils/auth"
import { API_BASE } from "../../config"

const BACK_ICON = '<svg width="14" height="14" viewBox="0 0 10 10" fill="none"><path d="M6 1L2 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const VIEWS_ICON = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M1.5 7s2-3.5 5.5-3.5S12.5 7 12.5 7 10.5 10.5 7 10.5 1.5 7 1.5 7z"/><circle cx="7" cy="7" r="1.7"/></svg>'

/** 编辑按钮 16×16 图标（square_and_pencil，白 fill 蓝底适配） */
const EDIT_ICON = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16" fill="none"><defs><filter id="ed-mask-f"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter></defs><mask id="ed-mask-0" width="16" height="16" x="0" y="0" maskUnits="userSpaceOnUse"><g filter="url(#ed-mask-f)"><g id="ed-hm"><rect id="ed-bg" width="16" height="16" x="0" y="0" fill="rgb(255,255,255)"/><g id="ed-grp"><path id="ed-cut" d="M15.5666 0.446639C15.4289 0.308861 15.2666 0.202195 15.08 0.126639C14.8933 0.0510834 14.6978 0.0133057 14.4933 0.0133057C14.2933 0.0133057 14.1 0.0510834 13.9133 0.126639C13.7266 0.202195 13.5644 0.308861 13.4266 0.446639L7.07331 6.81331C6.97553 6.91108 6.89997 7.00886 6.84664 7.10664L5.93331 8.71997C5.84886 8.88886 5.80664 9.06219 5.80664 9.23997C5.80664 9.41775 5.85553 9.57553 5.95331 9.71331C6.03775 9.85997 6.15775 9.97997 6.31331 10.0733C6.46886 10.1622 6.63108 10.2066 6.79997 10.2066C6.95997 10.2066 7.11553 10.1644 7.26664 10.08L8.89331 9.15331C8.99109 9.10886 9.09331 9.03331 9.19997 8.92664L15.5666 2.57331C15.8555 2.27553 16 1.92219 16 1.51331C16 1.09997 15.8555 0.744417 15.5666 0.446639Z" fill="rgb(0,0,0)" fill-rule="evenodd"/></g></g></g></mask><g mask="url(#ed-mask-0)"><path id="ed-sq" d="M11.7464 14.4C12.1909 14.4 12.6064 14.2889 12.9931 14.0667C13.3753 13.84 13.6797 13.5356 13.9064 13.1534C14.1286 12.7667 14.2397 12.3511 14.2397 11.9067L14.2397 4.24004C14.2397 3.79115 14.1286 3.37559 13.9064 2.99337C13.6797 2.6067 13.3753 2.30226 12.9931 2.08004C12.6064 1.85782 12.1909 1.7467 11.7464 1.7467L4.07974 1.7467C3.62196 1.7467 3.19974 1.85782 2.81307 2.08004C2.43085 2.30226 2.12863 2.6067 1.90641 2.99337C1.67974 3.37559 1.56641 3.79115 1.56641 4.24004L1.56641 11.9067C1.56641 12.3511 1.67974 12.7667 1.90641 13.1534C2.12863 13.5356 2.43085 13.84 2.81307 14.0667C3.19974 14.2889 3.62196 14.4 4.07974 14.4L11.7464 14.4ZM11.7464 2.73337C12.1509 2.73337 12.502 2.88004 12.7997 3.17337C13.0975 3.4667 13.2464 3.82226 13.2464 4.24004L13.2464 11.8867C13.2464 12.3045 13.0975 12.66 12.7997 12.9534C12.502 13.2467 12.1509 13.3934 11.7464 13.3934L4.07974 13.3934C3.66196 13.3934 3.30641 13.2467 3.01307 12.9534C2.71974 12.66 2.57307 12.3045 2.57307 11.8867L2.57307 4.24004C2.57307 3.82226 2.71974 3.4667 3.01307 3.17337C3.30641 2.88004 3.66196 2.73337 4.07974 2.73337L11.7464 2.73337Z" fill="rgb(255,255,255)" fill-rule="evenodd"/></g><g id="ed-pen"><path id="ed-pen-p" d="M6.60681 9.13329C6.5757 9.18662 6.57126 9.23995 6.59348 9.29329C6.6157 9.34662 6.6557 9.3844 6.71348 9.40662C6.77126 9.42884 6.82681 9.42884 6.88015 9.40662L8.08015 8.73329C8.16459 8.67995 8.24459 8.62662 8.32015 8.57329L8.43348 8.49329L7.52015 7.59995L7.42681 7.74662C7.39126 7.78662 7.36681 7.81995 7.35348 7.84662C7.3357 7.87329 7.31126 7.90884 7.28015 7.95329L6.60681 9.13329ZM15.0268 0.993288C14.8846 0.85551 14.7157 0.786621 14.5201 0.786621C14.3246 0.786621 14.1557 0.85551 14.0135 0.993288L8.01348 6.99329L7.95348 7.05329C7.92237 7.09773 7.88459 7.14662 7.84015 7.19995L8.81348 8.17329C8.86681 8.14218 8.93792 8.0844 9.02681 7.99995L15.0268 1.99995C15.1735 1.86218 15.2468 1.69329 15.2468 1.49329C15.2468 1.29773 15.1735 1.13107 15.0268 0.993288Z" fill="rgb(255,255,255)" fill-rule="nonzero"/></g></svg>`

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
  const [editing, setEditing] = createSignal(false)
  /* 路由守卫：null=校验中 / true=白名单管理员放行；非管理员静默重定向回查看页 */
  const [adminOk, setAdminOk] = createSignal<boolean | null>(null)
  let pubTimer: number | undefined
  let iframe: HTMLIFrameElement | undefined

  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe?.contentWindow) return
    const type = (e.data as { type?: string } | null)?.type
    if (type === "ds-ready") {
      setDsReady(true)
    } else if (type === "ds-toast") {
      const d = (e.data as { data?: { msg?: string; ok?: boolean } } | null)?.data
      if (d?.msg) showHeadToast(d.msg, d.ok !== false)
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
        /* 发布成功：toast + 回初态 */
        showHeadToast("发布成功", true)
        setPubState("idle")
        setPubMsg("")
        setEditing(false)
        iframe?.contentWindow?.postMessage({ type: "ds-edit-off" }, "*")
      } else {
        /* 发布失败：toast + 按钮红色态 */
        showHeadToast("发布失败：" + (d.error || ""), false)
        setPubState("fail")
        setPubMsg(d.error || "发布失败")
        pubTimer = window.setTimeout(() => { setPubState("idle"); setPubMsg("") }, 6000)
      }
    }
  }

  /* 头部中央 toast（iframe 经 ds-toast 触发，3 秒自动隐藏） */
  let headToastTimer: number | undefined
  function showHeadToast(msg: string, ok: boolean) {
    const el = document.querySelector(".dsd-head")
    if (!el) return
    el.querySelector(".head-toast")?.remove()
    window.clearTimeout(headToastTimer)
    const t = document.createElement("div")
    t.className = "head-toast"
    const iconSvg = ok
      ? '<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none"><path d="M7 0C3.1402 0 0 3.1402 0 7C0 10.8598 3.1402 14 7 14C10.8598 14 14 10.8598 14 7C14 3.1402 10.8598 0 7 0ZM6.65348 9.45357L10.8535 5.25357C11.0515 5.05558 11.0515 4.74445 10.8535 4.54646C10.6555 4.34847 10.3444 4.34847 10.1464 4.54646L6.29993 8.39291L4.20348 6.29646C4.00549 6.09847 3.69436 6.09847 3.49637 6.29646C3.29838 6.49445 3.29838 6.80558 3.49637 7.00357L5.94637 9.45357C6.06422 9.57142 6.18208 9.63035 6.29993 9.63035C6.41778 9.63035 6.53563 9.57142 6.65348 9.45357Z" fill="rgb(9,170,113)" fill-rule="evenodd"/></svg>'
      : '<svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none"><path d="M7 0C3.1402 0 0 3.1402 0 7C0 10.8598 3.1402 14 7 14C10.8598 14 14 10.8598 14 7C14 3.1402 10.8598 0 7 0ZM10.0682 4.96016C10.2524 4.77594 10.2524 4.47638 10.0682 4.29216C9.88395 4.10794 9.58439 4.10794 9.40017 4.29216L7.00017 6.69216L4.60017 4.29216C4.41595 4.10794 4.11639 4.10794 3.93217 4.29216C3.74795 4.47638 3.74795 4.77594 3.93217 4.96016L6.33217 7.36016L3.93217 9.76016C3.74795 9.94438 3.74795 10.2439 3.93217 10.4282C4.11639 10.6124 4.41595 10.6124 4.60017 10.4282L7.00017 8.02816L9.40017 10.4282C9.58439 10.6124 9.88395 10.6124 10.0682 10.4282C10.2524 10.2439 10.2524 9.94438 10.0682 9.76016L7.66817 7.36016L10.0682 4.96016Z" fill="rgb(224,33,40)" fill-rule="evenodd"/></svg>'
    t.innerHTML = iconSvg + '<span style="margin-left:8px"></span>'
    t.querySelector("span")!.textContent = msg
    el.appendChild(t)
    headToastTimer = window.setTimeout(() => t.remove(), 3000)
  }
  onCleanup(() => window.clearTimeout(headToastTimer))

  /* 暂存修改未发布时离开页面拦截（关闭/刷新 + 面包屑返回；应用内其他入口不做全局守卫） */
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty()) { e.preventDefault(); e.returnValue = "" }
  }
  const canLeave = () => !dirty() || window.confirm("有未发布的关联修改尚未保存到后端，离开将丢失，确定离开？")

  const doPublish = () => {
    if (!dirty() || pubState() === "busy") return
    iframe?.contentWindow?.postMessage({ type: "ds-publish" }, "*")
  }
  const doStartEdit = () => {
    if (!loaded()) return
    setEditing(true)
    iframe?.contentWindow?.postMessage({ type: "ds-edit-on" }, "*")
  }
  /* 直接取消：不弹确认（原生 confirm 在嵌入场景被静默拦截 → 按钮无响应）；丢弃内存暂存并退出编辑态 */
  const doCancelEdit = () => {
    if (pubState() === "busy") return
    iframe?.contentWindow?.postMessage({ type: "ds-discard" }, "*")
    iframe?.contentWindow?.postMessage({ type: "ds-edit-off" }, "*")
    setEditing(false)
    setDirty(false)
    setStagedCount(0)
    setPubState("idle")
    setPubMsg("")
    window.clearTimeout(pubTimer)
  }
  const pubLabel = () => {
    if (pubState() === "busy") return "发布中..."
    return "确认发布"
  }

  onMount(() => {
    window.addEventListener("message", onMessage)
    window.addEventListener("beforeunload", onBeforeUnload)
    /* 守卫直查（不走列表页缓存，防陈旧）：通过才放行数据流；失败/非管理员 → 静默回查看页 */
    void checkIsAdmin().then((ok) => {
      if (ok) setAdminOk(true)
      else navigate(`/design-system/${id()}`, { replace: true })
    })
  })
  onCleanup(() => {
    window.removeEventListener("message", onMessage)
    window.removeEventListener("beforeunload", onBeforeUnload)
    window.clearTimeout(pubTimer)
  })

  /* 数据流：id 变化 / 管理员校验放行 → 串行「打点 → 单条详情」（与 detail.tsx 完全一致；
     守卫未通过前不发打点、不拉详情、不加载 iframe，停留在「加载中...」） */
  let aborter: AbortController | undefined
  createEffect(
    on(
      () => [id(), adminOk()] as const,
      ([id, ok]) => {
        if (!ok) return
        aborter?.abort()
        const ctrl = new AbortController()
        aborter = ctrl
        setMeta(null)
        setNotFound(false)
        setDsReady(false)
        setEditing(false)
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
              .dsd-head { box-sizing:border-box; background:#fff; padding:22px 24px 0 40px; height:134px; flex-shrink:0; position:relative; }
              .head-toast { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); z-index:10; display:flex; align-items:center; gap:0; padding:8px 16px; border-radius:8px; background:#fff; box-shadow:0 8px 24px rgba(0,0,0,.14); font-size:14px; line-height:20px; color:#191919; white-space:nowrap; pointer-events:none; animation:headToastIn .18s ease; }
              .head-toast svg { width:14px; height:14px; flex-shrink:0; }
              @keyframes headToastIn { from { opacity:0; transform:translate(-50%,-50%) translateY(-8px); } to { opacity:1; transform:translate(-50%,-50%); } }
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
              .dsd-pub-btn { width:88px; height:32px; padding:0; border-radius:999px; border:0; background:#0A59F7; color:#fff; font-size:14px; font-weight:500; cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; gap:4px; }
              .dsd-pub-btn svg { width:16px; height:16px; flex-shrink:0; }
              .dsd-pub-btn:hover:enabled { background:#3B7BF9; }
              .dsd-pub-btn:disabled { background:#C5CDD8; color:#fff; cursor:not-allowed; }
              .dsd-pub-btn.fail { background:#D92D20; }
              .dsd-pub-discard { width:88px; height:32px; padding:0; border-radius:999px; border:0; background:rgba(25,25,25,0.05); color:#777777; font-size:14px; cursor:pointer; white-space:nowrap; }
              .dsd-pub-discard:hover { color:#191919; background:rgba(25,25,25,0.08); }
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
                {/* 暂存-发布：与作者/调用量行右对齐——初态「编辑」；编辑态「取消 + 确认发布（恒蓝可点）」+ 结果反馈 */}
                <div class="dsd-pub">
                  <Show when={!editing()}>
                    <button class="dsd-pub-btn" disabled={!loaded()} onClick={doStartEdit}><span innerHTML={EDIT_ICON} style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;flex-shrink:0" />编辑</button>
                  </Show>
                  <Show when={editing()}>
                    <>
                      <Show when={pubMsg()}>
                        <span class={`dsd-pub-msg ${pubState() === "fail" ? "err" : ""}`} title={pubMsg()}>{pubMsg()}</span>
                      </Show>
                      <button class="dsd-pub-discard" onClick={doCancelEdit}>取消</button>
                      <button
                        class="dsd-pub-btn"
                        classList={{ fail: pubState() === "fail" }}
                        disabled={pubState() === "busy"}
                        onClick={doPublish}
                      >
                        {pubLabel()}
                      </button>
                    </>
                  </Show>
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
