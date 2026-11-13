import { useEffect, useMemo, useRef, useState } from 'react'
import {
  App,
  AutoComplete,
  Button,
  Form,
  Input,
  Modal,
  Switch,
  Tag,
  Typography,
  Upload,
} from 'antd'
import { CheckCircleOutlined, DownloadOutlined, InboxOutlined, MinusCircleOutlined, PictureOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { api, ApiError, MAX_PART_BYTES } from '../api/client'
import type { PartFiles, PartIngestReport } from '../types'
import {
  authorLabel,
  type AuthorEntry,
  type DesignSystemItem,
  type DesignSystemMeta,
} from '../types'
import { userOption } from '../utils/userOption'

/**
 * 三态弹窗：新增 / 编辑 / 查看设计系统（octo-design-parts/1 五部件）
 * - create：五个可选部件槽（DESIGN.md / tokens.json / 组件包 zip / Pattern 包 zip / skill 包 zip），
 *   任选子集一次 multipart 提交；逐部件独立成败——失败部件红字汇总提示，其余部件正常入库；
 *   一个部件都不选 = 纯壳系统（仅名称）
 * - edit：各槽显示存量状态（item.parts）+ 可选替换；内容走 PUT /{slug}/parts（仅换提供部件，
 *   未提供部件取存量），meta/封面/图标仍走 PATCH
 * - view：同五个部件行——每行自身状态（✓/✗ + 计数/技能名）+ 自身文件下载
 *   （DESIGN.md / tokens.json / skill 包；组件包/Pattern 包为解压子树无原件不提供下载），
 *   底部小字附规范 id / 内容合计 / 更新时间
 *
 * 上传要求（api.md「五部件格式」）：组件包 zip 内必须包含 components/ 目录（components/components/
 * 同名双层嵌套自动剥离）；Pattern 包同理（patterns/ 目录）；skill 包第一层含 SKILL.md。
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

/** 五部件槽定义（label 展示名 / accept / 前端预检扩展名 / 槽位说明） */
type PartKey = 'design_md' | 'tokens' | 'components' | 'patterns' | 'skill'

interface PartSlot {
  key: PartKey
  label: string
  accept: string
  exts: string[]
  hint: string
}

const PART_SLOTS: PartSlot[] = [
  {
    key: 'design_md',
    label: 'DESIGN.md',
    accept: '.md,text/markdown',
    exts: ['md'],
    hint: 'DESIGN.md · UTF-8 文本',
  },
  {
    key: 'tokens',
    label: 'tokens.json',
    accept: '.json,application/json',
    exts: ['json'],
    hint: 'tokens.json · 唯一数据源（合法 JSON）',
  },
  {
    key: 'components',
    label: '组件包',
    accept: '.zip,application/zip,application/x-zip-compressed',
    exts: ['zip'],
    hint: '组件包 zip · 内含 components/ 目录',
  },
  {
    key: 'patterns',
    label: 'Pattern 包',
    accept: '.zip,application/zip,application/x-zip-compressed',
    exts: ['zip'],
    hint: 'Pattern 包 zip · 内含 patterns/ 目录',
  },
  {
    key: 'skill',
    label: 'skill 包',
    accept: '.zip,application/zip,application/x-zip-compressed',
    exts: ['zip'],
    hint: 'skill 包 zip · 第一层含 SKILL.md（frontmatter name 非空）',
  },
]

function validateImageFile(file: File, exts: string[], label: string): string | null {
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!exts.includes(ext)) return `${label}仅支持 ${exts.join('/')}，收到：${file.name}`
  if (file.size > MAX_IMG_BYTES) return `${label}超过 2MB 上限`
  return null
}

/** 部件槽前端预检（扩展名/大小）；内容与结构校验由后端逐部件完成 */
function validatePartFile(key: PartKey, file: File): string | null {
  const slot = PART_SLOTS.find((s) => s.key === key)!
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (!slot.exts.includes(ext)) return `${slot.label}仅支持 ${slot.exts.join('/')} 文件，收到：${file.name}`
  if (file.size > MAX_PART_BYTES) return `${slot.label}超过 200MB 上限`
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

/** 紧凑拖拽区（可拖可点；提示文字单行省略保证五个框恒定同高，hover title 看全文） */
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
      <InboxOutlined style={{ fontSize: 20, color: '#6366f1', flexShrink: 0 }} />
      <div
        title={hint}
        style={{
          fontSize: 13,
          color: '#64748b',
          lineHeight: 1.4,
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {hint}
      </div>
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

/** ingest 报告 → 失败部件汇总文案（成功部件不提示；全成功返回 null） */
function ingestFailures(ingest: PartIngestReport | undefined): string | null {
  if (!ingest) return null
  const lines: string[] = []
  for (const slot of PART_SLOTS) {
    const info = ingest[slot.key]
    if (info?.provided && info.ok === false) {
      lines.push(`${slot.label}：${info.error ?? '未知错误'}`)
    }
  }
  return lines.length ? lines.join('；') : null
}

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

  // 五部件所选文件（create/edit 共用；内容解析在后端，前端只做扩展名/大小预检）
  const [partFiles, setPartFiles] = useState<Record<PartKey, File | null>>({
    design_md: null,
    tokens: null,
    components: null,
    patterns: null,
    skill: null,
  })
  const [partErrors, setPartErrors] = useState<Record<PartKey, string | null>>({
    design_md: null,
    tokens: null,
    components: null,
    patterns: null,
    skill: null,
  })

  // 作者（AutoComplete 输入框 + /getAccount 联想，选中即得完整值；已选以可删除标签展示）
  const [authors, setAuthors] = useState<AuthorEntry[]>([])
  const [authorOptions, setAuthorOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  // 当前搜索词：options 只在有搜索词时才有内容 —— 点击/聚焦下拉恒为空白，
  // 搜索结果只在输入后展示，选中/清空输入后立即清除（不残留上次结果）
  const [authorKeyword, setAuthorKeyword] = useState('')
  const [authorInput, setAuthorInput] = useState('')
  const [authorSearching, setAuthorSearching] = useState(false)
  const authorMap = useRef<Map<string, AuthorEntry>>(new Map())
  const authorContainerRef = useRef<HTMLDivElement>(null)
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
    setPartFiles({ design_md: null, tokens: null, components: null, patterns: null, skill: null })
    setPartErrors({ design_md: null, tokens: null, components: null, patterns: null, skill: null })
    setAuthors(isCreate ? [] : (item?.author ?? []))
    setAuthorOptions([])
    setAuthorKeyword('')
    setAuthorInput('')
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

  /** 部件槽文件选择（扩展名/大小预检；内容解析与结构校验由后端逐部件完成） */
  const handlePartFile = (key: PartKey, f: File) => {
    const err = validatePartFile(key, f)
    setPartFiles((prev) => ({ ...prev, [key]: err ? null : f }))
    setPartErrors((prev) => ({ ...prev, [key]: err }))
  }

  /** 移除已选部件文件 */
  const removePartFile = (key: PartKey) => {
    setPartFiles((prev) => ({ ...prev, [key]: null }))
    setPartErrors((prev) => ({ ...prev, [key]: null }))
  }

  /** 作者联想搜索（/getAccount，300ms 防抖 + 超时取消；无匹配即无可选项，不支持手动输入） */
  const handleAuthorSearch = (value: string) => {
    if (authorDebounce.current) clearTimeout(authorDebounce.current)
    if (authorAbort.current) authorAbort.current.abort()
    const kw = value.trim()
    if (!kw) {
      setAuthorKeyword('')
      setAuthorOptions([])
      setAuthorSearching(false)
      return
    }
    setAuthorKeyword(kw)
    authorDebounce.current = setTimeout(async () => {
      const controller = new AbortController()
      authorAbort.current = controller
      const timeoutId = setTimeout(() => controller.abort(), 6000)
      setAuthorSearching(true)
      let opts: { value: string; label: React.ReactNode }[] = []
      try {
        const items = await api.searchAccounts(kw, controller.signal)
        // 累积合并（不清空）：多轮搜索下已选作者的信息仍可查
        items.forEach((u) => authorMap.current.set(u.account, u))
        opts = items.map(userOption)
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

  /** 输入框选中 → 从搜索映射取完整值追加作者，清空输入框继续输入下一个（已选跳过） */
  const addAuthor = (account: string) => {
    if (!authors.some((a) => a.account === account)) {
      const u = authorMap.current.get(account)
      if (u) setAuthors((prev) => [...prev, u])
    }
    setAuthorInput('')
    setAuthorKeyword('')
    setAuthorOptions([])
  }

  /** 标签 × / Backspace（空输入时）移除作者 */
  const removeAuthor = (account: string) => {
    setAuthors((prev) => prev.filter((a) => a.account !== account))
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

  /** 收集已选部件 → PartFiles（仅含提供了的；空对象 = 纯壳） */
  const collectParts = (): PartFiles => {
    const parts: PartFiles = {}
    for (const slot of PART_SLOTS) {
      const f = partFiles[slot.key]
      if (f) parts[slot.key] = f
    }
    return parts
  }

  /** 提交：create 一次 multipart（部件 + meta）；
   *  edit 先 PUT /{slug}/parts（如选了替换部件）再 PATCH（如有变化；作者数组仅变化时提交） */
  const submit = async () => {
    setSubmitting(true)
    try {
      // validateFields 需在 try 内：校验失败时 antd reject 的是 {errorFields} 对象（非 Error）
      const values = await form.validateFields()
      const parts = collectParts()
      if (isCreate) {
        const result = await api.create(parts, {
          name: values.name,
          desc: values.desc,
          default: values.default,
        }, { coverFile, iconFile, authors })
        // 逐部件独立成败：失败部件已忽略，红字汇总提示（成功部件照常入库）
        const failed = ingestFailures(result.ingest)
        if (failed) {
          message.warning(`已新增「${result.name}」，但以下部件导入失败（已忽略）：${failed}`)
        } else {
          message.success(`已新增「${result.name}」`)
        }
        onClose()
        onSuccess?.(result)
        return
      }
      if (item) {
        let updated: DesignSystemItem = item
        // edit 模式：选了替换部件 → PUT /{slug}/parts（仅换提供部件；失败部件忽略并汇总提示）
        if (isEdit && Object.keys(parts).length > 0) {
          const result = await api.putParts(item.slug, parts)
          const failed = ingestFailures(result.ingest)
          if (failed) message.warning(`部件替换完成，但以下部件失败（已忽略，保留存量）：${failed}`)
          updated = result
        }
        const patch: Partial<DesignSystemMeta> = {}
        if (values.name !== item.name) patch.name = values.name
        if (values.desc !== (item.desc ?? '')) patch.desc = values.desc
        if (values.default !== (item.default ?? false)) patch.default = values.default
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
      }
    } catch (e) {
      // 校验失败的 reject 对象带 errorFields，字段错误已在表单上标红展示，无需额外提示
      if (e && typeof e === 'object' && 'errorFields' in e) return
      message.error(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  /** 下载链接（Blob 化触发浏览器保存，避免 /static 直开） */
  const downloadByUrl = async (url: string, filename: string) => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(objUrl)
    } catch (e) {
      message.error(e instanceof Error ? e.message : String(e))
    }
  }

  const title = useMemo(() => {
    if (isCreate) return '新增设计系统'
    if (isView) return `查看 — ${item?.name ?? ''}`
    return `编辑 — ${item?.name ?? ''}`
  }, [isCreate, isView, item?.name])

  const hasPartError = Object.values(partErrors).some(Boolean)

  // 部件全部可选（纯壳系统合法）：提交门槛只有部件预检错误（名称必填由表单校验兜底）
  const canSubmit = !hasPartError

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* 模拟输入框容器：已选标签 + borderless AutoComplete 融为一体（标签在输入框内）；
            position:relative 锚定下拉（getPopupContainer 指向此容器，下拉宽度恒等于容器宽度） */}
        <div
          ref={authorContainerRef}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 3,
            width: INPUT_WIDTH,
            minHeight: 32,
            padding: '2px 6px',
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            cursor: 'text',
            background: '#fff',
            position: 'relative',
          }}
          onClick={() => {
            document.querySelector<HTMLInputElement>('.ds-author-input .ant-select-selection-search-input')?.focus()
          }}
        >
          {authors.map((a) => (
            <Tag
              key={a.account}
              closable
              onClose={(e) => {
                e.preventDefault()
                removeAuthor(a.account)
              }}
            >
              {authorLabel(a)}
            </Tag>
          ))}
          {/* borderless AutoComplete：打字弹下拉建议；无搜索词不弹（不残留）；已选置灰防重复 */}
          <div className="ds-author-input" style={{ flex: 1, minWidth: 60 }}>
            <AutoComplete
              variant="borderless"
              value={authorInput}
              options={authorOptions.map((o) => ({
                ...o,
                disabled: authors.some((a) => a.account === o.value),
              }))}
              onSearch={(v) => {
                setAuthorInput(v)
                handleAuthorSearch(v)
              }}
              onSelect={(val) => addAuthor(val as string)}
              onKeyDown={(e) => {
                // 空输入时 Backspace 删除最后一个作者（对齐多选输入框的键盘体验）
                if (e.key === 'Backspace' && !authorInput && authors.length) {
                  e.preventDefault()
                  setAuthors((prev) => prev.slice(0, -1))
                }
              }}
              placeholder={authors.length === 0 ? '搜索账号/昵称添加作者' : ''}
              notFoundContent={
                authorSearching
                  ? '搜索中…'
                  : authorKeyword
                    ? `未找到「${authorKeyword}」相关成员`
                    : null
              }
              filterOption={false}
              getPopupContainer={() => authorContainerRef.current ?? document.body}
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { width: '100%', position: 'absolute', top: '100%', left: 0, marginTop: 4 } } }}
              style={{ width: '100%', padding: 0 }}
            />
          </div>
        </div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          选中即带出完整人员信息（昵称/部门）
        </Typography.Text>
      </div>
    )
  }

  /** 部件存量状态文案（edit 槽位上方 / view 槽位行共用） */
  const partStatusText = (key: PartKey): string => {
    if (!item?.parts) return ''
    const parts = item.parts
    switch (key) {
      case 'design_md':
        return parts.design_md ? '已上传' : '未上传'
      case 'tokens':
        return parts.tokens ? '已上传（token 区块）' : '未上传'
      case 'components':
        return parts.components ? `已上传（${parts.components_count} 个组件）` : '未上传'
      case 'patterns':
        return parts.patterns ? `已上传（${parts.patterns_count} 个 Pattern）` : '未上传'
      case 'skill':
        return parts.skill ? `已上传（技能名：${item.skill_name ?? '—'}）` : '未上传'
    }
    return ''
  }

  /** 槽位自身的文件下载链接（view 槽位行内嵌；组件包/Pattern 包为解压子树无原件，不提供下载） */
  const partDownloadLink = (key: PartKey) => {
    if (!item) return null
    if (key === 'design_md' && item.design_md_url) {
      return (
        <Typography.Link
          onClick={() => downloadByUrl(item.design_md_url!, 'DESIGN.md')}
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <DownloadOutlined />
          下载
        </Typography.Link>
      )
    }
    if (key === 'tokens' && item.tokens_url) {
      return (
        <Typography.Link
          onClick={() => downloadByUrl(item.tokens_url!, 'tokens.json')}
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <DownloadOutlined />
          下载
        </Typography.Link>
      )
    }
    if (key === 'skill' && item.skill_zip_url) {
      return (
        <Typography.Link
          onClick={() => downloadByUrl(item.skill_zip_url!, item.skill_zip_url!.split('/').pop() || 'skill.zip')}
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <DownloadOutlined />
          下载
        </Typography.Link>
      )
    }
    return null
  }

  /** 单个部件槽（三态）：
   *  view = 自身状态（✓/✗ + 计数/技能名）+ 自身文件下载；
   *  create = 拖拽区（选中显示文件名）；
   *  edit = 存量状态 + 可选替换拖拽区 */
  const renderPartSlot = (slot: (typeof PART_SLOTS)[number]) => {
    const file = partFiles[slot.key]
    const err = partErrors[slot.key]
    if (isView) {
      const ok = !!item?.parts?.[slot.key]
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
          {ok ? (
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
          ) : (
            <MinusCircleOutlined style={{ color: '#bfbfbf' }} />
          )}
          <span style={{ color: ok ? undefined : '#8c8c8c' }}>{partStatusText(slot.key)}</span>
          {ok && partDownloadLink(slot.key)}
        </div>
      )
    }
    if (isCreate) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: INPUT_WIDTH }}>
          <CompactDropzone
            accept={slot.accept}
            beforeUpload={(f) => handlePartFile(slot.key, f)}
            hint={file ? `${file.name}（${fmtSize(file.size)}）· 点击重新选择` : slot.hint}
          />
          {err && (
            <Typography.Text type="danger" style={{ fontSize: 12 }}>
              {err}
            </Typography.Text>
          )}
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: INPUT_WIDTH }}>
        <Typography.Text
          type={item?.parts?.[slot.key] ? 'success' : 'secondary'}
          style={{ fontSize: 12 }}
        >
          当前状态：{partStatusText(slot.key)}
        </Typography.Text>
        <CompactDropzone
          accept={slot.accept}
          beforeUpload={(f) => handlePartFile(slot.key, f)}
          hint={
            file
              ? `将替换为：${file.name}（${fmtSize(file.size)}）`
              : `替换 ${slot.label}（可选）`
          }
        />
        {file && (
          <Typography.Link style={{ fontSize: 12, width: 'fit-content' }} onClick={() => removePartFile(slot.key)}>
            取消替换（保留存量）
          </Typography.Link>
        )}
        {err && (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            {err}
          </Typography.Text>
        )}
      </div>
    )
  }

  /** view 底部小字：规范 id / 内容合计 / 更新时间 */
  const renderViewMetaLine = () => {
    if (!item) return null
    return (
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        规范 id {item.source_slug || item.slug} · 内容合计 {fmtSize(item.file_size)} · 更新于{' '}
        {item.updated_at ? dayjs(item.updated_at).format('YYYY-MM-DD HH:mm') : '—'}
      </Typography.Text>
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
        width={620}
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
          <div style={{ padding: '8px 0', maxHeight: '72vh', overflowY: 'auto' }}>
            <Row label="设计系统名称" required padContent={isView}>
              {renderInput('name', '设计系统名称', true)}
            </Row>
            <Row label="作者" padContent={isView}>
              {renderAuthorRow()}
            </Row>
            {PART_SLOTS.map((slot) => (
              <Row key={slot.key} label={slot.label} padContent={isView}>
                {renderPartSlot(slot)}
              </Row>
            ))}
            {isView && (
              <Row label="" padContent>
                {renderViewMetaLine()}
              </Row>
            )}
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
            {isCreate && (
              <Row label="">
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  五个部件全部可选（逐部件独立成败，失败部件自动忽略）；一个都不选 = 仅创建名称的纯壳系统，稍后可经「编辑」补传。
                </Typography.Text>
              </Row>
            )}
          </div>
        </Form>
      </Modal>
    </>
  )
}
