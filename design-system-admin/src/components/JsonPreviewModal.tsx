import { useEffect, useState } from 'react'
import { App, Modal, Spin, Typography } from 'antd'
import { CopyOutlined } from '@ant-design/icons'
import { api } from '../api/client'

export function JsonPreviewModal({
  slug,
  open,
  onClose,
}: {
  slug: string | null
  open: boolean
  onClose: () => void
}) {
  const { message } = App.useApp()
  const [loading, setLoading] = useState(false)
  const [json, setJson] = useState<unknown>(null)

  useEffect(() => {
    if (!open || !slug) return
    setLoading(true)
    setJson(null)
    api
      .getJson(slug)
      .then(setJson)
      .catch((e) => message.error(e.message))
      .finally(() => setLoading(false))
  }, [open, slug, message])

  const copy = () => {
    const text = JSON.stringify(json, null, 2)
    navigator.clipboard
      .writeText(text)
      .then(() => message.success('已复制 JSON'))
      .catch(() => message.error('复制失败'))
  }

  return (
    <Modal
      title={`design-system.json — ${slug ?? ''}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Typography.Link onClick={copy} style={{ fontSize: 13 }}>
            <CopyOutlined /> 复制 JSON
          </Typography.Link>
        </div>
        <pre
          style={{
            maxHeight: 480,
            overflow: 'auto',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            fontSize: 12,
            lineHeight: 1.7,
            margin: 0,
          }}
        >
          {json ? JSON.stringify(json, null, 2) : ''}
        </pre>
      </Spin>
    </Modal>
  )
}
