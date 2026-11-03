import { useEffect, useRef, useState } from 'react'
import {
  App,
  Button,
  Card,
  Popconfirm,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { api } from '../api/client'
import type { AuthorEntry, WhitelistAccount } from '../types'
import { useRole } from '../components/AuthGuard'

/** 角色下拉选项（表格行内与新增弹窗共用；Tag 去外边距以适配 borderless 下拉） */
const ROLE_OPTIONS = [
  { value: 'super', label: <Tag color="purple" style={{ margin: 0 }}>超管</Tag> },
  { value: 'admin', label: <Tag color="blue" style={{ margin: 0 }}>管理员</Tag> },
]

/** 人员管理：白名单账号列表（5 列）；顶部搜索多选 + 点「增加」批量添加（/getAccount 联想），写操作仅 super */
export default function PeopleManagement() {
  const { message } = App.useApp()
  const role = useRole()
  const isSuper = role === 'super'

  const [list, setList] = useState<WhitelistAccount[]>([])
  const [loading, setLoading] = useState(false)

  // /getAccount 联想搜索（300ms 防抖 + 超时取消）
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  // 当前搜索词：options 只在有搜索词时才有内容（点击/聚焦下拉恒为空白，搜索结果不残留）
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)
  const userMap = useRef<Map<string, AuthorEntry>>(new Map())
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 批量添加：多选攒着，点「增加」批量创建
  const [pendingAccounts, setPendingAccounts] = useState<string[]>([])
  const [adding, setAdding] = useState(false)

  const reload = () => {
    setLoading(true)
    api
      .listWhitelist()
      .then((r) => setList(r.items))
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [])

  const handleSearch = (value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (abortRef.current) abortRef.current.abort()
    if (!value.trim()) {
      setKeyword('')
      setOptions([])
      setSearching(false)
      return
    }
    setKeyword(value.trim())
    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      setSearching(true)
      try {
        const items = await api.searchAccounts(value.trim(), controller.signal)
        // 累积合并（不清空）：多轮搜索选人后，早前选中项的昵称等信息仍可查
        items.forEach((u) => userMap.current.set(u.account, u))
        setOptions(
          items.map((u) => ({
            value: u.account,
            label: `${u.nickName || u.account} · ${u.account}`,
          })),
        )
      } catch {
        setOptions([])
      } finally {
        clearTimeout(timeoutId)
        setSearching(false)
      }
    }, 300)
  }

  /** 批量添加：逐个创建（角色默认 admin，行内下拉可改），已存在计入跳过；完成后清空选择并刷新 */
  const handleBatchAdd = async () => {
    if (!pendingAccounts.length) return
    setAdding(true)
    let added = 0
    let skipped = 0
    for (const account of pendingAccounts) {
      const u = userMap.current.get(account)
      try {
        await api.createWhitelist({
          account,
          nick_name: u?.nickName ?? '',
          role: 'admin',
        })
        added++
      } catch {
        // 账号已存在等校验失败：计入跳过，不打断批次
        skipped++
      }
    }
    message.success(`添加完成：新增 ${added} 个${skipped > 0 ? `，跳过 ${skipped} 个（已存在）` : ''}`)
    setPendingAccounts([])
    setAdding(false)
    if (added > 0) reload()
  }

  const doDelete = async (it: WhitelistAccount) => {
    try {
      await api.deleteWhitelist(it.id)
      message.success(`已删除「${it.account}」`)
      reload()
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  /** 行内修改角色（super）：成功后用服务端返回值就地更新，不整页刷新 */
  const changeRole = async (it: WhitelistAccount, role: string) => {
    try {
      const updated = await api.updateWhitelist(it.id, { role })
      message.success(`已将「${it.account}」的角色更新为${role === 'super' ? '超管' : '管理员'}`)
      setList((prev) => prev.map((x) => (x.id === it.id ? updated : x)))
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const columns: ColumnsType<WhitelistAccount> = [
    {
      title: '账号',
      dataIndex: 'account',
      width: 200,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span>,
    },
    { title: '昵称', dataIndex: 'nick_name', width: 160, render: (v: string | null) => v ?? '—' },
    {
      title: '角色',
      dataIndex: 'role',
      width: 110,
      // super 可行内下拉改角色；普通用户只读展示 Tag
      render: (_, it) =>
        isSuper ? (
          <Select
            size="small"
            variant="borderless"
            value={it.role}
            style={{ width: '100%' }}
            options={ROLE_OPTIONS}
            onChange={(v) => changeRole(it, v)}
          />
        ) : it.role === 'super' ? (
          <Tag color="purple">超管</Tag>
        ) : (
          <Tag color="blue">管理员</Tag>
        ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (v: number | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, it) =>
        isSuper ? (
          <Popconfirm
            title="删除账号"
            description={`确认删除「${it.account}」？`}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
            onConfirm={() => doDelete(it)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        ) : (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            —
          </Typography.Text>
        ),
    },
  ]

  return (
    <Card
      title={`人员管理（共 ${list.length} 个）`}
      extra={
        isSuper ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Select
              mode="multiple"
              value={pendingAccounts}
              options={keyword ? options : []}
              onSearch={handleSearch}
              onChange={(vals) => {
                setPendingAccounts(vals as string[])
                // 选中/取消后清空搜索结果，不残留（输入框已被 antd 清空，等待下一次输入）
                setKeyword('')
                setOptions([])
              }}
              placeholder="搜索并选择要添加的用户（可多选）"
              notFoundContent={
                searching ? '搜索中…' : keyword ? `未找到「${keyword}」相关成员` : null
              }
              filterOption={false}
              style={{ width: 300 }}
              allowClear
              disabled={adding}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={adding}
              disabled={!pendingAccounts.length}
              onClick={handleBatchAdd}
            >
              增加
            </Button>
          </div>
        ) : undefined
      }
    >
      <Table rowKey="id" columns={columns} dataSource={list} loading={loading} pagination={false} size="middle" />
    </Card>
  )
}
