import type { AuthorEntry } from '../types'

/**
 * 下拉选项渲染（弹窗作者 + 人员管理共用）：
 * 三列等宽对齐：nickName（弹性）| account（固定列宽）| dept[0] dept[2]（固定右对齐）
 * account 用固定宽度保证跨行纵向对齐（等价 tab 制表位效果）
 */
const ACCOUNT_COL_WIDTH = 120
const DEPT_COL_WIDTH = 110

export function userOption(u: AuthorEntry): { value: string; label: React.ReactNode } {
  const dept = Array.isArray(u.dept) ? u.dept : []
  const deptText = [dept[0], dept[2]].filter(Boolean).join(' ')
  return {
    value: u.account,
    label: (
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {u.nickName || u.account}
        </span>
        <span
          style={{
            width: ACCOUNT_COL_WIDTH,
            flexShrink: 0,
            color: '#94a3b8',
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {u.account}
        </span>
        <span
          style={{
            width: DEPT_COL_WIDTH,
            flexShrink: 0,
            color: '#94a3b8',
            fontSize: 12,
            textAlign: 'right',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {deptText}
        </span>
      </div>
    ),
  }
}
