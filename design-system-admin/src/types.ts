export interface DesignSystemMeta {
  slug: string
  name: string
  desc?: string
  author?: string
  usage?: number
  cover?: string
  default?: boolean
}

export interface DesignSystemItem extends DesignSystemMeta {
  cover_url: string
  /** design-system.json 可直接 fetch 的地址 */
  json_url: string
  /** 创建人 / 最后编辑人（account）及显示名（"昵称 account"，无用户记录时回落 account） */
  created_by: string
  updated_by: string
  created_by_name: string
  updated_by_name: string
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

/** /api/users/search 联想结果 */
export interface SearchUser {
  userID: string
  account: string
  nickName: string
  dept: string[]
}
