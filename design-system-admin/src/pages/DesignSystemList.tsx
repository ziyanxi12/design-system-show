import { useCallback, useEffect, useState } from 'react'
import {
  App,
  Button,
  Card,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
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
import type { DesignSystemItem } from '../types'
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
  const isSuper = role === 'super'
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
            <Typography.Text strong>{name}</Typography.Text>
            {it.default ? <Tag color="geekblue">默认</Tag> : null}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{it.slug}</Typography.Text>
        </Space>
      ),
    },
    { title: '作者', dataIndex: 'author', key: 'author', width: 110, render: (v) => v || '—' },
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
          {isSuper && (
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
          {isSuper && (
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
