import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Switch,
  Typography,
  Upload,
} from 'antd'
import { DownloadOutlined, InboxOutlined, PictureOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, ApiError } from '../api/client'
import { extractMeta, validateDesignSystemJson, MAX_JSON_BYTES } from '../api/validate'
import { type DesignSystemItem, type DesignSystemMeta } from '../types'
import { JsonPreviewModal } from './JsonPreviewModal'

/**
 * 三态弹窗：新增 / 编辑 / 查看设计系统
 * - create：JSON 文件（紧凑拖拽）+ 封面（紧凑拖拽）+ 名称/作者/描述/默认
 * - edit：当前文件下载 + 可选替换 JSON + 当前封面 + 可选换封面 + 名称/作者/描述/默认
 * - view：只读展示 + 文件下载 + 封面缩略图 + 查看完整 JSON
 *
 * 编辑提交流程：
 *   1. 选了新 JSON → PUT /{slug}/json（服务端校验 id 一致；name 跟 JSON，封面保留）
 *   2. 再 PATCH /{slug} 提交表单变化 + 封面；无变化则跳过（避免脏操作日志）
 */
export type FormMode = 'create' | 'edit' | 'view'

const fmtSize = (n?: number) =>
  n == null
    ? '—'
    : n < 1024
      ? `${n} B`
      : n < 1048576
        ? `${Math.round(n / 1024)} KB`
        : `${(n / 1048576).toFixed(1)} MB`

const MAX_COVER_BYTES = 2 * 1024 * 1024
const ALLOWED_COVER_EXTS = ['jpg', 'jpeg', 'png', 'webp']

function validateCoverFile(file: File): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!ALLOWED_COVER_EXTS.includes(ext)) return `封面仅支持 jpg/png/webp，收到：${file.name}`
  if (file.size > MAX_COVER_BYTES) return '封面图片超过 2MB 上限'
  return null
}

/** 前端生成的占位模版（TODO：替换为真实模版） */
const TEMPLATE_JSON = {
  id: 'your-system-slug',
  name: '你的设计系统名称',
  cover: 'cover-cyan.jpg',
  meta: { author: '', desc: '' },
  color: { primary: { value: '#1677ff', comment: '主色' } },
  typography: { body: { fontSize: 14, lineHeight: 1.5 } },
  spacing: { md: { value: 16 } },
  radius: { md: { value: 8 } },
  shadow: { card: { value: '0 2px 8px rgba(0,0,0,0.08)' } },
}

export interface DesignSystemFormModalProps {
  mode: FormMode
  item?: DesignSystemItem | null
  open: boolean
  onClose: () => void
  onSuccess?: (item: DesignSystemItem) => void
}

const LABEL_WIDTH = 120
const INPUT_WIDTH = 320
const ROW_GAP = 20

/** 紧凑拖拽区（可拖可点，区域小；width 按行内剩余空间定制，默认与输入框同宽） */
function CompactDropzone({
  accept,
  beforeUpload,
  hint,
  width = INPUT_WIDTH,
}: {
  accept: string
  beforeUpload: (file: File) => void
  hint: string
  width?: number
}) {
  return (
    <Upload.Dragger
      accept={accept}
      showUploadList={false}
      beforeUpload={(f) => {
        beforeUpload(f as File)
        return false
      }}
      style={{
        width,
        height: 64,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <InboxOutlined style={{ fontSize: 20, color: '#6366f1' }} />
      <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>{hint}</div>
    </Upload.Dragger>
  )
}

/** 通用行布局：标签右对齐 + 内容。
 *  必须定义在组件外（模块级）：若定义在渲染函数内，每次重渲染都是新组件类型，
 *  React 会卸载重挂整棵子树，导致 rc-field-form 的 Field 在 validateFields 的
 *  microtask 执行时已 unmount（validateRules 对未挂载字段返回空错误），必填校验失效。
 */
const Row = ({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: ROW_GAP, minHeight: 32 }}>
    <div
      style={{
        width: LABEL_WIDTH,
        textAlign: 'right',
        paddingRight: 16,
        fontSize: 14,
        color: '#262626',
        flexShrink: 0,
        paddingTop: 8,
      }}
    >
      {required && <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>}
      {label}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
  </div>
)

export default function DesignSystemFormModal({
  mode,
  item,
  open,
  onClose,
  onSuccess,
}: DesignSystemFormModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<DesignSystemMeta>()
  const isView = mode === 'view'
  const isCreate = mode === 'create'
  const isEdit = mode === 'edit'

  // JSON 文件（create/edit 共用）
  const [jsonFile, setJsonFile] = useState<File | null>(null)
  const [slug, setSlug] = useState('')
  const [errors, setErrors] = useState<string[]>([])

  // 封面文件（blob 预览 URL 用 ref 追踪，便于替换/重开时释放）
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverBlobUrl, setCoverBlobUrl] = useState('')
  const coverBlobRef = useRef('')

  const [submitting, setSubmitting] = useState(false)
  const [jsonOpen, setJsonOpen] = useState(false)

  // 打开时初始化（释放上次会话的 blob URL）
  useEffect(() => {
    if (!open) return
    setJsonFile(null)
    setSlug('')
    setErrors([])
    setCoverFile(null)
    if (coverBlobRef.current) {
      URL.revokeObjectURL(coverBlobRef.current)
      coverBlobRef.current = ''
    }
    setCoverBlobUrl('')
    setSubmitting(false)
    if (isCreate) {
      form.resetFields()
      form.setFieldsValue({ default: false })
    } else if (item) {
      form.setFieldsValue({
        name: item.name,
        author: item.author ?? '',
        desc: item.desc ?? '',
        default: item.default ?? false,
      })
    }
  }, [open, mode, item, form, isCreate])

  /** JSON 文件选择处理（create/edit 共用） */
  const handleJsonFile = async (f: File) => {
    setJsonFile(f)
    setSlug('')
    setErrors([])
    if (f.size > MAX_JSON_BYTES) {
      setErrors([`文件 ${fmtSize(f.size)} 超过 10MB 上限`])
      return
    }
    let data: unknown
    try {
      data = JSON.parse(await f.text())
    } catch (e) {
      setErrors([`JSON 解析失败：${(e as Error).message}`])
      return
    }
    const errs = validateDesignSystemJson(data)
    if (errs.length) {
      setErrors(errs)
      return
    }
    const obj = data as Record<string, unknown>
    const fileSlug = String(obj.id ?? '')
    // 编辑模式：校验 id 与当前系统一致（服务端也会校验，客户端提前报错体验更好）
    if (isEdit && item && fileSlug !== item.slug) {
      setErrors([`JSON 的 id「${fileSlug}」与当前系统「${item.slug}」不一致`])
      return
    }
    setSlug(fileSlug)
    // create：auto-fill 全部；edit：只 auto-fill name（PUT 语义：name 跟 JSON，其他保留）
    const meta = extractMeta(obj)
    if (isCreate) {
      form.setFieldsValue({
        name: meta.name,
        author: meta.author,
        desc: meta.desc,
        default: false,
      })
    } else {
      form.setFieldValue('name', meta.name)
    }
  }

  /** 封面文件选择处理（校验 jpg/png/webp ≤2MB，通过后本地 blob 预览） */
  const handleCoverFile = (f: File) => {
    const err = validateCoverFile(f)
    if (err) {
      message.error(err)
      return
    }
    setCoverFile(f)
    if (coverBlobRef.current) URL.revokeObjectURL(coverBlobRef.current)
    const url = URL.createObjectURL(f)
    coverBlobRef.current = url
    setCoverBlobUrl(url)
  }

  /** 提交：edit 先 PUT（如有新 JSON）再 PATCH（如有变化） */
  const submit = async () => {
    if (isCreate && !jsonFile) {
      message.warning('请先选择 design-system.json 文件')
      return
    }
    setSubmitting(true)
    try {
      // validateFields 需在 try 内：校验失败时 antd reject 的是 {errorFields} 对象（非 Error）
      const values = await form.validateFields()
      // edit 模式：选了新 JSON → PUT
      if (isEdit && jsonFile && item) {
        await api.putJson(item.slug, jsonFile)
      }
      // 构建 PATCH 字段：只发变化的字段 + 封面
      if (item) {
        const patch: Partial<DesignSystemMeta> = {}
        if (values.name !== item.name) patch.name = values.name
        if (values.desc !== (item.desc ?? '')) patch.desc = values.desc
        if (values.author !== (item.author ?? '')) patch.author = values.author
        if (values.default !== (item.default ?? false)) patch.default = values.default
        let updated = item
        if (Object.keys(patch).length > 0 || coverFile) {
          updated = await api.patchMeta(item.slug, patch, coverFile)
        }
        message.success(`已更新「${values.name}」`)
        onClose()
        onSuccess?.(updated)
      } else {
        // create
        const result = await api.create(jsonFile!, {
          name: values.name,
          desc: values.desc,
          author: values.author,
          default: values.default,
        }, coverFile)
        message.success(`已新增「${result.name}」`)
        onClose()
        onSuccess?.(result)
      }
    } catch (e) {
      // 校验失败的 reject 对象带 errorFields，字段错误已在表单上标红展示，无需额外提示
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  /** 下载模版（create 模式） */
  const downloadTemplate = () => {
    const blob = new Blob([JSON.stringify(TEMPLATE_JSON, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'design-system.template.json'
    a.click()
    URL.revokeObjectURL(url)
    message.info('已下载占位模版（TODO：替换为真实模版）')
  }

  /** 下载当前 JSON 文件（edit/view 模式） */
  const downloadCurrentJson = async () => {
    if (!item) return
    try {
      const data = await api.getJson(item.slug)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'design-system.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const title = useMemo(() => {
    if (isCreate) return '新增设计系统'
    if (isView) return `查看 — ${item?.name ?? ''}`
    return `编辑 — ${item?.name ?? ''}`
  }, [isCreate, isView, item?.name])

  const canSubmit = isCreate ? !!jsonFile && errors.length === 0 : true

  const jsonFileInfoText = useMemo(() => {
    if (!jsonFile) return null
    let s = `${jsonFile.name}（${fmtSize(jsonFile.size)}）`
    if (slug) s += ` · slug：${slug}`
    return s
  }, [jsonFile, slug])

  const coverInfoText = coverFile ? `${coverFile.name}（${fmtSize(coverFile.size)}）` : null

  /** 输入框（view 态只读文本；required 触发前端必填校验） */
  const renderInput = (name: keyof DesignSystemMeta, placeholder?: string, required?: boolean) => {
    if (isView) {
      const val = item?.[name]
      return (
        <Typography.Text style={{ fontSize: 14, color: '#595959' }}>
          {name === 'default' ? (val ? '是' : '否') : (val as string) || '—'}
        </Typography.Text>
      )
    }
    return (
      <Form.Item
        name={name}
        rules={required ? [{ required: true, message: `请输入${placeholder ?? ''}` }] : undefined}
        style={{ marginBottom: 0, width: INPUT_WIDTH }}
      >
        <Input placeholder={placeholder} allowClear />
      </Form.Item>
    )
  }

  /** 多行文本（view 态只读） */
  const renderTextarea = (name: keyof DesignSystemMeta) => {
    if (isView) {
      const val = item?.[name] as string
      return (
        <Typography.Text style={{ fontSize: 14, color: '#595959' }}>
          {val || '—'}
        </Typography.Text>
      )
    }
    return (
      <Form.Item name={name} style={{ marginBottom: 0, width: INPUT_WIDTH }}>
        <Input.TextArea rows={3} />
      </Form.Item>
    )
  }

  /** Switch（view 态只读） */
  const renderSwitch = (name: keyof DesignSystemMeta) => {
    if (isView) {
      const val = item?.[name]
      return (
        <Typography.Text style={{ fontSize: 14, color: '#595959' }}>
          {val ? '是' : '否'}
        </Typography.Text>
      )
    }
    return (
      <Form.Item name={name} valuePropName="checked" style={{ marginBottom: 0 }}>
        <Switch />
      </Form.Item>
    )
  }

  /** 文件行：create=拖拽区+模版；edit=下载链接+信息+可选替换拖拽区；view=下载链接+信息 */
  const renderFileRow = () => {
    if (isCreate) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CompactDropzone
            accept=".json,application/json"
            beforeUpload={handleJsonFile}
            hint="点击或拖拽 JSON 文件到此处 · ≤10MB"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button size="small" onClick={downloadTemplate}>
              下载模版
            </Button>
            {jsonFileInfoText && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {jsonFileInfoText}
              </Typography.Text>
            )}
          </div>
          {errors.length > 0 && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {errors.join('；')}
            </Typography.Text>
          )}
        </div>
      )
    }
    // edit / view：当前文件下载链接 + 元信息
    if (!item) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Typography.Link
          onClick={downloadCurrentJson}
          style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <DownloadOutlined />
          design-system.json（{fmtSize(item.file_size)}）
        </Typography.Link>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          调用量 {item.usage ?? 0} · 更新于{' '}
          {item.updated_at ? dayjs(item.updated_at).format('YYYY-MM-DD HH:mm') : '—'}
        </Typography.Text>
        {isEdit && (
          <div style={{ marginTop: 4 }}>
            <CompactDropzone
              accept=".json,application/json"
              beforeUpload={handleJsonFile}
              hint="点击或拖拽新 JSON 替换（可选）· id 需与当前系统一致"
            />
            {jsonFileInfoText && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {jsonFileInfoText}
                </Typography.Text>
                <Typography.Link
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setJsonFile(null)
                    setSlug('')
                    setErrors([])
                  }}
                >
                  移除
                </Typography.Link>
              </div>
            )}
            {errors.length > 0 && (
              <Typography.Text type="danger" style={{ fontSize: 12 }}>
                {errors.join('；')}
              </Typography.Text>
            )}
          </div>
        )}
      </div>
    )
  }

  /** 封面行：纯按钮点击选图（不支持拖拽、无默认占位图）。
   *  未选图 → 「选择图片」按钮；选好（或编辑态已有封面）→ 图片直接展示在按钮区域，点击可重选替换。
   */
  const renderCoverRow = () => {
    if (isView) {
      return (
        <img
          src={item?.cover_url}
          alt="封面"
          style={{
            width: 120,
            height: 72,
            objectFit: 'cover',
            borderRadius: 6,
            display: 'block',
            background: '#e9eef8',
          }}
        />
      )
    }
    // 展示来源：新选的 blob 优先；edit 态回落当前封面；create 未选时不显示（保持按钮态）
    const previewSrc = coverBlobUrl || (isEdit ? (item?.cover_url ?? '') : '')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Upload
          accept=".jpg,.jpeg,.png,.webp"
          showUploadList={false}
          beforeUpload={(f) => {
            handleCoverFile(f as File)
            return false
          }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="封面预览（点击重新选择）"
              title="点击重新选择"
              style={{
                width: 120,
                height: 72,
                objectFit: 'cover',
                borderRadius: 6,
                display: 'block',
                cursor: 'pointer',
                border: '1px solid #e2e8f0',
              }}
            />
          ) : (
            <Button icon={<PictureOutlined />}>选择图片</Button>
          )}
        </Upload>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {coverInfoText ?? 'jpg/png/webp · ≤2MB'}
        </Typography.Text>
      </div>
    )
  }

  return (
    <>
      <Modal
        title={title}
        open={open}
        onCancel={onClose}
        width={560}
        destroyOnHidden
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {isView ? (
              <>
                {item && <Button onClick={() => setJsonOpen(true)}>查看 JSON</Button>}
                <Button type="primary" onClick={onClose}>
                  关闭
                </Button>
              </>
            ) : (
              <>
                <Button onClick={onClose}>取消</Button>
                <Button type="primary" loading={submitting} disabled={!canSubmit} onClick={submit}>
                  确定
                </Button>
              </>
            )}
          </div>
        }
      >
        {/* component={false}：不渲染额外 <form> 元素，保持 div 行布局；Form.Item 需要该层提供 FormContext */}
        <Form form={form} component={false}>
          <div style={{ padding: '8px 0' }}>
            <Row label="设计系统名称" required>
              {renderInput('name', '设计系统名称', true)}
            </Row>
            <Row label="作者">
              {renderInput('author', '请输入作者')}
            </Row>
            <Row label="文件">
              {renderFileRow()}
            </Row>
            <Row label="封面">
              {renderCoverRow()}
            </Row>
            <Row label="描述">
              {renderTextarea('desc')}
            </Row>
            <Row label="设为默认">
              {renderSwitch('default')}
            </Row>
          </div>
        </Form>
      </Modal>

      {isView && item && (
        <JsonPreviewModal slug={item.slug} open={jsonOpen} onClose={() => setJsonOpen(false)} />
      )}
    </>
  )
}
