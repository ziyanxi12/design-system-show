import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, App, Spin, Tag, Tree, Typography, Upload } from 'antd'
import { FileZipOutlined, InboxOutlined } from '@ant-design/icons'
import type { DataNode } from 'antd/es/tree'
import { api } from '../api/client'
import { extractAssetItems, type ZipAssetItem, type ZipParseResult } from '../api/zipTypes'

/**
 * Zip 解析（需求：管理台新增功能——左上角小上传区 + 右侧模板 html 渲染）。
 *
 * 数据流：
 *   选择 zip → POST /api/design-systems/parse（后端：DESIGN.md 转 json + assets 目录树扫描）
 *   → 解析结果 ds 转 Blob URL → <iframe template.html>
 *   ← postMessage {type:"ds-ready"}
 *   → postMessage {type:"ds-data", data:{id, meta:{jsonUrl: blobUrl}}}
 *   → 模板 fetch(jsonUrl) 渲染（与展示端同一协议，模板零改动）
 *
 * 左栏：解析统计（组件/Pattern/层级树）与附件信息；渲染只在右侧 iframe（沙箱预览）。
 */

interface ParseState {
  result: ZipParseResult
  blobUrl: string
  fileName: string
  parseKey: number
}

/** 附件 base64 → Blob 下载（文件名用 zip 内原文件名；超限无 content_base64 时由调用方提示） */
function downloadSkillZip(skill: { filename: string | null; content_base64?: string | null }): boolean {
  const b64 = skill.content_base64
  if (!b64) return false
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
  const a = document.createElement('a')
  a.href = url
  a.download = skill.filename || 'skill-design.zip'
  a.click()
  URL.revokeObjectURL(url)
  return true
}

/** assets 条目 → antd Tree 数据（按 group 层级组装，叶子为组件/Pattern 名） */
function buildTree(result: ZipParseResult): DataNode[] {
  const rootChildren: DataNode[] = []
  const makeDir = (children: DataNode[], title: string): DataNode => {
    const existing = children.find(
      (c) => c.title === title && !c.isLeaf,
    ) as (DataNode & { children: DataNode[] }) | undefined
    if (existing) return existing
    const node: DataNode = { title, key: `${children.length}-${title}-dir`, children: [] }
    children.push(node)
    return node as DataNode & { children: DataNode[] }
  }
  for (const groupKey of ['components', 'patterns'] as const) {
    const items = extractAssetItems(result.ds, groupKey)
    if (!items.length) continue
    const groupNode = makeDir(rootChildren, groupKey === 'components' ? 'components（组件）' : 'patterns（Pattern）')
    for (const it of items as (ZipAssetItem & { name: string })[]) {
      let cursor = groupNode as DataNode & { children: DataNode[] }
      for (const level of it.group ?? []) {
        cursor = makeDir(cursor.children, level) as DataNode & { children: DataNode[] }
      }
      cursor.children.push({ title: it.name, key: `${groupKey}-${it.id}`, isLeaf: true })
    }
  }
  return rootChildren
}

export default function ZipParsePage() {
  const { message } = App.useApp()
  const [parsing, setParsing] = useState(false)
  const [state, setState] = useState<ParseState | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const blobUrlRef = useRef('')

  /** 新解析前释放上一轮 Blob URL */
  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = ''
    }
  }, [])

  useEffect(() => revokeBlob, [revokeBlob])

  /** 模板就绪 → 注入 jsonUrl（Blob URL，同源 fetch） */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return
      const type = (e.data as { type?: string } | null)?.type
      if (type === 'ds-ready' && state) {
        console.log('[zip-parse] 模板就绪，注入数据源（jsonUrl = Blob URL）')
        ;(e.source as Window).postMessage(
          { type: 'ds-data', data: { id: state.result.stats.slug, meta: { jsonUrl: state.blobUrl } } },
          '*',
        )
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [state])

  const handleFile = async (f: File) => {
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    if (ext !== 'zip') {
      message.error('仅支持解析 zip 包（DESIGN.md + assets + 附件 .zip）')
      return
    }
    if (f.size > 200 * 1024 * 1024) {
      message.error(`文件 ${(f.size / 1024 / 1024).toFixed(1)}MB 超过 200MB 上限`)
      return
    }
    revokeBlob()
    setParsing(true)
    const t0 = performance.now()
    console.log(`[zip-parse] 开始解析 ${f.name}（${(f.size / 1024 / 1024).toFixed(2)}MB）`)
    try {
      const result = await api.parseZip(f)
      const blob = new Blob([JSON.stringify(result.ds)], { type: 'application/json' })
      const blobUrl = URL.createObjectURL(blob)
      blobUrlRef.current = blobUrl
      setState((prev) => ({
        result,
        blobUrl,
        fileName: f.name,
        parseKey: (prev?.parseKey ?? 0) + 1,
      }))
      const secs = ((performance.now() - t0) / 1000).toFixed(2)
      console.log(
        `[zip-parse] 解析成功（${secs}s）：规范 id=${result.stats.slug}，组件 ${result.stats.components} 个，Pattern ${result.stats.patterns} 个，附件 ${result.skill_zip.present ? result.skill_zip.filename : '无'}`,
      )
    } catch (e) {
      console.error('[zip-parse] 解析失败：', e instanceof Error ? e.message : e)
      message.error(e instanceof Error ? e.message : String(e))
    } finally {
      setParsing(false)
    }
  }

  const stats = state?.result.stats
  const treeData = state ? buildTree(state.result) : []

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0, padding: '20px 24px' }}>
      {/* 左栏：左上角小上传区 + 解析结果统计（需求：上传区只占左上角一小部分） */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflowY: 'auto',
        }}
      >
        <Upload.Dragger
          accept=".zip,application/zip"
          showUploadList={false}
          beforeUpload={(f) => {
            handleFile(f as File)
            return false
          }}
          style={{ padding: '12px 16px' }}
        >
          <p style={{ margin: 0 }}>
            <InboxOutlined style={{ fontSize: 24, color: '#6366f1' }} />
          </p>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
            点击或拖拽 zip 包解析预览
            <br />
            DESIGN.md + assets + 任意名 .zip 附件
          </div>
        </Upload.Dragger>

        {parsing && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Spin tip="解析中（zip 解压 → MD 转 JSON → assets 树扫描）…">
              <div style={{ height: 40 }} />
            </Spin>
          </div>
        )}

        {state && !parsing && (
          <>
            <Alert
              type="success"
              showIcon
              message={`解析成功：${state.fileName}`}
              description={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Typography.Text style={{ fontSize: 12 }}>
                    名称：{stats?.name || '—'} · 规范 id：{stats?.slug || '—'}
                  </Typography.Text>
                  <Typography.Text style={{ fontSize: 12 }}>
                    zip 大小：{((stats?.zip_size ?? 0) / 1024 / 1024).toFixed(2)}MB · 组件{' '}
                    {stats?.components ?? 0} 个 · Pattern {stats?.patterns ?? 0} 个
                  </Typography.Text>
                  <Typography.Text style={{ fontSize: 12 }}>
                    附件：
                    {state.result.skill_zip.present
                      ? `${state.result.skill_zip.filename ?? '附件'}（${(state.result.skill_zip.size / 1024).toFixed(1)}KB）`
                      : 'zip 内无附件（DESIGN.md 同级无 .zip 文件）'}
                  </Typography.Text>
                  {state.result.skill_zip.present && state.result.skill_zip.content_base64 ? (
                    <Typography.Link
                      style={{ fontSize: 12, width: 'fit-content' }}
                      onClick={() => downloadSkillZip(state.result.skill_zip)}
                    >
                      下载附件
                    </Typography.Link>
                  ) : state.result.skill_zip.present ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      附件超过 50MB，未随解析结果回传；正式入库后可经完整链接下载
                    </Typography.Text>
                  ) : null}
                </div>
              }
            />
            {treeData.length > 0 && (
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 12,
                  background: '#fafafa',
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  assets 层级
                </Typography.Text>
                <Tree treeData={treeData} defaultExpandAll blockNode style={{ background: 'transparent', fontSize: 13 }} />
              </div>
            )}
          </>
        )}

        {!state && !parsing && (
          <Alert
            type="info"
            showIcon
            message="解析流程"
            description={
              <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.8 }}>
                1. zip 包经后端安全校验后解压（zip slip / zip bomb 防护）
                <br />
                2. DESIGN.md 解析为 design-system.json（token 区块）
                <br />
                3. assets/components、assets/patterns 递归扫描（目录层级 + html 名 = 组件名）
                <br />
                4. 右侧按展示端模板渲染（本页不落库，正式上传走「设计系统管理」）
              </div>
            }
          />
        )}
      </div>

      {/* 右侧：模板 html 渲染（iframe + postMessage jsonUrl，与展示端同协议） */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#F3F4F6',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '10px 16px',
            background: '#fff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FileZipOutlined style={{ color: '#6366f1' }} />
          <span style={{ fontSize: 13, color: '#262626' }}>模板渲染预览</span>
          {state && (
            <Tag color="purple" style={{ marginLeft: 8 }}>
              {stats?.name || stats?.slug}
            </Tag>
          )}
        </div>
        {state ? (
          <iframe
            key={state.parseKey}
            ref={iframeRef}
            src="./design-systems/detail/template.html"
            title="design-system-template"
            style={{ flex: 1, border: 0, width: '100%' }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(0,0,0,0.35)',
              fontSize: 15,
            }}
          >
            上传 zip 包后，此处按展示端模板渲染解析结果
          </div>
        )}
      </div>
    </div>
  )
}
