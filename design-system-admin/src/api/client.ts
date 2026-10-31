/**
 * 统一 API 客户端（直连后端，无 mock 层）。
 * 请求头与 lib-resource-ui 一致（octo-vs-token + AES 加密的 X-User-Data），
 * BASE 由 VITE_API_BASE 指定（同域 /aaa 反代，dev 经 vite proxy → lib-resource-service）。
 */
import { API_BASE } from '../config'
import { ApiError } from './errors'
import { getEncryptedUserData } from '../utils/auth'
import type {
  DesignSystemItem,
  DesignSystemListResp,
  DesignSystemMeta,
  OperationLog,
  OperationLogsParams,
  OperationLogsResp,
  SearchUser,
  WhitelistAccount,
  WhitelistListResp,
} from '../types'

const VS_TOKEN = 'octo_vs_7e91e862389139bab49247ba2550f366'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) }
  headers['octo-vs-token'] = VS_TOKEN
  try {
    const encrypted = await getEncryptedUserData()
    if (encrypted) headers['X-User-Data'] = encrypted
  } catch {
    /* ignore */
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers, credentials: 'include' })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  /** api1：设计系统列表（含个数）；search 命中 name/slug/author */
  list(search?: string): Promise<DesignSystemListResp> {
    const q = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    return request<DesignSystemListResp>(`/api/design-systems${q}`)
  },

  /**
   * 上传 design-system.json；meta 为卡片字段覆盖（name/author/usage/cover/default），
   * coverFile 可选自定义封面（jpg/png/webp ≤2MB），不上传则走 JSON/默认封面。
   */
  create(
    file: File,
    meta: Partial<DesignSystemMeta>,
    coverFile?: File | null,
  ): Promise<DesignSystemItem> {
    const fd = new FormData()
    fd.append('file', file)
    if (meta.name !== undefined) fd.append('name', meta.name)
    if (meta.desc !== undefined) fd.append('desc', meta.desc ?? '')
    if (meta.author !== undefined) fd.append('author', meta.author ?? '')
    if (meta.usage !== undefined) fd.append('usage', String(meta.usage))
    if (meta.default !== undefined) fd.append('default', String(meta.default))
    if (coverFile) fd.append('cover_file', coverFile)
    return request<DesignSystemItem>('/api/design-systems', { method: 'POST', body: fd })
  },

  getJson(slug: string): Promise<unknown> {
    return request<unknown>(`/api/design-systems/${slug}/json`)
  },

  /**
   * 编辑卡片 meta；改为 multipart：不上传 coverFile 则保留现有封面。
   * 界面不提供调用量编辑入口（usage 仅作 API 修正通道，故此处不传 usage）。
   */
  patchMeta(
    slug: string,
    patch: Partial<DesignSystemMeta>,
    coverFile?: File | null,
  ): Promise<DesignSystemItem> {
    const fd = new FormData()
    if (patch.name !== undefined) fd.append('name', patch.name)
    if (patch.desc !== undefined) fd.append('desc', patch.desc ?? '')
    if (patch.author !== undefined) fd.append('author', patch.author ?? '')
    if (patch.default !== undefined) fd.append('default', String(patch.default))
    if (coverFile) fd.append('cover_file', coverFile)
    return request<DesignSystemItem>(`/api/design-systems/${slug}`, { method: 'PATCH', body: fd })
  },

  putJson(slug: string, file: File): Promise<DesignSystemItem> {
    const fd = new FormData()
    fd.append('file', file)
    return request<DesignSystemItem>(`/api/design-systems/${slug}/json`, { method: 'PUT', body: fd })
  },

  async remove(slug: string): Promise<void> {
    await request<{ detail: string }>(`/api/design-systems/${slug}`, { method: 'DELETE' })
  },

  /** 调用量自增（契约 7 号接口）：调用方显式调用，管理台 UI 不触发 */
  incrementUsage(slug: string): Promise<{ slug: string; usage: number }> {
    return request<{ slug: string; usage: number }>(`/api/design-systems/${slug}/usage`, {
      method: 'POST',
    })
  },

  /** 操作记录：固定 target_type ∈ (design_system, ds_whitelist)，id 倒序分页 */
  getOperationLogs(params: OperationLogsParams): Promise<OperationLogsResp> {
    const q = new URLSearchParams()
    q.set('page', String(params.page))
    q.set('limit', String(params.limit))
    if (params.action) q.set('action', params.action)
    if (params.target_type) q.set('target_type', params.target_type)
    return request<OperationLogsResp>(`/api/design-systems/operation-logs?${q.toString()}`)
  },

  // ─────────────── 设计系统白名单 ───────────────

  /** 白名单校验（登录后 AuthGuard 调用；设计系统专属白名单，与 lib-resource 原白名单隔离） */
  checkWhitelist(
    account: string,
  ): Promise<{ allowed: boolean; role: string | null; nick_name: string | null }> {
    return request(`/api/design-systems/whitelist/check?account=${encodeURIComponent(account)}`)
  },

  listWhitelist(search?: string, isActive?: number): Promise<WhitelistListResp> {
    const q = new URLSearchParams()
    if (search && search.trim()) q.set('search', search.trim())
    if (isActive !== undefined && isActive !== null) q.set('is_active', String(isActive))
    return request<WhitelistListResp>(`/api/design-systems/whitelist?${q.toString()}`)
  },

  createWhitelist(body: {
    account: string
    nick_name?: string
    remark?: string
    role: string
  }): Promise<WhitelistAccount> {
    return request<WhitelistAccount>('/api/design-systems/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },

  updateWhitelist(
    id: number,
    body: { nick_name?: string; remark?: string; role?: string; is_active?: number },
  ): Promise<WhitelistAccount> {
    return request<WhitelistAccount>(`/api/design-systems/whitelist/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  },

  deleteWhitelist(id: number): Promise<{ detail: string }> {
    return request<{ detail: string }>(`/api/design-systems/whitelist/${id}`, { method: 'DELETE' })
  },

  // ─────────────── 用户联想搜索（复用 lib-resource-service /api/users/search） ───────────────

  searchUsers(keyword: string, signal?: AbortSignal): Promise<{ items: SearchUser[] }> {
    const headers: Record<string, string> = {}
    const token = localStorage.getItem('uiplusToken')
    if (token) headers['uiplusToken'] = token
    return request<{ items: SearchUser[] }>(
      `/api/users/search?keyword=${encodeURIComponent(keyword)}`,
      { headers, signal },
    )
  },
}

export { ApiError }

// 仅用于消除「未使用类型」告警的操作记录引用保留
export type { OperationLog }
