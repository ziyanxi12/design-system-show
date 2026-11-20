import { useCallback, useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { api } from '../api/client'
import { authorLabel, type DesignSystemItem } from '../types'
import DesignSystemFormModal, { type FormMode } from '../components/DesignSystemFormModal'
import { useRole } from '../components/AuthGuard'

const fmtSize = (n?: number) =>
  n == null
    ? '—'
    : n < 1024
      ? `${n} B`
      : n < 1048576
        ? `${Math.round(n / 1024)} KB`
        : `${(n / 1048576).toFixed(1)} MB`

export default function DesignSystemList() {
  const { message } = App.useApp()
  const role = useRole()
  const canEdit = role === 'super' || role === 'admin'

  const [items, setItems] = useState<DesignSystemItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [mode, setMode] = useState<FormMode>('create')
  const [current, setCurrent] = useState<DesignSystemItem | null>(null)

  const reload = useCallback(
    (keyword?: string) => {
      const kw = keyword ?? search
      setLoading(true)
      api
        .list(kw)
        .then((r) => setItems(r.items))
        .catch((e) => message.error(e.message))
        .finally(() => setLoading(false))
    },
    [message, search],
  )

  const openCreate = () => {
    setMode('create')
    setCurrent(null)
    setModalOpen(true)
  }
  const openEdit = (it: DesignSystemItem) => {
    setMode('edit')
    setCurrent(it)
    setModalOpen(true)
  }
  const openView = (it: DesignSystemItem) => {
    setMode('view')
    setCurrent(it)
    setModalOpen(true)
  }

  useEffect(() => {
    reload('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const doDelete = async (it: DesignSystemItem) => {
    try {
      await api.remove(it.slug)
      message.success(`已删除「${it.name}」`)
      reload()
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  // 系统级启用/禁用（v4.6）：列表开关乐观更新——点击瞬间翻转样式（开关/置灰/Tag/Tooltip
  // 全部本地即时变化），PATCH 成功后用响应整体替换该行（其余字段顺带刷新），失败回滚翻转前状态；
  // 单飞守卫：在途请求期间忽略同一行的重复点击（替代 loading 禁用，视觉零等待）
  const [toggling, setToggling] = useState<string | null>(null)
  const toggleEnabled = async (it: DesignSystemItem, enabled: boolean) => {
    if (toggling === it.slug) return
    setToggling(it.slug)
    setItems((prev) => prev.map((x) => (x.slug === it.slug ? { ...x, enabled } : x)))
    try {
      const updated = await api.patchMeta(it.slug, { enabled })
      setItems((prev) => prev.map((x) => (x.slug === updated.slug ? updated : x)))
      message.success(`已${enabled ? '启用' : '禁用'}「${it.name}」${enabled ? '' : '（展示端不再可见，数据保留）'}`)
    } catch (e) {
      setItems((prev) => prev.map((x) => (x.slug === it.slug ? { ...x, enabled: !enabled } : x)))
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setToggling(null)
    }
  }

  const columns: ColumnsType<DesignSystemItem> = [
    {
      title: '封面',
      dataIndex: 'cover_url',
      key: 'cover',
      width: 120,
      render: (url: string) => (
        <img
          src={url}
          alt=""
          style={{ width: 96, height: 60, objectFit: 'cover', borderRadius: 8, display: 'block' }}
        />
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, it) => (
        <Space size={6} direction="vertical" style={{ gap: 0 }}>
          <Space size={6}>
            {/* 禁用系统名称置灰（数据保留，开关在「状态」列） */}
            <Typography.Text strong style={it.enabled === false ? { color: '#94a3b8' } : undefined}>
              {name}
            </Typography.Text>
            {it.default ? <Tag color="geekblue">默认</Tag> : null}
            {it.enabled === false && <Tag>已禁用</Tag>}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{it.slug}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '作者',
      dataIndex: 'author',
      key: 'author',
      width: 170,
      // 显示格式 nickName(account)；>2 个只显示前 2 个 +「等N人」，hover Tooltip 展示全量
      render: (v: DesignSystemItem['author']) => {
        if (!Array.isArray(v) || v.length === 0) return '—'
        const all = v.map(authorLabel).filter(Boolean)
        const brief = all.length > 2 ? `${all.slice(0, 2).join('、')} 等${all.length}人` : all.join('、')
        return (
          <Tooltip title={all.join('、')} placement="topLeft">
            <span style={{ cursor: 'default' }}>{brief}</span>
          </Tooltip>
        )
      },
    },
    {
      title: '创建人',
      dataIndex: 'created_by_name',
      key: 'created_by_name',
      width: 140,
      render: (v: string, it) => v || it.created_by || '—',
    },
    { title: '调用量', dataIndex: 'usage', key: 'usage', width: 90 },
    { title: '文件大小', dataIndex: 'file_size', key: 'file_size', width: 100, render: fmtSize },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
    },
    {
      title: '状态',
      key: 'enabled',
      width: 90,
      render: (_, it) => (
        <Tooltip title={it.enabled === false ? '已禁用：展示端不可见（数据保留）' : '已启用：展示端可见'}>
          <Switch
            size="small"
            checked={it.enabled ?? true}
            checkedChildren="启用"
            unCheckedChildren="禁用"
            disabled={!canEdit}
            onChange={(v) => toggleEnabled(it, v)}
          />
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 230,
      render: (_, it) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openView(it)}>
            查看
          </Button>
          {canEdit && (
            <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(it)}>
              编辑
            </Button>
          )}
          {canEdit && (
            <Popconfirm
              title="删除设计系统"
              description={`确认删除「${it.name}」？删除后不可恢复。`}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => doDelete(it)}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card
      title={`设计系统管理（共 ${items.length} 个）`}
      extra={
        <Space>
          <Input.Search
            placeholder="搜索名称/slug/作者"
            allowClear
            style={{ width: 240 }}
            onSearch={(v) => {
              setSearch(v)
              reload(v)
            }}
          />
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增设计系统
            </Button>
          )}
        </Space>
      }
    >
      <Table
        rowKey="slug"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={false}
        size="middle"
      />

      <DesignSystemFormModal
        mode={mode}
        item={current}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => reload()}
      />
    </Card>
  )
}
