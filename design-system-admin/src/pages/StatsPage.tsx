/**
 * 数据统计页（需求：requirement/1.md）
 *
 * 布局：左 1/3 ┃ 右 2/3（右上 1/3 打点分布 + 右下 2/3 人员统计）
 * - 左表：统计范围（日期，全局生效）+ 名称搜索；6 列；首行汇总；预览数/调用量/使用人数可排序
 * - 打点分布：指标切换（预览数/调用量/引用人数）联动 条形图（天/周/月 × 一层部门堆叠）与扇形图（一层部门占比）
 * - 人员统计：9 列（工号/名字/最近调用时间/预览数/调用量/一~四层部门）+ Excel 下载（前端 xlsx 生成）
 */
import { memo, useEffect, useMemo, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Empty, Input, Radio, Row, Segmented, Space, Spin, Table, Tooltip, message,
} from 'antd'
import { DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Column, Pie } from '@ant-design/charts'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import { api } from '../api/client'
import type {
  StatsDeptShareResp, StatsGranularity, StatsMetric, StatsSummaryItem, StatsUserItem, StatsTrendResp,
} from '../types'

const METRIC_OPTIONS: { value: StatsMetric; label: string }[] = [
  { value: 'view', label: '预览数' },
  { value: 'usage', label: '调用量' },
  { value: 'users', label: '引用人数' },
]
const GRANULARITY_OPTIONS: { value: StatsGranularity; label: string }[] = [
  { value: 'day', label: '按天' },
  { value: 'week', label: '按周' },
  { value: 'month', label: '按月' },
]
const UNKNOWN_DEPT = '未知部门'

/** 部门配色（G2 默认色板）：柱状图 / 扇形图 / 自绘图例共用，保证同部门同色 */
const PALETTE = ['#5B8FF9', '#5AD8A6', '#5D7092', '#F6BD16', '#E8684A', '#6DC8EC', '#9270CA', '#FF9D4D', '#269A99', '#FF99C3']

const fmtTime = (s: string | null) => (s ? dayjs(s).format('YYYY-MM-DD HH:mm') : '—')

/* ─────────────── 条形图（柱状形态）：横轴日期、纵轴数量，一层部门堆叠 ─────────────── */
const TrendBar = memo(({ data, deptDomain }: { data: StatsTrendResp['buckets']; deptDomain: string[] }) => {
  const rows = useMemo(
    () => data.map((b) => ({ date: b.date, dept1: b.dept1 || UNKNOWN_DEPT, value: b.value })),
    [data],
  )
  if (!rows.length) return <Empty description="该时间范围内暂无打点数据" style={{ margin: '48px 0' }} />
  return (
    <Column
      data={rows}
      xField="date"
      yField="value"
      colorField="dept1"
      isStack
      height={252}
      scale={{ color: { range: PALETTE, domain: deptDomain } }}
      axis={{ x: { labelAutoHide: true, labelAutoRotate: false } }}
      legend={{ color: { title: false, position: 'right', rowPadding: 4 } }}
      tooltip={{ items: [{ name: (d: { dept1: string }) => d.dept1, value: (d: { value: number }) => d.value }] }}
    />
  )
})

/* ─────────────── 扇形图：一层部门占比（自绘图例置右上角，颜色与扇区一致） ─────────────── */
const DeptPie = memo(({ data, deptDomain }: { data: StatsDeptShareResp['items']; deptDomain: string[] }) => {
  const rows = useMemo(
    () => data.map((i) => ({ dept1: i.dept1 || UNKNOWN_DEPT, value: i.value })),
    [data],
  )
  if (!rows.length || rows.every((d) => d.value === 0)) {
    return <Empty description="该时间范围内暂无打点数据" style={{ margin: '48px 0' }} />
  }
  return (
    <div style={{ position: 'relative' }}>
      {/* 图例：右上角（G2 内置 top-right 在窄容器下不可控，改为自绘，保证位置与配色） */}
      <div
        style={{
          position: 'absolute', top: 0, right: 0, zIndex: 1,
          display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end',
          gap: '2px 10px', maxWidth: '62%', fontSize: 11, lineHeight: '16px',
          color: 'rgba(0,0,0,.65)',
        }}
      >
        {rows.map((r) => {
          const idx = deptDomain.indexOf(r.dept1)
          return (
            <span key={r.dept1} title={`${r.value} 次`}>
              <i
                style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                  background: PALETTE[idx >= 0 ? idx % PALETTE.length : PALETTE.length - 1],
                  marginRight: 4, verticalAlign: 'baseline',
                }}
              />
              {r.dept1}
            </span>
          )
        })}
      </div>
      <Pie
        data={rows}
        angleField="value"
        colorField="dept1"
        height={252}
        innerRadius={0.55}
        scale={{ color: { range: PALETTE, domain: deptDomain } }}
        label={false}
        legend={false}
        tooltip={{ items: [{ name: (d: { dept1: string }) => d.dept1, value: (d: { value: number }) => d.value }] }}
      />
    </div>
  )
})

export default function StatsPage() {
  /** 日期范围：全局生效（左表 / 图表 / 人员表），默认近 30 天 */
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()])
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [metric, setMetric] = useState<StatsMetric>('view')
  const [granularity, setGranularity] = useState<StatsGranularity>('day')

  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<{ total: StatsSummaryItem; items: StatsSummaryItem[] } | null>(null)
  const [trend, setTrend] = useState<StatsTrendResp['buckets']>([])
  const [deptShare, setDeptShare] = useState<StatsDeptShareResp['items']>([])
  const [users, setUsers] = useState<StatsUserItem[]>([])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const rangeParams = useMemo(
    () => ({ start: range[0].format('YYYY-MM-DD'), end: range[1].format('YYYY-MM-DD') }),
    [range],
  )

  /** 两图共用的部门顺序（字典序，跨指标/时间切换稳定）——同部门在柱状图与扇形图中颜色一致 */
  const deptDomain = useMemo(() => {
    const set = new Set<string>()
    trend.forEach((b) => set.add(b.dept1 || UNKNOWN_DEPT))
    deptShare.forEach((i) => set.add(i.dept1 || UNKNOWN_DEPT))
    return [...set].sort()
  }, [trend, deptShare])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.getStatsSummary({ ...rangeParams, search: debouncedSearch }),
      api.getStatsTrend({ metric, granularity, ...rangeParams }),
      api.getStatsDeptShare({ metric, ...rangeParams }),
      api.getStatsUsers({ ...rangeParams }),
    ])
      .then(([s, t, d, u]) => {
        if (cancelled) return
        setSummary({
          total: { slug: '', name: '汇总', views: s.total.views, usage: s.total.usage, users: s.total.users, last_at: s.total.last_at },
          items: s.items,
        })
        setTrend(t.buckets)
        setDeptShare(d.items)
        setUsers(u.items)
      })
      .catch((e) => { if (!cancelled) void message.error(String(e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [rangeParams, debouncedSearch, metric, granularity])

  /* 汇总行（slug 为空）排序时固定第一行 */
const isTotal = (r: StatsSummaryItem) => !r.slug
const numSorter = (get: (r: StatsSummaryItem) => number) => (a: StatsSummaryItem, b: StatsSummaryItem) => {
  if (isTotal(a)) return -1
  if (isTotal(b)) return 1
  return get(a) - get(b)
}

/* 左表：首行汇总 + 每系统一行；预览数/调用量/使用人数可排序 */
  const leftColumns: ColumnsType<StatsSummaryItem> = [
    {
      title: '序列', width: 56, dataIndex: 'idx',
      render: (_v, _r, i) => (i === 0 ? <b>—</b> : i),
    },
    {
      title: '名称', dataIndex: 'name', ellipsis: true,
      render: (v: string, _r, i) => (i === 0 ? <b>{v}</b> : v),
    },
    { title: '预览数', dataIndex: 'views', width: 80, align: 'right', sorter: numSorter((r) => r.views) },
    { title: '调用量', dataIndex: 'usage', width: 76, align: 'right', sorter: numSorter((r) => r.usage) },
    { title: '使用人数', dataIndex: 'users', width: 84, align: 'right', sorter: numSorter((r) => r.users) },
    { title: '最近调用时间', dataIndex: 'last_at', width: 128, render: fmtTime },
  ]
  const leftRows = useMemo(
    () => (summary ? [summary.total, ...summary.items] : []),
    [summary],
  )

  /* 人员表 9 列 */
  const userColumns: ColumnsType<StatsUserItem> = [
    { title: '工号', dataIndex: 'account', width: 120 },
    { title: '名字', dataIndex: 'nick_name', width: 100, render: (v: string) => v || '—' },
    { title: '最近调用时间', dataIndex: 'last_at', width: 150, render: fmtTime },
    { title: '预览数', dataIndex: 'views', width: 90, align: 'right', sorter: (a, b) => a.views - b.views },
    { title: '调用量', dataIndex: 'usage', width: 90, align: 'right', sorter: (a, b) => a.usage - b.usage },
    { title: '一层部门', dataIndex: 'dept1', ellipsis: true, render: (v: string) => v || '' },
    { title: '二层部门', dataIndex: 'dept2', ellipsis: true, render: (v: string) => v || '' },
    { title: '三层部门', dataIndex: 'dept3', ellipsis: true, render: (v: string) => v || '' },
    { title: '四层部门', dataIndex: 'dept4', ellipsis: true, render: (v: string) => v || '' },
  ]

  /* Excel 下载：前端 xlsx 生成（与页面当前数据/范围一致） */
  const exportExcel = async () => {
    if (!users.length) { void message.warning('当前范围没有可导出的人员数据'); return }
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(
      users.map((u) => ({
        工号: u.account, 名字: u.nick_name || '',
        最近调用时间: u.last_at ? dayjs(u.last_at).format('YYYY-MM-DD HH:mm:ss') : '',
        预览数: u.views, 调用量: u.usage,
        一层部门: u.dept1 || '', 二层部门: u.dept2 || '', 三层部门: u.dept3 || '', 四层部门: u.dept4 || '',
      })),
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '人员统计')
    XLSX.writeFile(wb, `人员统计_${rangeParams.start}_${rangeParams.end}.xlsx`)
    void message.success(`已导出 ${users.length} 人的统计`)
  }

  return (
    <Spin spinning={loading}>
      {/* 左表字号缩小（紧凑信息密度） */}
      <style>{`
        .stats-left-table .ant-table { font-size: 12px; }
        .stats-left-table .ant-table-thead > tr > th { padding: 6px 8px; font-size: 12px; white-space: nowrap; background: #fafafa; }
        .stats-left-table .ant-table-tbody > tr > td { padding: 5px 8px; font-size: 12px; }
        .stats-left-table .ant-table-tbody > tr > td .ant-table-column-sorter { font-size: 12px; }
      `}</style>
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
        {/* ── 左 1/3：统计范围 + 名称搜索（同一行）+ 系统表 ── */}
        <Card size="small" style={{ width: '33.33%', flexShrink: 0 }} styles={{ body: { padding: 12 } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: 'rgba(0,0,0,.45)', fontSize: 13, flexShrink: 0 }}>统计范围</span>
            <DatePicker.RangePicker
              size="small"
              style={{ flex: 1, minWidth: 190 }}
              value={range}
              onChange={(v) => { if (v && v[0] && v[1]) setRange([v[0], v[1]]) }}
            />
            <Input
              size="small"
              style={{ width: 128, flexShrink: 0 }}
              allowClear
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
              placeholder="搜索名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Table<StatsSummaryItem>
            size="small"
            className="stats-left-table"
            rowKey={(r) => r.slug || 'total'}
            columns={leftColumns}
            dataSource={leftRows}
            pagination={false}
            scroll={{ y: 640 }}
            locale={{ emptyText: <Empty description="暂无设计系统" /> }}
          />
        </Card>

        {/* ── 右 2/3 ── */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 右上 1/3：打点分布（指标切换 + 条形图 + 扇形图） */}
          <Card
            size="small"
            title="打点分布"
            extra={
              <Radio.Group
                size="small"
                optionType="button"
                buttonStyle="solid"
                options={METRIC_OPTIONS}
                value={metric}
                onChange={(e) => setMetric(e.target.value as StatsMetric)}
              />
            }
          >
            <Row gutter={16}>
              <Col span={15}>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'rgba(0,0,0,.45)', fontSize: 13 }}>
                    {METRIC_OPTIONS.find((m) => m.value === metric)?.label}统计 · 一层部门
                  </span>
                  <Segmented
                    size="small"
                    options={GRANULARITY_OPTIONS}
                    value={granularity}
                    onChange={(v) => setGranularity(v as StatsGranularity)}
                  />
                </Space>
                <TrendBar data={trend} deptDomain={deptDomain} />
              </Col>
              <Col span={9}>
                <div style={{ color: 'rgba(0,0,0,.45)', fontSize: 13, marginBottom: 4 }}>
                  {METRIC_OPTIONS.find((m) => m.value === metric)?.label} · 一层部门占比
                </div>
                <DeptPie data={deptShare} deptDomain={deptDomain} />
              </Col>
            </Row>
          </Card>

          {/* 右下 2/3：人员统计 + Excel 下载 */}
          <Card
            size="small"
            title={`人员统计（${users.length}）`}
            extra={
              <Tooltip title="导出当前范围的人员统计 Excel">
                <Button size="small" icon={<DownloadOutlined />} onClick={() => void exportExcel()}>
                  下载
                </Button>
              </Tooltip>
            }
            style={{ flex: 1, minHeight: 0 }}
            styles={{ body: { padding: 12, height: 'calc(100% - 39px)', overflow: 'auto' } }}
          >
            <Table<StatsUserItem>
              size="small"
              rowKey="account"
              columns={userColumns}
              dataSource={users}
              pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
              locale={{ emptyText: <Empty description="该时间范围内暂无人员打点" /> }}
            />
          </Card>
        </div>
      </div>
    </Spin>
  )
}
