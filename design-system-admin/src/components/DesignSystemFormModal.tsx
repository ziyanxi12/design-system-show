import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Switch,
  Typography,
  Upload,
} from 'antd'
import { DownloadOutlined, InboxOutlined, PictureOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, ApiError } from '../api/client'
import { MAX_JSON_BYTES } from '../api/validate'
import { authorLabel, type AuthorEntry, type DesignSystemItem, type DesignSystemMeta } from '../types'

/**
 * 三态弹窗：新增 / 编辑 / 查看设计系统
 * - create：DESIGN.md（紧凑拖拽，服务端解析）+ 作者多选（用户联想）+ 封面/图标（按钮选图）+ 名称/描述/默认
 * - edit：当前文件下载 + 可选替换 DESIGN.md + 当前封面/图标 + 可选换新 + 名称/作者/描述/默认
 * - view：只读展示 + 文件下载 + 封面/图标缩略图 + 查看完整 JSON
 *
 * 编辑提交流程：
 *   1. 选了新 DESIGN.md → PUT /{slug}/json（服务端校验 id 一致；name 跟 MD，封面/图标/作者保留）
 *   2. 再 PATCH /{slug} 提交表单变化 + 文件；无变化则跳过（避免脏操作日志）
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

const MAX_IMG_BYTES = 2 * 1024 * 1024
const ALLOWED_COVER_EXTS = ['jpg', 'jpeg', 'png', 'webp']
const ALLOWED_ICON_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'svg']
const MD_EXTS = ['md', 'markdown']

function validateImageFile(file: File, exts: string[], label: string): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!exts.includes(ext)) return `${label}仅支持 ${exts.join('/')}，收到：${file.name}`
  if (file.size > MAX_IMG_BYTES) return `${label}超过 2MB 上限`
  return null
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
 *  padContent：内容列加 paddingTop:8 —— view 态用（只读文本/图片与标签文本基线对齐，
 *  编辑态不用：paddingTop:8 是为 32px 输入框校准的）。
 */
const Row = ({
  label,
  required,
  padContent = false,
  children,
}: {
  label: string
  required?: boolean
  padContent?: boolean
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
    <div style={{ flex: 1, minWidth: 0, ...(padContent ? { paddingTop: 8 } : {}) }}>{children}</div>
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

  // DESIGN.md 文件（create/edit 共用；内容解析在后端，前端只做扩展名/大小预检）
  const [mdFile, setMdFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  // 作者（多选，/getAccount 联想搜索，选中即得完整值）
  const [authors, setAuthors] = useState<AuthorEntry[]>([])
  const [authorOptions, setAuthorOptions] = useState<{ value: string; label: string }[]>([])
  const [authorSearching, setAuthorSearching] = useState(false)
  const authorMap = useRef<Map<string, AuthorEntry>>(new Map())
  const authorDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authorAbort = useRef<AbortController | null>(null)

  // 封面（blob 预览 URL 用 ref 追踪，便于替换/重开时释放）
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverBlobUrl, setCoverBlobUrl] = useState('')
  const coverBlobRef = useRef('')

  // 图标（同封面模式）
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [iconBlobUrl, setIconBlobUrl] = useState('')
  const iconBlobRef = useRef('')

  const [submitting, setSubmitting] = useState(false)

  // 打开时初始化（释放上次会话的 blob URL）
  useEffect(() => {
    if (!open) return
    setMdFile(null)
    setErrors([])
    setAuthors(isCreate ? [] : (item?.author ?? []))
    setAuthorOptions([])
    setCoverFile(null)
    if (coverBlobRef.current) {
      URL.revokeObjectURL(coverBlobRef.current)
      coverBlobRef.current = ''
    }
    setCoverBlobUrl('')
    setIconFile(null)
    if (iconBlobRef.current) {
      URL.revokeObjectURL(iconBlobRef.current)
      iconBlobRef.current = ''
    }
    setIconBlobUrl('')
    setSubmitting(false)
    if (isCreate) {
      form.resetFields()
      form.setFieldsValue({ default: false })
    } else if (item) {
      form.setFieldsValue({
        name: item.name,
        desc: item.desc ?? '',
        default: item.default ?? false,
      })
    }
  }, [open, mode, item, form, isCreate])

  /** DESIGN.md 预检（扩展名/大小）；内容解析与结构校验由后端完成 */
  const handleMdFile = (f: File) => {
    setMdFile(f)
    setErrors([])
    const ext = (f.name.split('.').pop() || '').toLowerCase()
    if (!MD_EXTS.includes(ext)) {
      setErrors(['仅支持上传 .md 文件（DESIGN.md，octo-design-md/1 格式）'])
      return
    }
    if (f.size > MAX_JSON_BYTES) {
      setErrors([`文件 ${fmtSize(f.size)} 超过 10MB 上限`])
    }
  }

  /** 作者联想搜索（/getAccount，300ms 防抖 + 超时取消；无匹配时允许手输外部账号） */
  const handleAuthorSearch = (value: string) => {
    if (authorDebounce.current) clearTimeout(authorDebounce.current)
    if (authorAbort.current) authorAbort.current.abort()
    const kw = value.trim()
    if (!kw) {
      setAuthorOptions([])
      setAuthorSearching(false)
      return
    }
    authorDebounce.current = setTimeout(async () => {
      const controller = new AbortController()
      authorAbort.current = controller
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      setAuthorSearching(true)
      let opts: { value: string; label: string }[] = []
      try {
        const items = await api.searchAccounts(kw, controller.signal)
        // 累积合并（不清空）：多轮搜索下已选作者的信息仍可查
        items.forEach((u) => authorMap.current.set(u.account, u))
        opts = items.map((u) => ({ value: u.account, label: authorLabel(u) }))
      } catch {
        opts = []
      } finally {
        clearTimeout(timeoutId)
        setAuthorSearching(false)
      }
      // 仅允许 API 搜索结果，搜索为空则无可选项（不支持手动输入）
      setAuthorOptions(opts)
    }, 300)
  }

  /** 选中/取消作者：新选项从搜索映射取完整值（id/userID/account/nickName/dept），已选项保持原值 */
  const handleAuthorChange = (accounts: string[]) => {
    setAuthors(
      accounts.map((account) => {
        const u = authorMap.current.get(account)
        return u ?? authors.find((a) => a.account === account) ?? { account, nickName: '' }
      }),
    )
  }

  /** 封面选择（校验 jpg/png/webp ≤2MB，本地 blob 预览） */
  const handleCoverFile = (f: File) => {
    const err = validateImageFile(f, ALLOWED_COVER_EXTS, '封面')
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

  /** 图标选择（校验 jpg/png/webp/svg ≤2MB） */
  const handleIconFile = (f: File) => {
    const err = validateImageFile(f, ALLOWED_ICON_EXTS, '图标')
    if (err) {
      message.error(err)
      return
    }
    setIconFile(f)
    if (iconBlobRef.current) URL.revokeObjectURL(iconBlobRef.current)
    const url = URL.createObjectURL(f)
    iconBlobRef.current = url
    setIconBlobUrl(url)
  }

  /** 提交：edit 先 PUT（如有新 MD）再 PATCH（如有变化；作者数组仅变化时提交） */
  const submit = async () => {
    if (isCreate && !mdFile) {
      message.warning('请先选择 DESIGN.md 文件')
      return
    }
    setSubmitting(true)
    try {
      // validateFields 需在 try 内：校验失败时 antd reject 的是 {errorFields} 对象（非 Error）
      const values = await form.validateFields()
      // edit 模式：选了新 DESIGN.md → PUT（服务端解析 + 校验 id 一致）
      if (isEdit && mdFile && item) {
        await api.putJson(item.slug, mdFile)
      }
      if (item) {
        const patch: Partial<DesignSystemMeta> = {}
        if (values.name !== item.name) patch.name = values.name
        if (values.desc !== (item.desc ?? '')) patch.desc = values.desc
        if (values.default !== (item.default ?? false)) patch.default = values.default
        let updated = item
        // 作者变化判断：规范化后对比（服务端会补全 nickName/dept，比较时以关键字段为准）
        const normAuthors = (list: AuthorEntry[]) =>
          JSON.stringify(
            list.map((a) => ({
              id: a.id ?? null,
              userID: a.userID ?? null,
              account: a.account,
              nickName: a.nickName ?? '',
              dept: a.dept ?? [],
            })),
          )
        const authorsChanged = normAuthors(authors) !== normAuthors(item.author ?? [])
        if (Object.keys(patch).length > 0 || coverFile || iconFile || authorsChanged) {
          updated = await api.patchMeta(item.slug, patch, {
            coverFile,
            iconFile,
            ...(authorsChanged ? { authors } : {}),
          })
        }
        message.success(`已更新「${values.name}」`)
        onClose()
        onSuccess?.(updated)
      } else {
        // create
        const result = await api.create(mdFile!, {
          name: values.name,
          desc: values.desc,
          default: values.default,
        }, { coverFile, iconFile, authors })
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

  /** 下载 DESIGN.md 模版（public/templates 下的静态文件，blob 方式强制下载） */
  const downloadTemplate = async () => {
    try {
      const res = await fetch('/templates/design-system.template.md')
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'design-system.template.md'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      message.error(e instanceof Error ? e.message : '模版下载失败')
    }
  }

  /** 下载当前 DESIGN.md 原件（用户面主文件；无 MD 的旧数据回落 JSON） */
  const downloadCurrentFile = async () => {
    if (!item) return
    try {
      if (item.design_md_url) {
        const res = await fetch(item.design_md_url)
        if (!res.ok) throw new Error('HTTP ' + res.status)
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'DESIGN.md'
        a.click()
        URL.revokeObjectURL(url)
      } else {
        const data = await api.getJson(item.slug)
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'design-system.json'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const title = useMemo(() => {
    if (isCreate) return '新增设计系统'
    if (isView) return `查看 — ${item?.name ?? ''}`
    return `编辑 — ${item?.name ?? ''}`
  }, [isCreate, isView, item?.name])

  const canSubmit = isCreate ? !!mdFile && errors.length === 0 : true

  const fileInfoText = mdFile ? `${mdFile.name}（${fmtSize(mdFile.size)}）` : null

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

  /** 作者行：create/edit=多选（/getAccount 联想，选中即得完整值）；view=nickName(account) 文本。
   *  labelInValue：token 自带 label（nickName(account)），不依赖 options —— 下拉只展示当前搜索结果，
   *  未搜索时为空（不混入已选项）；选项 label 与 token 格式统一（authorLabel），避免 label 不一致告警。
   */
  const renderAuthorRow = () => {
    if (isView) {
      const names = (item?.author ?? []).map(authorLabel).filter(Boolean)
      return (
        <Typography.Text style={{ fontSize: 14, color: '#595959' }}>
          {names.length ? names.join('、') : '—'}
        </Typography.Text>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Select
          mode="multiple"
          labelInValue
          value={authors.map((a) => ({ value: a.account, label: authorLabel(a) }))}
          options={authorOptions}
          onSearch={handleAuthorSearch}
          onChange={(vals) =>
            handleAuthorChange((vals as { value: string }[]).map((v) => v.value))
          }
          placeholder="搜索账号/昵称添加作者"
          notFoundContent={authorSearching ? '搜索中…' : '未找到匹配人员'}
          filterOption={false}
          style={{ width: INPUT_WIDTH }}
          allowClear
        />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          选中即带出完整人员信息（昵称/部门）
        </Typography.Text>
      </div>
    )
  }

  /** 文件行：create=MD 拖拽区 + 模版下载；edit=JSON 下载 + 可选替换拖拽区；view=JSON 下载 */
  const renderFileRow = () => {
    if (isCreate) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: INPUT_WIDTH }}>
          <CompactDropzone
            accept=".md,.markdown,text/markdown"
            beforeUpload={handleMdFile}
            hint="点击或拖拽 DESIGN.md 到此处 · ≤10MB"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Button size="small" onClick={downloadTemplate}>
              下载模版
            </Button>
            {fileInfoText && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {fileInfoText}
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
    // edit / view：当前文件（DESIGN.md，用户面主文件）下载链接 + 元信息
    if (!item) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: INPUT_WIDTH }}>
        <Typography.Link
          onClick={downloadCurrentFile}
          style={{ fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <DownloadOutlined />
          {item.design_md_url ? `DESIGN.md（${fmtSize(item.file_size)}）` : `design-system.json（${fmtSize(item.file_size)}）`}
        </Typography.Link>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          调用量 {item.usage ?? 0} · 更新于{' '}
          {item.updated_at ? dayjs(item.updated_at).format('YYYY-MM-DD HH:mm') : '—'}
        </Typography.Text>
        {isEdit && (
          <div style={{ marginTop: 4 }}>
            <CompactDropzone
              accept=".md,.markdown,text/markdown"
              beforeUpload={handleMdFile}
              hint="点击或拖拽新 DESIGN.md 替换（可选）· id 需与当前系统一致"
            />
            {fileInfoText && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {fileInfoText}
                </Typography.Text>
                <Typography.Link
                  style={{ fontSize: 12 }}
                  onClick={() => {
                    setMdFile(null)
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

  /** 封面行：纯按钮点击选图（无默认占位图）；选好（或编辑态已有）后图片展示在按钮区域，点击重选 */
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
            <Button icon={<PictureOutlined />}>选择封面</Button>
          )}
        </Upload>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {coverFile ? `${coverFile.name}（${fmtSize(coverFile.size)}）` : 'jpg/png/webp · ≤2MB'}
        </Typography.Text>
      </div>
    )
  }

  /** 图标行：与封面同模式（多支持 svg），方形预览；未自定义时服务端回落内置默认图标（icon_url 恒有值） */
  const renderIconRow = () => {
    if (isView) {
      return (
        <img
          src={item?.icon_url}
          alt="图标"
          style={{ width: 64, height: 64, borderRadius: 8, display: 'block', border: '1px solid #e2e8f0' }}
        />
      )
    }
    const previewSrc = iconBlobUrl || (isEdit ? (item?.icon_url ?? '') : '')
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Upload
          accept=".jpg,.jpeg,.png,.webp,.svg"
          showUploadList={false}
          beforeUpload={(f) => {
            handleIconFile(f as File)
            return false
          }}
        >
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="图标预览（点击重新选择）"
              title="点击重新选择"
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                display: 'block',
                cursor: 'pointer',
                border: '1px solid #e2e8f0',
                background: '#f8fafc',
                objectFit: 'contain',
                padding: 4,
              }}
            />
          ) : (
            <Button icon={<PictureOutlined />}>选择图标</Button>
          )}
        </Upload>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {iconFile ? `${iconFile.name}（${fmtSize(iconFile.size)}）` : 'jpg/png/webp/svg · ≤2MB · 可选（默认展示内置图标）'}
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
              <Button type="primary" onClick={onClose}>
                关闭
              </Button>
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
            <Row label="设计系统名称" required padContent={isView}>
              {renderInput('name', '设计系统名称', true)}
            </Row>
            <Row label="作者" padContent={isView}>
              {renderAuthorRow()}
            </Row>
            <Row label="文件" padContent={isView}>
              {renderFileRow()}
            </Row>
            <Row label="封面" padContent={isView}>
              {renderCoverRow()}
            </Row>
            <Row label="图标" padContent={isView}>
              {renderIconRow()}
            </Row>
            <Row label="描述" padContent={isView}>
              {renderTextarea('desc')}
            </Row>
            <Row label="设为默认" padContent={isView}>
              {renderSwitch('default')}
            </Row>
          </div>
        </Form>
      </Modal>
    </>
  )
}
