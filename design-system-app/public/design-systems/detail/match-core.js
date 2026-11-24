/* 匹配核心 —— 组件 ↔ Pixso 组件名匹配 + instance_spec 生成 + Pixso 链接解析
 *
 * 零依赖 ESM，Node 与浏览器双端共用同一份逻辑：
 *   - design-system-app/public/design-systems/detail/edit-mode.js（编辑路由向导/编辑弹窗，动态 import）
 *   - scripts/pixso-mapping/match-mapping.mjs（批量回填脚本，Node 直接 import）
 *
 * 匹配口径（只用名字，四层递进）：
 *   L1 精确     exact  → aligned   HTML 名 === Pixso 名（区分大小写）
 *   L2 归一化   fuzzy  → partial   norm() 去分隔符+小写后比对
 *   L3 英文提取 fuzzy  → partial   en() 去中文等非 ASCII 后比对（处理「按钮 Button」混合名）
 *   未命中      —      → missing   四层都没找到
 *
 * 单射防串：一个 Pixso 组件（集）至多被一个 HTML 组件占用（used Set）。
 *
 * HTML 组件名来源：design-system.json 的 components.items[].name（= 映射表 join 键 component_name）
 * Pixso 候选名来源：组件库清单（fetch-subscribe.js → mock-api GET /pixso/libraries/:id 返回的 components）
 */

/**
 * 归一化：去掉 - _ 与空白后转小写（L2 匹配口径）。
 * "CheckBox" → "checkbox"；"Text-Button" → "textbutton"。
 * 不去除中文字符——中英混合名走 L3 的 en() 提取。
 */
export function norm(s) {
  return String(s).replace(/[-_\s]/g, "").toLowerCase();
}

/**
 * 提取纯 ASCII 英文部分并归一化（L3 匹配口径，处理中英混合名）。
 * 去掉所有非 ASCII 字符（中文/emoji/全角等），再去分隔符+小写。
 * "按钮 Button" → "button"（去掉中文"按钮"，保留英文"Button"再归一）
 * "Button"      → "button"
 * "按钮"        → ""（纯中文 → 空串，不参与 L3 匹配，避免误命中）
 */
export function en(s) {
  return String(s).replace(/[^\x20-\x7E]/g, "").replace(/[-_\s]/g, "").toLowerCase().trim();
}

/** 噪音组件过滤：`.` 前缀私有 / TUI-SVG / Text-to-UI Icon（不参与匹配） */
function isNoise(name) {
  return name.startsWith(".") || name.startsWith("TUI-SVG") || name.startsWith("Text-to-UI Icon");
}

/**
 * 组件条目的缩略图取值：thumbnail_url 原样返回；空 / placeholder 占位 → ""（不参与拷贝渲染）。
 * thumbnail_url 是图片服务（组件库后端）的相对路径（/ 开头，如 /static/design-systems/pixso-thumbs/222-400.png），
 * 前端渲染时拼 window.location.origin + "/api" 前缀访问。
 */
export function thumbVal(entry) {
  const t = String((entry && entry.thumbnail_url) || "");
  return t && t.indexOf("placeholder") < 0 ? t : "";
}

/**
 * 组件集缩略图选图规则（buildCandidates 与 edit-mode guidIndex 共用，保证卡片/下拉/弹窗三处图一致）：
 * 变体条目的 thumbnail_url 优先取「指向集锚点图」的（值含 {锚点 guid 去冒号}.png，如 19-1378.png），
 * 没有则取首个非空——集锚点本身不是 components 的 key，只能从变体条目里挑。
 *
 * @param {string[]} variantThumbs 变体条目的 thumbnail_url 列表（已过滤 placeholder）
 * @param {string} anchorGuid 组件集锚点 guid（containingStateGroup.nodeId，如 "19:1378"）
 * @returns {string} 选中的缩略图相对路径（无候选 → ""）
 */
export function pickSetThumb(variantThumbs, anchorGuid) {
  const list = (variantThumbs || []).filter(Boolean);
  if (!list.length) return "";
  const anchor = String(anchorGuid || "").replace(/:/g, "-") + ".png";
  return list.find((t) => t.indexOf(anchor) >= 0) || list[0];
}

/**
 * 候选构建：把 Pixso 组件库的原始清单（guid 为 key）整理成可匹配的候选池。
 *
 * 处理规则：
 *   有 containingStateGroup → 变体 → 按集名聚合到 sets（锚点 guid = 集 nodeId）
 *     例：Accordion 集有 2 个变体（State=Collapsed / State=Expanded）→ 1 个候选 "Accordion"
 *   无 containingStateGroup → 普通组件 → 取名字首段放 plains（名字 "/" 前的部分）
 *     例：name: "Input" → 1 个候选 "Input"
 *   噪音过滤：`.` 前缀 / TUI-SVG / Text-to-UI Icon 开头的 → 跳过
 *
 * @param {Record<string, Object>} components 组件库清单（guid 为 key）
 * @returns {{ sets: Map<string, {guid, category, variants, contentKey, thumb}>, plains: Map<string, {guid, category, thumb}> }}
 *   sets：   集名 → { guid: 集锚点 nodeId, category: 分类, variants: 变体名列表, contentKey: 内容 hash, thumb: 集缩略图 }
 *   plains： 组件名 → { guid: node_id, category: 分类, thumb: 缩略图 }
 */
export function buildCandidates(components) {
  const sets = new Map();   // 组件集：集名 → { guid, category, variants[], contentKey, vthumbs[], thumb }
  const plains = new Map(); // 普通组件：名字首段 → { guid, category, thumb }
  for (const x of Object.values(components || {})) {
    const cf = x.containing_frame || {};
    const sg = cf.containingStateGroup; // 有 containingStateGroup → 变体，无 → 普通组件

    if (sg) {
      /* 变体：归并到所属组件集（按集名去重，集 guid = containingStateGroup.nodeId） */
      let s = sets.get(sg.name);
      if (!s) {
        s = { guid: sg.nodeId, category: cf.name || "", variants: [], contentKey: x.component_key || null, vthumbs: [], thumb: "" };
        sets.set(sg.name, s);
      }
      /* 收集每个变体的名字（instance_spec 生成用）与缩略图（集选图规则见 pickSetThumb） */
      if (x.name) s.variants.push(String(x.name));
      const t = thumbVal(x);
      if (t) s.vthumbs.push(t);
    } else {
      /* 普通组件：取名字首段（"/" 前部分）作为候选名 */
      const first = String(x.name || "").split("/")[0];
      if (!first || isNoise(first)) continue; // 噪音跳过
      if (!plains.has(first)) plains.set(first, { guid: x.node_id, category: cf.name || "", thumb: thumbVal(x) });
    }
  }
  /* 组件集缩略图：变体候选里选（锚点图优先） */
  for (const s of sets.values()) s.thumb = pickSetThumb(s.vthumbs, s.guid);

  /* 调试：打印候选池（浏览器 console + Node CLI 均可看到） */
  console.log("[match-core] 候选池：" + sets.size + " 个组件集 + " + plains.size + " 个普通组件 = " + (sets.size + plains.size) + " 个候选");
  if (sets.size > 0) console.log("[match-core] 组件集名：" + [...sets.keys()].join("、"));
  if (plains.size > 0) console.log("[match-core] 普通组件名：" + [...plains.keys()].join("、"));

  return { sets, plains };
}

/**
 * 名字匹配（四层递进 + 单射防串）。
 *
 * 每个传入的 HTML 组件名依次尝试：
 *   L1 精确：     name === pname（区分大小写）          → exact  / aligned
 *   L2 归一化：   norm(name) === norm(pname)            → fuzzy  / partial
 *   L3 英文提取： en(name) === en(pname)               → fuzzy  / partial
 *                 处理「按钮 Button」→ 提取 "button" 与 "Button" 匹配
 *   未命中：      四层都没找到                           → missing
 *
 * 单射防串：used Set 记录已占用的 Pixso 名——一个 Pixso 候选只能被一个 HTML 组件匹配。
 * 例：如果第一个 "Input" 已匹配 Pixso 的 "Input"，第二个 HTML "Input" 不会再命中同一个。
 *
 * @param {string[]} htmlNames 本地组件名列表（= design-system.json 的 items[].name）
 * @param {{sets: Map, plains: Map}} candidates buildCandidates 产物
 * @returns {Array<Object>} 每行：{
 *   component_name: "Button",       ← 本地组件名（join 键）
 *   pixso_name: "Button" | null,   ← 匹配到的 Pixso 候选名
 *   pixso_guid: "19:1378" | null,  ← Pixso 组件集/普通组件的 guid（锚点）
 *   pixso_thumb: "/static/..." | null, ← 命中候选的缩略图相对路径（渲染时拼 origin+/api 前缀）
 *   pixso_category: "操作类" | "",  ← Pixso 侧分类
 *   match_type: "exact"|"fuzzy"|null,
 *   status: "aligned"|"partial"|"missing",
 *   kind: "set"|"plain"|null       ← 命中的是组件集还是普通组件
 * }
 */
export function matchAll(htmlNames, candidates) {
  const used = new Set(); // 单射防串：已占用的 Pixso 名

  /* 对一个 HTML 名尝试匹配（四层递进） */
  const matchOne = (name) => {
    /* L1 精确匹配：区分大小写，逐字符比对 */
    for (const [store, kind] of [[candidates.sets, "set"], [candidates.plains, "plain"]]) {
      for (const [pname, info] of store) {
        if (!used.has(pname) && name === pname)
          return { pixso_name: pname, pixso_guid: info.guid, pixso_thumb: info.thumb || null, pixso_category: info.category, match_type: "exact", status: "aligned", kind };
      }
    }
    /* L2 归一化匹配：去 -_ 与空白后转小写比对（处理大小写/分隔符差异） */
    for (const [store, kind] of [[candidates.sets, "set"], [candidates.plains, "plain"]]) {
      for (const [pname, info] of store) {
        if (!used.has(pname) && norm(name) === norm(pname))
          return { pixso_name: pname, pixso_guid: info.guid, pixso_thumb: info.thumb || null, pixso_category: info.category, match_type: "fuzzy", status: "partial", kind };
      }
    }
    /* L3 英文提取匹配：去中文等非 ASCII 后比对（处理「按钮 Button」混合名 → 提取 "button"） */
    const enName = en(name);
    if (enName) { // 空串不参与（纯中文名提取后为空，避免误命中）
      for (const [store, kind] of [[candidates.sets, "set"], [candidates.plains, "plain"]]) {
        for (const [pname, info] of store) {
          if (!used.has(pname) && enName === en(pname))
            return { pixso_name: pname, pixso_guid: info.guid, pixso_thumb: info.thumb || null, pixso_category: info.category, match_type: "fuzzy", status: "partial", kind };
        }
      }
    }
    return null; // 四层都未命中
  };

  /* 逐个 HTML 名匹配，返回结果数组 */
  return htmlNames.map((name) => {
    const m = matchOne(name);
    if (m) used.add(m.pixso_name); // 占用该 Pixso 名，防止后续 HTML 组件重复匹配
    return {
      component_name: name,
      /* 命中 → 展开匹配详情；未命中 → 全空 + missing */
      ...(m || { pixso_name: null, pixso_guid: null, pixso_thumb: null, pixso_category: "", match_type: null, status: "missing", kind: null }),
    };
  });
}

/**
 * instance_spec 生成：从组件集的变体名反推轴值对照表。
 * 变体名形如 "State=Collapsed" / "size=Medium, type=Primary"。
 * 解析后生成：
 *   defaults = { state: "Collapsed" }（首个变体的轴值组合，兜底用）
 *   bridges  = { state: { axis: "state", values: { collapsed: "Collapsed", expanded: "Expanded" } } }
 *
 * 契约含义：runner（D2C 管线）拿到 HTML 侧参数（如 { state: "hover" }），
 * 通过 bridges 翻译为 Pixso 侧轴值（"Hover"），再在 Pixso 里创建实例。
 *
 * @param {string[]} variantNames 组件集全部变体名
 * @returns {{defaults, bridges}|null} 解析不出任何轴 → null
 */
export function buildInstanceSpec(variantNames) {
  const axes = new Map();
  const defaults = {};
  for (const vn of variantNames || []) {
    for (const pair of String(vn).split(",")) {
      const eq = pair.indexOf("=");
      if (eq < 1) continue; // 不含 = 的片段跳过
      const axis = pair.slice(0, eq).trim().toLowerCase(); // 轴名小写归一（State/state 同轴）
      const val = pair.slice(eq + 1).trim();
      if (!axis || !val) continue;
      let a = axes.get(axis);
      if (!a) {
        a = { axis, values: {} };
        axes.set(axis, a);
      }
      if (!(axis in defaults)) defaults[axis] = val; // 首个变体的值作为默认
      a.values[val.toLowerCase()] = val; // 归一化值 → 原值映射
    }
  }
  if (!axes.size) return null;
  const bridges = {};
  for (const [k, a] of axes) bridges[k] = { axis: a.axis, values: a.values };
  return { defaults, bridges };
}

/**
 * 解析 Pixso 跳转链接：抽 fileKey 与组件锚点 guid。
 * 兼容形态：
 *   https://host/design/{fileKey}?item-id=19:1378
 *   https://host/app/design/{fileKey}?page-id=318%3A4076（page-id 回落）
 *
 * @param {string} url Pixso 跳转链接
 * @returns {{fileKey: string|null, guid: string|null}}
 */
export function parsePixsoUrl(url) {
  const out = { fileKey: null, guid: null };
  if (!url || typeof url !== "string") return out;
  try {
    const u = new URL(url.trim());
    /* fileKey 从路径段 /design/{fileKey} 提取 */
    const m = /\/design\/([^/?#]+)/.exec(u.pathname);
    if (m) out.fileKey = decodeURIComponent(m[1]);
    /* guid 从 query 参数提取，item-id 优先，回落 page-id */
    const g = u.searchParams.get("item-id") || u.searchParams.get("page-id");
    if (g) out.guid = g;
  } catch {
    /* 非法 URL 静默回落 */
  }
  return out;
}
