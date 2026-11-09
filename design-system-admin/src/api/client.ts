/**
 * 统一 API 客户端（直连后端，无 mock 层）。
 * 请求头与 lib-resource-ui 一致（octo-vs-token + AES 加密的 X-User-Data），
 * BASE 由 VITE_API_BASE 指定（同域 /aaa 反代，dev 经 vite proxy → lib-resource-service）。
 */
import { ACCOUNT_API_BASE, API_BASE } from '../config'
import { ApiError } from './errors'
import { expireLogout, getEncryptedUserData } from '../utils/auth'
import type {
  AuthorEntry,
  DesignSystemItem,
  DesignSystemListResp,
  DesignSystemMeta,
  OperationLog,
  OperationLogsParams,
  OperationLogsResp,
  StatsDeptShareResp,
  StatsGranularity,
  StatsMetric,
  StatsSummaryResp,
  StatsTrendResp,
  StatsUsersResp,
  WhitelistAccount,
  WhitelistListResp,
} from '../types'
import type { ZipParseResult } from './zipTypes'

const VS_TOKEN = 'octo_vs_7e91e862389139bab49247ba2550f366'

/** 统计接口查询串（跳过空参数） */
function statsQs(params: Record<string, string | undefined>): string {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v) usp.set(k, v) })
  return usp.toString()
}

/** zip 上传上限与分片阈值（对齐 api.md 契约） */
export const MAX_ZIP_BYTES = 200 * 1024 * 1024
export const CHUNK_THRESHOLD_BYTES = 20 * 1024 * 1024
export const CHUNK_SIZE_BYTES = 5 * 1024 * 1024

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
  if (res.status === 401 || res.status === 403) {
    // 登录过期（后端 DS_LOGIN_TTL_HOURS 校验 loginTime 超时返回 401）或无权限：
    // 清除登录态并跳登录页，重新登录后获得新的 loginTime
    expireLogout()
    throw new ApiError(res.status, '登录已过期，请重新登录')
  }
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

// ─────────────── zip 上传（直传 / 分片统一流程） ───────────────

const fmtMB = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`

interface UploadOptions {
  coverFile?: File | null
  iconFile?: File | null
  authors?: AuthorEntry[]
}

/** 组装 meta 表单字段（create 与 complete 共用） */
function appendMetaFields(fd: FormData, meta: Partial<DesignSystemMeta>, options?: UploadOptions) {
  if (meta.name !== undefined) fd.append('name', meta.name)
  if (meta.desc !== undefined) fd.append('desc', meta.desc ?? '')
  if (meta.usage !== undefined) fd.append('usage', String(meta.usage))
  if (meta.default !== undefined) fd.append('default', String(meta.default))
  if (options?.authors) fd.append('author', JSON.stringify(options.authors))
  if (options?.coverFile) fd.append('cover_file', options.coverFile)
  if (options?.iconFile) fd.append('icon_file', options.iconFile)
}

/** multipart 直传（≤20MB；create 走 POST，重传走 PUT /{slug}/json） */
async function directUpload(
  file: File,
  meta: Partial<DesignSystemMeta>,
  options: UploadOptions | undefined,
  reuploadSlug: string | null,
): Promise<DesignSystemItem> {
  const fd = new FormData()
  fd.append('file', file)
  appendMetaFields(fd, meta, reuploadSlug ? undefined : options)
  const url = reuploadSlug ? `/api/design-systems/${reuploadSlug}/json` : '/api/design-systems'
  console.log(`[zip-upload] 直传 ${file.name}（${fmtMB(file.size)}）→ ${reuploadSlug ? '重传 ' + reuploadSlug : '新增'}`)
  const item = await request<DesignSystemItem>(url, { method: reuploadSlug ? 'PUT' : 'POST', body: fd })
  console.log(`[zip-upload] 直传成功 slug=${item.slug} source_slug=${item.source_slug ?? '—'}`)
  return item
}

/**
 * 分片上传（>20MB）：POST /uploads/init → PUT /uploads/{id}/chunks/{i}（5MB/片）
 * → POST /uploads/{id}/complete（meta 表单；slug 字段提供时为重传模式）。
 * 每片打印进度日志；失败打印错误并中止。
 */
async function chunkedUpload(
  file: File,
  meta: Partial<DesignSystemMeta>,
  options: UploadOptions | undefined,
  reuploadSlug: string | null,
): Promise<DesignSystemItem> {
  const t0 = performance.now()
  console.log(`[zip-upload] 文件 ${fmtMB(file.size)} 超过 20MB，启用分片上传（每片 5MB）`)
  const init = await request<{ upload_id: string; chunk_size: number; chunk_count: number }>(
    '/api/design-systems/uploads/init',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, size: file.size }),
    },
  )
  console.log(`[zip-upload] 会话已创建 upload_id=${init.upload_id}，共 ${init.chunk_count} 片`)

  let uploadedBytes = 0
  for (let index = 0; index < init.chunk_count; index++) {
    const start = index * init.chunk_size
    const blob = file.slice(start, Math.min(start + init.chunk_size, file.size))
    const res = await fetch(
      `${API_BASE}/api/design-systems/uploads/${init.upload_id}/chunks/${index}`,
      {
        method: 'PUT',
        headers: {
          'octo-vs-token': VS_TOKEN,
          'Content-Type': 'application/octet-stream',
          ...(await authHeaders()),
        },
        body: blob,
        credentials: 'include',
      },
    )
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const body = await res.json()
        if (body && typeof body.detail === 'string') detail = body.detail
      } catch {
        /* ignore */
      }
      console.error(`[zip-upload] 第 ${index + 1}/${init.chunk_count} 片上传失败：${detail}`)
      throw new ApiError(res.status, `分片上传失败（第 ${index + 1} 片）：${detail}`)
    }
    uploadedBytes += blob.size
    console.log(
      `[zip-upload] chunk ${index + 1}/${init.chunk_count} ok（${fmtMB(blob.size)}，总进度 ${Math.round((uploadedBytes / file.size) * 100)}%）`,
    )
  }

  const fd = new FormData()
  appendMetaFields(fd, meta, reuploadSlug ? undefined : options)
  if (reuploadSlug) fd.append('slug', reuploadSlug)
  const item = await request<DesignSystemItem>(`/api/design-systems/uploads/${init.upload_id}/complete`, {
    method: 'POST',
    body: fd,
  })
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  console.log(`[zip-upload] 分片上传成功（${secs}s）slug=${item.slug} source_slug=${item.source_slug ?? '—'}`)
  return item
}

/** 分片请求的鉴权头（octo-vs-token + X-User-Data；直传由 request() 统一处理） */
async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  try {
    const encrypted = await getEncryptedUserData()
    if (encrypted) headers['X-User-Data'] = encrypted
  } catch {
    /* ignore */
  }
  return headers
}

/** zip 上传统一入口：>20MB 自动分片；重传（reuploadSlug）时管理字段由后端保留 */
async function uploadZipFlow(
  file: File,
  meta: Partial<DesignSystemMeta>,
  options: UploadOptions | undefined,
  reuploadSlug: string | null,
): Promise<DesignSystemItem> {
  try {
    const result =
      file.size > CHUNK_THRESHOLD_BYTES
        ? await chunkedUpload(file, meta, options, reuploadSlug)
        : await directUpload(file, meta, options, reuploadSlug)
    return result
  } catch (e) {
    console.error('[zip-upload] 上传失败：', e instanceof Error ? e.message : e)
    throw e
  }
}

export const api = {
  /** api1：设计系统列表（含个数）；search 命中 name/slug/author */
  list(search?: string): Promise<DesignSystemListResp> {
    const q = search && search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''
    return request<DesignSystemListResp>(`/api/design-systems${q}`)
  },

  /**
   * 上传设计系统 zip 包（服务端解压解析为 design-system.json）；
   * meta 为卡片字段覆盖（name/desc/default），authors 为作者数组（users 表自动补全昵称/部门），
   * coverFile / iconFile 可选自定义封面 / 图标（≤2MB）。
   *
   * 日志：每个阶段 console.log / console.error（需求要求：前端打印上传日志）。
   * >20MB 自动走分片上传（init → chunks → complete），≤20MB multipart 直传。
   */
  create: async function (
    file: File,
    meta: Partial<DesignSystemMeta>,
    options?: { coverFile?: File | null; iconFile?: File | null; authors?: AuthorEntry[] },
  ): Promise<DesignSystemItem> {
    return uploadZipFlow(file, meta, options, null)
  },

  /** zip 解析预览：md 转 json + assets 树扫描结果（不落库），ZipParsePage 数据源 */
  parseZip(file: File, signal?: AbortSignal): Promise<ZipParseResult> {
    const fd = new FormData()
    fd.append('file', file)
    return request<ZipParseResult>('/api/design-systems/parse', { method: 'POST', body: fd, signal })
  },

  getJson(slug: string): Promise<unknown> {
    return request<unknown>(`/api/design-systems/${slug}/json`)
  },

  /**
   * 编辑卡片 meta；multipart：不上传文件则保留现有封面/图标。
   * authors 为作者数组（JSON 字符串提交，users 表自动补全）；调用量仅 API 修正通道，界面不提供入口。
   */
  patchMeta(
    slug: string,
    patch: Partial<DesignSystemMeta>,
    options?: { coverFile?: File | null; iconFile?: File | null; authors?: AuthorEntry[] },
  ): Promise<DesignSystemItem> {
    const fd = new FormData()
    if (patch.name !== undefined) fd.append('name', patch.name)
    if (patch.desc !== undefined) fd.append('desc', patch.desc ?? '')
    if (patch.author !== undefined) {
      fd.append('author', JSON.stringify(patch.author))
    } else if (options?.authors) {
      fd.append('author', JSON.stringify(options.authors))
    }
    if (patch.default !== undefined) fd.append('default', String(patch.default))
    if (options?.coverFile) fd.append('cover_file', options.coverFile)
    if (options?.iconFile) fd.append('icon_file', options.iconFile)
    return request<DesignSystemItem>(`/api/design-systems/${slug}`, { method: 'PATCH', body: fd })
  },

  /** zip 重传覆盖（≤20MB 直传 PUT，>20MB 自动分片 complete 的 slug 重传模式；语义一致） */
  putJson(slug: string, file: File): Promise<DesignSystemItem> {
    return uploadZipFlow(file, {}, undefined, slug)
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

  // ─────────────── 打点统计（契约 10 号接口组，数据统计页） ───────────────

  /** 左表：每系统 预览数/调用量/使用人数/最近调用时间 + 全局汇总行 */
  getStatsSummary(params: { start?: string; end?: string; search?: string }): Promise<StatsSummaryResp> {
    return request<StatsSummaryResp>(`/api/design-systems/stats/summary?${statsQs(params)}`)
  },

  /** 条形图：时间桶（天/周/月）× 一层部门 */
  getStatsTrend(params: {
    metric: StatsMetric
    granularity: StatsGranularity
    start?: string
    end?: string
  }): Promise<StatsTrendResp> {
    return request<StatsTrendResp>(
      `/api/design-systems/stats/trend?${new URLSearchParams({ metric: params.metric, granularity: params.granularity, ...(params.start ? { start: params.start } : {}), ...(params.end ? { end: params.end } : {}) }).toString()}`,
    )
  },

  /** 扇形图：一层部门占比 */
  getStatsDeptShare(params: { metric: StatsMetric; start?: string; end?: string }): Promise<StatsDeptShareResp> {
    const { metric, ...rest } = params
    return request<StatsDeptShareResp>(`/api/design-systems/stats/dept-share?${statsQs({ metric, ...rest })}`)
  },

  /** 人员统计表（9 列） */
  getStatsUsers(params: { start?: string; end?: string; search?: string }): Promise<StatsUsersResp> {
    return request<StatsUsersResp>(`/api/design-systems/stats/users?${statsQs(params)}`)
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

  // ─────────────── 人员搜索（/getAccount，直连 mock 服务） ───────────────

  /**
   * 人员联想搜索（GET /getAccount?keyword=，服务要求 uiplusToken 头）。
   * 返回完整人员信息（id/userID/account/nickName/dept），与 AuthorEntry 同构——
   * 作者与白名单新增共用此数据源，选中即得完整值。
   */
  searchAccounts: async (keyword: string, signal?: AbortSignal): Promise<AuthorEntry[]> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // mock 服务仅校验 header 非空；真实环境替换为登录 token（localStorage.uiplusToken）
      uiplusToken: localStorage.getItem('uiplusToken') || 'octo-demo',
    }
    const res = await fetch(
      `${ACCOUNT_API_BASE}/getAccount?keyword=${encodeURIComponent(keyword)}`,
      { headers, signal },
    )
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
    const body = (await res.json()) as {
      success: boolean
      content: Record<string, AuthorEntry[]> | null
    }
    if (!body.success) {
      throw new ApiError(500, '人员搜索失败')
    }
    // content 的 key 为 keyword 原样回显
    return body.content?.[keyword] ?? []
  },
}

export { ApiError }

// 仅用于消除「未使用类型」告警的操作记录引用保留
export type { OperationLog }
