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
import { DownloadOutlined, LeftOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons'
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
const VISIBLE_BARS = 11
const BAR_WIDTH = 10
const LEGEND_PAGE_SIZE = 6

/** 部门配色（ECharts 默认色板）：柱状图 / 扇形图 / 图例共用，保证同部门同色 */
const PALETTE = ['#5470C6', '#91CC75', '#FAC858', '#EE6666', '#73C0DE', '#3BA272', '#FC8452', '#9A60B4', '#EA7CCC']

const fmtTime = (s: string | null) => (s ? dayjs(s).format('YYYY-MM-DD HH:mm') : '—')

/* ─────────────── 条形图（柱状形态）：横轴日期、纵轴数量，一层部门堆叠 ─────────────── */
const TrendBar = memo(({ data, deptDomain }: { data: StatsTrendResp['buckets']; deptDomain: string[] }) => {
  const rows = useMemo(() => {
    const groups = new Map<string, { date: string; dept1: string; value: number }[]>()
    for (const b of data) {
      const row = { date: b.date, dept1: b.dept1 || UNKNOWN_DEPT, value: b.value }
      const g = groups.get(b.date)
      if (g) g.push(row)
      else groups.set(b.date, [row])
    }
    const out: { date: string; dept1: string; value: number; total: number }[] = []
    for (const g of groups.values()) {
      const total = g.reduce((s, r) => s + r.value, 0)
      for (const r of g) out.push({ ...r, total })
    }
    return out
  }, [data])
  const dates = useMemo(() => [...new Set(rows.map((r) => r.date))], [rows])
  /* y 轴上限：最大总数 + max(2, 20%) 余量，向上取整到美观阶梯（1/1.2/1.5/2/2.5/3/4/5/6/8/10 × 10^k），
     保证柱顶标签始终在绘图区内 */
  const yMax = (() => {
    const maxTotal = Math.max(...rows.map((r) => r.total), 0)
    const v = maxTotal + Math.max(2, maxTotal * 0.2)
    const exp = Math.floor(Math.log10(v || 1))
    const frac = v / 10 ** exp
    const ladder = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    const nice = ladder.find((n) => n >= frac - 1e-9) ?? 10
    return nice * 10 ** exp
  })()
  if (!rows.length) return <Empty description="该时间范围内暂无打点数据" style={{ margin: '48px 0' }} />
  return (
    <Column
      data={rows}
      xField="date"
      yField="value"
      colorField="dept1"
      stack
      animate={false}
      height={252}
      paddingTop={30}
      scale={{ y: { domainMax: yMax }, x: { paddingInner: 0.8, paddingOuter: 0.25 }, color: { range: PALETTE, domain: deptDomain } }}
      style={{ minWidth: BAR_WIDTH, maxWidth: BAR_WIDTH }}
      axis={{ x: { labelAutoHide: true, labelAutoRotate: false, labelFormatter: (d: string) => d.slice(5), labelFontSize: 10 } }}
      scrollbar={
        dates.length > VISIBLE_BARS
          ? { x: { ratio: VISIBLE_BARS / dates.length, value: 1 } }
          : false
      }
      legend={false}
      interaction={{ elementHighlight: false }}
      label={{
        text: (d: { date: string; total: number }, i: number, arr: { date: string }[]) =>
          (i === arr.length - 1 || arr[i + 1].date !== d.date ? `${d.total}` : ''),
        textBaseline: 'bottom',
      }}
      tooltip={{ items: [(d: { dept1: string; value: number }) => ({ name: d.dept1, value: d.value })] }}
    />
  )
})

/* ─────────────── 扇形图：一层部门占比（左侧饼图 + 右侧纵向分页图例） ─────────────── */
const DeptPie = memo(({ data, deptDomain }: { data: StatsDeptShareResp['items']; deptDomain: string[] }) => {
  const rows = useMemo(
    () => data.map((i) => ({ dept1: i.dept1 || UNKNOWN_DEPT, value: i.value })),
    [data],
  )
  const [legendPage, setLegendPage] = useState(0)
  useEffect(() => { setLegendPage(0) }, [rows])
  /** 图例列固定宽度：按全部部门名实测最大文本宽（canvas measureText），
      翻页时列宽稳定、饼图容器宽度恒定不偏移 */
  const legendWidth = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return 150
    ctx.font = '11px -apple-system, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    const maxText = rows.reduce((m, r) => Math.max(m, ctx.measureText(r.dept1).width), 0)
    return Math.ceil(maxText) + 16 // 色块 8 + marginRight 4 + 余量 4
  }, [rows])
  const pageCount = Math.ceil(rows.length / LEGEND_PAGE_SIZE)
  if (!rows.length || rows.every((d) => d.value === 0)) {
    return <Empty description="该时间范围内暂无打点数据" style={{ margin: '48px 0' }} />
  }
  const visible = rows.slice(legendPage * LEGEND_PAGE_SIZE, (legendPage + 1) * LEGEND_PAGE_SIZE)
  const total = rows.reduce((s, r) => s + r.value, 0) || 1
  const pct = (v: number) => `${((v / total) * 100).toFixed(1)}%`
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* 饼图：左侧，容器收窄后自动缩小（右侧让位图例） */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Pie
          data={rows}
          angleField="value"
          colorField="dept1"
          height={252}
          radius={0.5}
          innerRadius={0.3}
          scale={{ color: { range: PALETTE, domain: deptDomain } }}
          label={{
            text: (d: { value: number }) => pct(d.value),
            position: 'outside',
            connectorLength: 10,
            connectorLength2: 5,
            fontSize: 12,
            transform: [{ type: 'overlapDodgeY' }],
          }}
          legend={false}
          tooltip={{ items: [(d: { dept1: string; value: number }) => ({ name: d.dept1, value: `${d.value} (${pct(d.value)})` })] }}
        />
      </div>
      {/* 图例：右侧纵向列表，每页 6 项，名称超长省略 */}
      <div style={{ width: legendWidth, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        {visible.map((r) => {
          const idx = deptDomain.indexOf(r.dept1)
          return (
            <div
              key={r.dept1}
              title={`${r.value} 次`}
              style={{ display: 'flex', alignItems: 'center', fontSize: 12, lineHeight: '20px', color: 'rgba(0,0,0,.65)' }}
            >
              <i
                style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                  background: PALETTE[idx >= 0 ? idx % PALETTE.length : PALETTE.length - 1],
                  marginRight: 4, flexShrink: 0,
                }}
              />
              <span style={{ whiteSpace: 'nowrap' }}>{r.dept1}</span>
            </div>
          )
        })}
        {pageCount > 1 && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Button
              size="small"
              type="text"
              icon={<LeftOutlined />}
              disabled={legendPage === 0}
              onClick={() => setLegendPage((p) => p - 1)}
            />
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,.45)' }}>{legendPage + 1} / {pageCount}</span>
            <Button
              size="small"
              type="text"
              icon={<RightOutlined />}
              disabled={legendPage === pageCount - 1}
              onClick={() => setLegendPage((p) => p + 1)}
            />
          </div>
        )}
      </div>
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
            <span style={{ color: 'rgba(0,0,0,.45)', fontSize: 12, flexShrink: 0 }}>统计范围</span>
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
              <Col flex="3" style={{ minWidth: 0 }}>
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'rgba(0,0,0,.45)', fontSize: 12 }}>
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
              <Col flex="2" style={{ minWidth: 0 }}>
                <div style={{ color: 'rgba(0,0,0,.45)', fontSize: 12, marginBottom: 4 }}>
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
