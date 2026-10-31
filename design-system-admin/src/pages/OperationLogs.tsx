import { useEffect, useState } from 'react'
import { Card, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { api } from '../api/client'
import type { OperationLog } from '../types'

const ACTION_OPTIONS = [
  { value: 'create', label: 'create' },
  { value: 'update_meta', label: 'update_meta' },
  { value: 'update', label: 'update' },
  { value: 'reupload', label: 'reupload' },
  { value: 'delete', label: 'delete' },
]

const TARGET_OPTIONS = [
  { value: 'design_system', label: '设计系统' },
  { value: 'ds_whitelist', label: '人员管理' },
]

const ACTION_COLOR: Record<string, string> = {
  create: 'green',
  update_meta: 'blue',
  update: 'blue',
  reupload: 'gold',
  delete: 'red',
}

const TARGET_LABEL: Record<string, string> = {
  design_system: '设计系统',
  ds_whitelist: '人员管理',
}

export default function OperationLogs() {
  const [items, setItems] = useState<OperationLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [action, setAction] = useState<string | undefined>(undefined)
  const [targetType, setTargetType] = useState<string | undefined>(undefined)

  const load = (p = page, l = limit) => {
    setLoading(true)
    api
      .getOperationLogs({ page: p, limit: l, action, target_type: targetType })
      .then((r) => {
        setItems(r.items)
        setTotal(r.total)
        setPage(r.page)
        setLimit(r.limit)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, targetType])

  const columns: ColumnsType<OperationLog> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (v: number | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '—'),
    },
    {
      title: '操作人',
      key: 'operator',
      width: 180,
      render: (_, it) => (
        <Space direction="vertical" style={{ gap: 0 }}>
          <Typography.Text>{it.operator || '—'}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {it.operator_account || ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      width: 120,
      render: (v: string) => <Tag color={ACTION_COLOR[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '对象类型',
      dataIndex: 'target_type',
      key: 'target_type',
      width: 110,
      render: (v: string) => TARGET_LABEL[v] || v,
    },
    {
      title: '对象',
      key: 'target',
      render: (_, it) => it.target_name || (it.target_id != null ? `#${it.target_id}` : '—'),
    },
    {
      title: '详情',
      dataIndex: 'detail',
      key: 'detail',
      width: 80,
      render: (v) =>
        v ? (
          <Tooltip
            title={<pre style={{ margin: 0, fontSize: 12, maxHeight: 300, overflow: 'auto' }}>{JSON.stringify(v, null, 2)}</pre>}
          >
            <Typography.Link style={{ fontSize: 12 }}>查看</Typography.Link>
          </Tooltip>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Card
      title={`操作记录（共 ${total} 条）`}
      extra={
        <Space>
          <Select
            allowClear
            placeholder="对象类型"
            style={{ width: 140 }}
            options={TARGET_OPTIONS}
            value={targetType}
            onChange={(v) => setTargetType(v)}
          />
          <Select
            allowClear
            placeholder="动作"
            style={{ width: 150 }}
            options={ACTION_OPTIONS}
            value={action}
            onChange={(v) => setAction(v)}
          />
        </Space>
      }
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        size="middle"
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50, 100],
          onChange: (p, l) => load(p, l),
          showTotal: (t) => `共 ${t} 条`,
        }}
      />
    </Card>
  )
}
