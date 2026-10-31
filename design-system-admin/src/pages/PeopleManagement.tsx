import { useEffect, useRef, useState } from 'react'
import {
  App,
  AutoComplete,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { api, ApiError } from '../api/client'
import type { SearchUser, WhitelistAccount } from '../types'
import { useRole } from '../components/AuthGuard'

interface FormValues {
  account: string
  nick_name?: string
  role: string
}

/** 角色下拉选项（表格行内与新增弹窗共用；Tag 去外边距以适配 borderless 下拉） */
const ROLE_OPTIONS = [
  { value: 'super', label: <Tag color="purple" style={{ margin: 0 }}>超管</Tag> },
  { value: 'admin', label: <Tag color="blue" style={{ margin: 0 }}>管理员</Tag> },
]

/** 人员管理：白名单账号列表（5 列），写操作（新增/删除）仅 super */
export default function PeopleManagement() {
  const { message } = App.useApp()
  const role = useRole()
  const isSuper = role === 'super'

  const [list, setList] = useState<WhitelistAccount[]>([])
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()

  // 账号联想搜索（外部 API，300ms 防抖 + 超时取消）
  const [options, setOptions] = useState<{ value: string; label: string }[]>([])
  const [searching, setSearching] = useState(false)
  const userMap = useRef<Map<string, SearchUser>>(new Map())
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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
      setOptions([])
      setSearching(false)
      return
    }
    debounceTimer.current = setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current = controller
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      setSearching(true)
      try {
        const data = await api.searchUsers(value.trim(), controller.signal)
        userMap.current.clear()
        data.items.forEach((u) => userMap.current.set(u.account, u))
        setOptions(
          data.items.map((u) => ({
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

  const onSelectUser = (account: string) => {
    const u = userMap.current.get(account)
    if (u?.nickName) form.setFieldValue('nick_name', u.nickName)
  }

  const openCreate = () => {
    form.resetFields()
    form.setFieldsValue({ role: 'admin' })
    setOptions([])
    setModalOpen(true)
  }

  const submit = async () => {
    const values = await form.validateFields()
    try {
      await api.createWhitelist({
        account: values.account.trim(),
        nick_name: values.nick_name,
        role: values.role,
      })
      message.success(`已新增「${values.account}」`)
      setModalOpen(false)
      reload()
    } catch (e) {
      message.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    }
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
        isSuper && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增账号
          </Button>
        )
      }
    >
      <Table rowKey="id" columns={columns} dataSource={list} loading={loading} pagination={false} size="middle" />

      <Modal
        title="新增账号"
        open={modalOpen}
        onOk={submit}
        onCancel={() => setModalOpen(false)}
        okText="新增"
        cancelText="取消"
        forceRender
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="account"
            label="账号"
            rules={[{ required: true, message: '请输入或选择账号' }]}
          >
            <AutoComplete
              options={options}
              onSearch={handleSearch}
              onSelect={onSelectUser}
              placeholder="搜索账号/昵称，或直接输入账号"
              notFoundContent={searching ? '搜索中…' : null}
              allowClear
              filterOption={false}
            />
          </Form.Item>
          <Form.Item name="nick_name" label="昵称">
            <Input placeholder="昵称（选中账号时自动填入，可修改）" allowClear />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
