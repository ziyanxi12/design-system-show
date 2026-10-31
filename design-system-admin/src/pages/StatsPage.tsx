import { memo, useEffect, useMemo, useState } from 'react'
import { Card, Col, Empty, Row, Spin, Statistic, Typography } from 'antd'
import { Pie } from '@ant-design/charts'
import { api } from '../api/client'
import type { DesignSystemItem } from '../types'

const PieChart = memo(({ data }: { data: Array<{ name: string; usage: number }> }) => {
  const config = useMemo(
    () => ({
      data,
      angleField: 'usage',
      colorField: 'name',
      label: {
        text: (d: { name: string; usage: number }, _i: number, all: { usage: number }[]) => {
          const t = all.reduce((s, x) => s + x.usage, 0)
          return t > 0 ? `${((d.usage / t) * 100).toFixed(1)}%` : '0%'
        },
        position: 'outside' as const,
      },
      legend: { color: { title: false, position: 'right' as const, rowPadding: 5 } },
      tooltip: {
        items: [(d: { name: string; usage: number }) => ({ name: d.name, value: d.usage.toLocaleString() })],
      },
      radius: 0.75,
      height: 360,
    }),
    [data],
  )
  return <Pie {...config} />
})

export default function StatsPage() {
  const [items, setItems] = useState<DesignSystemItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .list()
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false))
  }, [])

  const totalUsage = useMemo(() => items.reduce((s, it) => s + (it.usage ?? 0), 0), [items])
  const pieData = useMemo(
    () => items.map((it) => ({ name: it.name, usage: it.usage ?? 0 })),
    [items],
  )
  const allZero = pieData.length > 0 && pieData.every((d) => d.usage === 0)

  return (
    <Spin spinning={loading}>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="设计系统总数" value={items.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="总调用量" value={totalUsage} />
          </Card>
        </Col>
      </Row>

      <Card title="调用量分布" style={{ marginTop: 16 }}>
        {pieData.length === 0 ? (
          <Empty description="暂无设计系统数据" />
        ) : allZero ? (
          <Empty description="所有设计系统调用量均为 0，暂无分布可展示" />
        ) : (
          <PieChart data={pieData} />
        )}
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          数据来源：GET /api/design-systems；调用量由调用方显式自增（接口 7）。
        </Typography.Text>
      </Card>
    </Spin>
  )
}
