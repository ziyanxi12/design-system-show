import { BUILTIN_COVERS, DEFAULT_COVER, type DesignSystemMeta } from '../types'

export const MAX_JSON_BYTES = 10 * 1024 * 1024
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const REQUIRED_SECTIONS = ['color', 'typography', 'spacing', 'radius', 'shadow'] as const

export function validateDesignSystemJson(data: unknown): string[] {
  const errors: string[] = []
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return ['文件内容不是 JSON 对象']
  }
  const obj = data as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!id) {
    errors.push('缺少 id 字段（作为系统唯一标识 slug）')
  } else if (!SLUG_RE.test(id)) {
    errors.push(`id「${id}」格式非法：仅允许小写字母、数字、连字符，且以字母或数字开头`)
  }
  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    errors.push('缺少 name 字段或为空')
  }
  const hasSection = REQUIRED_SECTIONS.some((k) => typeof obj[k] === 'object' && obj[k] !== null)
  if (!hasSection) {
    errors.push(`缺少可展示的 token 区块（${REQUIRED_SECTIONS.join(' / ')} 至少一项）`)
  }
  return errors
}

export function normalizeCover(cover: unknown): string {
  return typeof cover === 'string' && (BUILTIN_COVERS as readonly string[]).includes(cover)
    ? cover
    : DEFAULT_COVER
}

/** 从 design-system.json 派生卡片 meta（管理字段可在表单里覆盖） */
export function extractMeta(data: Record<string, unknown>): DesignSystemMeta {
  const meta = (typeof data.meta === 'object' && data.meta !== null ? data.meta : {}) as Record<string, unknown>
  return {
    slug: String(data.id ?? ''),
    name: String(data.name ?? ''),
    desc: typeof meta.desc === 'string' ? meta.desc : '',
    author: typeof meta.author === 'string' ? meta.author : '',
    usage: typeof meta.usage === 'number' ? meta.usage : 0,
    cover: normalizeCover(data.cover),
    default: false,
  }
}
