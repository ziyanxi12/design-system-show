import { createSignal, createMemo, For, Show } from "solid-js"
import type { JSX } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { DS_REGISTRY, type DsEntry } from "./data"
import DesignSystemDetail from "./detail"

function SearchIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" style="color:rgba(0,0,0,0.6);flex-shrink:0">
      <path
        d="M16.8497 13.2955C17.4747 12.1122 17.8288 10.7622 17.8288 9.32884C17.8288 4.63717 14.0247 0.833008 9.32884 0.833008C4.63717 0.833008 0.833008 4.63717 0.833008 9.32884C0.833008 14.0247 4.63717 17.8288 9.32884 17.8288C11.6788 17.8288 13.808 16.8788 15.3455 15.3372L18.9538 18.9538"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="1.5"
      />
    </svg>
  )
}

function UsageIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" style="color:#777777;flex-shrink:0">
      <path
        d="M10.9375 6.98558C10.9375 8.38936 10.1975 9.62093 9.08492 10.3142L9.08456 11.7112C9.08456 11.969 8.87562 12.1779 8.61789 12.1779L5.38211 12.1779C5.12438 12.1779 4.91544 11.969 4.91544 11.7112L4.91508 10.3142C3.80252 9.62093 3.0625 8.38936 3.0625 6.98558C3.0625 4.81892 4.82538 3.0625 7 3.0625C9.17462 3.0625 10.9375 4.81892 10.9375 6.98558Z"
        fill-rule="evenodd"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="0.875"
      />
      <line x1="4.91552734" x2="9.08464432" y1="13.4472656" y2="13.4472656" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="0.875" />
      <path
        d="M6.99984 0.729492L6.99984 1.45866M11.434 2.56618L10.9184 3.08178M13.2707 7.00033L12.5415 7.00033M0.729004 7.00033L1.45817 7.00033M2.56569 2.56618L3.08129 3.08178"
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="0.875"
      />
    </svg>
  )
}

export default function DesignSystemPage(): JSX.Element {
  const params = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = createSignal("")

  const filtered = createMemo(() => {
    const q = query().toLowerCase().trim()
    if (!q) return DS_REGISTRY
    return DS_REGISTRY.filter((r) => r.meta.name.toLowerCase().includes(q))
  })

  function handleCardClick(item: DsEntry) {
    navigate(`/design-system/${item.id}`)
  }

  return (
    <Show when={!params.id} fallback={<DesignSystemDetail id={params.id} />}>
      <div class="flex-1 overflow-auto" style="background:#fff">
        <style>{`
          .ds-list { padding: 60px 112px 48px; }
          .dl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; max-width: 1396px; }
          .dl-head h1 { font-size: 28px; line-height: 36px; font-weight: 700; color: #191919; margin: 0; }
          .dl-head p { font-size: 14px; line-height: 22px; color: #777777; margin: 0; }
          .dl-actions { display: flex; align-items: center; gap: 12px; }
          .ds-page-search { height: 32px; width: 220px; border-radius: 999px; background: rgba(0,0,0,0.05); display: flex; align-items: center; gap: 6px; padding: 0 12px; color: rgba(0,0,0,0.6); }
          .ds-page-search input { flex: 1; min-width: 0; font-size: 14px; border: none; outline: none; background: transparent; color: inherit; font-family: inherit; padding: 0; }
          .dl-grid { margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fill, 260px); gap: 24px; max-width: 1420px; }
          .ds-card { width: 260px; cursor: pointer; position: relative; background: transparent; border: none; padding: 0; text-align: left; font: inherit; display: block; }
          .ds-card .cover { position: relative; width: 260px; height: 160px; border-radius: 12px; overflow: hidden; background: #E9EEF8; }
          .ds-card .cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .3s; }
          .ds-card:hover .cover img { transform: scale(1.03); }
          .ds-card .cover::after { content: ""; position: absolute; inset: 0; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.04); pointer-events: none; }
          .ds-card .badges { position: absolute; left: 8px; top: 8px; display: flex; gap: 4px; z-index: 1; }
          .ds-card .tag { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 4px; font-size: 12px; line-height: 20px; background: rgba(255,255,255,.92); color: rgba(0,0,0,0.6); }
          .ds-card .tag.brand { background: #0A59F7; color: #fff; }
          .ds-card .name { margin-top: 15px; font-weight: 500; color: #191919; font-size: 14px; line-height: 22px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .ds-card .meta { margin-top: 4px; display: flex; align-items: center; justify-content: space-between; color: #777777; font-size: 14px; line-height: 22px; }
          .ds-card .author { display: flex; align-items: center; gap: 4px; min-width: 0; }
          .ds-card .author img { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
          .ds-card .usage { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
          .dl-empty { margin-top: 80px; text-align: center; color: rgba(0,0,0,0.4); grid-column: 1 / -1; }
        `}</style>

        <div class="ds-list">
          <div class="dl-head">
            <div>
              <h1>设计系统</h1>
              <p>帮助你规范 Octo Design 在生成界面时所使用的风格、组件与布局</p>
            </div>
            <div class="dl-actions">
              <label class="ds-page-search">
                <SearchIcon />
                <input
                  type="text"
                  placeholder="搜索设计系统"
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
              </label>
            </div>
          </div>

          <div class="dl-grid">
            <For each={filtered()}>
              {(item) => (
                <button type="button" class="ds-card" onClick={() => handleCardClick(item)}>
                  <div class="cover">
                    <div class="badges">
                      {item.meta.default && <span class="tag brand">默认</span>}
                    </div>
                    <img src={`/design-systems/${item.meta.cover ?? "cover-cyan.jpg"}`} alt={item.meta.name} />
                  </div>
                  <div class="name" title={item.meta.name}>{item.meta.name}</div>
                  <div class="meta">
                    <span class="author">
                      <img src="/design-systems/avatar-author.png" alt={item.meta.author ?? ""} />
                      {item.meta.author ?? "Octo Agent"}
                    </span>
                    <span class="usage">
                      <UsageIcon />
                      {item.meta.usage ?? 0}
                    </span>
                  </div>
                </button>
              )}
            </For>
            {filtered().length === 0 && (
              <div class="dl-empty">没有找到匹配「{query()}」的设计系统</div>
            )}
          </div>
        </div>
      </div>
    </Show>
  )
}
