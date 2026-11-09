export interface DesignSystemMeta {
  slug: string
  name: string
  desc?: string
  author?: string | AuthorEntry[]
  usage?: number
  cover?: string
  default?: boolean
}

/** 作者条目（API 的 author 数组元素；为 /getAccount 返回的完整值，驼峰原样存储） */
export interface AuthorEntry {
  id?: number | null
  userID?: string | null
  account: string
  nickName?: string | null
  /** 部门（最多 4 级数组） */
  dept?: string[] | null
}

/** 作者显示标签：两者都有 → nickName(account)；缺一只显示有的那个 */
export function authorLabel(a: AuthorEntry): string {
  if (a.nickName && a.account) return `${a.nickName}(${a.account})`
  return (a.nickName || a.account || '').trim()
}

export interface DesignSystemItem extends DesignSystemMeta {
  author: AuthorEntry[]
  /** DESIGN.md frontmatter 的 id 原样保留（不唯一，允许重复；展示/搜索/追溯） */
  source_slug?: string | null
  cover_url: string
  /** 图标相对路径（null=未自定义，走内置默认图标） */
  icon?: string | null
  /** 图标完整 URL（服务端对未自定义的回落内置默认图标，恒有值） */
  icon_url: string
  /** design-system.json 可直接 fetch 的地址 */
  json_url: string
  /** DESIGN.md 原件可下载地址（zip 内提取件；旧数据可能为 null） */
  design_md_url?: string | null
  /** zip 原件可下载地址（source.zip） */
  zip_url?: string | null
  /** 附件（DESIGN.md 同级任意 .zip，保留原文件名）完整下载链接（zip 内无则 null） */
  skill_zip_url?: string | null
  /** 技能名（附件 zip 第一层 SKILL.md frontmatter 的 name；无附件为 null） */
  skill_name?: string | null
  /** 创建人 / 最后编辑人（account）及显示名（"昵称 account"，无用户记录时回落 account） */
  created_by: string
  updated_by: string
  created_by_name: string
  updated_by_name: string
  /** 上传 zip 原件大小（旧数据为 MD 大小） */
  file_size?: number
  updated_at: string
}

export interface DesignSystemListResp {
  count: number
  items: DesignSystemItem[]
}

export const BUILTIN_COVERS = ['cover-blue.jpg', 'cover-cyan.jpg', 'cover-purple.jpg', 'cover-violet.jpg'] as const
export const DEFAULT_COVER = 'cover-cyan.jpg'

/** 设计系统白名单账号 */
export interface WhitelistAccount {
  id: number
  account: string
  nick_name: string | null
  remark: string | null
  /** super=超管 admin=管理员 */
  role: 'super' | 'admin' | string
  /** 1=启用 0=禁用 */
  is_active: number
  created_at?: number | null
  updated_at?: number | null
}

export interface WhitelistListResp {
  items: WhitelistAccount[]
}

/** 操作记录 */
export interface OperationLog {
  id: number
  source_id?: number | null
  resource_type?: number | null
  operator: string
  operator_account: string
  action: string
  target_type: string
  target_id?: number | null
  target_name?: string | null
  detail?: Record<string, unknown> | null
  /** epoch 毫秒 */
  created_at?: number | null
}

export interface OperationLogsResp {
  items: OperationLog[]
  total: number
  page: number
  limit: number
}

export interface OperationLogsParams {
  page: number
  limit: number
  action?: string
  target_type?: string
}

// ─────────────── 打点统计（数据统计页，契约 10 号接口组） ───────────────

export type StatsMetric = 'view' | 'usage' | 'users'
export type StatsGranularity = 'day' | 'week' | 'month'

export interface StatsSummaryItem {
  slug: string
  name: string
  views: number
  usage: number
  users: number
  last_at: string | null
}

export interface StatsSummaryResp {
  start: string | null
  end: string | null
  total: { views: number; usage: number; users: number; last_at: string | null }
  items: StatsSummaryItem[]
}

export interface StatsTrendResp {
  metric: StatsMetric
  granularity: StatsGranularity
  start: string | null
  end: string | null
  /** 扁平行：时间桶 × 一层部门（dept1 为空 = 匿名/未知），前端透视为堆叠柱状图 */
  buckets: { date: string; dept1: string; value: number }[]
}

export interface StatsDeptShareResp {
  metric: StatsMetric
  start: string | null
  end: string | null
  items: { dept1: string; value: number }[]
}

export interface StatsUserItem {
  account: string
  nick_name: string
  last_at: string | null
  views: number
  usage: number
  dept1: string
  dept2: string
  dept3: string
  dept4: string
}

export interface StatsUsersResp {
  start: string | null
  end: string | null
  total: number
  items: StatsUserItem[]
}
