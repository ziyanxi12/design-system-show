export const API_BASE = import.meta.env.VITE_API_BASE ?? ''

/** 人员搜索服务（/getAccount，直连完整 URL；mock 默认 3090，生产经 .env 覆盖） */
export const ACCOUNT_API_BASE = import.meta.env.VITE_ACCOUNT_API_BASE ?? 'http://localhost:3090'
