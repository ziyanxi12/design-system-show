/* 匹配核心 —— 组件 ↔ Pixso 组件名匹配 + instance_spec 生成 + Pixso 链接解析
 * 零依赖 ESM，Node 与浏览器双端共用同一份逻辑：
 *   - design-system-app/src/pages/design-system/edit.tsx（编辑路由向导/编辑弹窗，Vite 打包）
 *   - scripts/pixso-mapping/match-mapping.mjs（批量回填脚本，Node 直接 import）
 *
 * 匹配口径（阶段 2 契约，见 docs/component-pixso-mapping.md）：**只用名字**——
 *   L1 精确（exact → aligned）/ L2 归一化（去 -_ 与空白 + 小写，fuzzy → partial）/ 未命中 missing；
 *   单射防串：一个 Pixso 组件（集）至多被一个 HTML 组件占用。
 */

/** 归一化：去掉 -_ 与空白后转小写（L2 匹配口径） */
export function norm(s) {
  return String(s).replace(/[-_\s]/g, "").toLowerCase();
}

/** 噪音组件过滤：`.` 前缀私有 / TUI-SVG / Text-to-UI Icon（与原 match-mapping 脚本一致） */
function isNoise(name) {
  return name.startsWith(".") || name.startsWith("TUI-SVG") || name.startsWith("Text-to-UI Icon");
}

/**
 * Pixso 候选构建：变体按 containingStateGroup 聚合成组件集（锚点 guid = 集 nodeId），
 * 普通组件取名字首段；同时收集每个集的变体名（instance_spec 生成用）与内容 hash（变更检测用）。
 * @param {Record<string, Object>} components 组件库清单（fetch-subscribe.js 的 library.components，guid 为 key）
 * @returns {{ sets: Map<string, {guid: string, category: string, variants: string[], contentKey: string|null}>,
 *            plains: Map<string, {guid: string, category: string}> }}
 */
export function buildCandidates(components) {
  const sets = new Map();
  const plains = new Map();
  for (const x of Object.values(components || {})) {
    const cf = x.containing_frame || {};
    const sg = cf.containingStateGroup;
    if (x.isVariant && sg) {
      let s = sets.get(sg.name);
      if (!s) {
        s = { guid: sg.nodeId, category: cf.name || "", variants: [], contentKey: x.component_key || null };
        sets.set(sg.name, s);
      }
      if (x.name) s.variants.push(String(x.name));
    } else if (!x.isVariant) {
      const first = String(x.name || "").split("/")[0];
      if (!first || isNoise(first)) continue;
      if (!plains.has(first)) plains.set(first, { guid: x.node_id, category: cf.name || "" });
    }
  }
  return { sets, plains };
}

/**
 * 名字匹配（L1 精确 → L2 归一化 → 未命中；单射防串）
 * @param {string[]} htmlNames HTML 组件名列表（= 映射表 join 键 component_name）
 * @param {{sets: Map, plains: Map}} candidates buildCandidates 产物
 * @returns {Array<Object>} 每行：{ component_name, pixso_name, pixso_guid, pixso_category,
 *   match_type: "exact"|"fuzzy"|null, status: "aligned"|"partial"|"missing", kind: "set"|"plain"|null }
 */
export function matchAll(htmlNames, candidates) {
  const used = new Set();
  const matchOne = (name) => {
    for (const [store, kind] of [[candidates.sets, "set"], [candidates.plains, "plain"]]) {
      for (const [pname, info] of store) {
        if (!used.has(pname) && name === pname)
          return { pixso_name: pname, pixso_guid: info.guid, pixso_category: info.category, match_type: "exact", status: "aligned", kind };
      }
    }
    for (const [store, kind] of [[candidates.sets, "set"], [candidates.plains, "plain"]]) {
      for (const [pname, info] of store) {
        if (!used.has(pname) && norm(name) === norm(pname))
          return { pixso_name: pname, pixso_guid: info.guid, pixso_category: info.category, match_type: "fuzzy", status: "partial", kind };
      }
    }
    return null;
  };
  return htmlNames.map((name) => {
    const m = matchOne(name);
    if (m) used.add(m.pixso_name);
    return {
      component_name: name,
      ...(m || { pixso_name: null, pixso_guid: null, pixso_category: "", match_type: null, status: "missing", kind: null }),
    };
  });
}

/**
 * instance_spec 生成：从组件集变体名反推轴值对照（阶段 2 契约：defaults + bridges）。
 * 变体名形如 "State=Collapsed" / "size=Medium, type=Primary"——
 *   轴名小写归一（Pixso 侧 State/state 视作同一轴），值保留原样；
 *   bridges 键 = 归一化轴名（HTML 侧同名轴直通），values = { 归一化值: Pixso 原值 }；
 *   defaults = 清单顺序首个变体的轴值组合（调用方未指定/翻译失败的轴用它兜底）。
 * 解析不出任何轴（变体名不带 = 号）→ 返回 null。
 * @param {string[]} variantNames 组件集全部变体名
 * @returns {{defaults: Object<string,string>, bridges: Object<string,{axis: string, values: Object<string,string>}>}|null}
 */
export function buildInstanceSpec(variantNames) {
  const axes = new Map();
  const defaults = {};
  for (const vn of variantNames || []) {
    for (const pair of String(vn).split(",")) {
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const axis = pair.slice(0, eq).trim().toLowerCase();
      const val = pair.slice(eq + 1).trim();
      if (!axis || !val) continue;
      let a = axes.get(axis);
      if (!a) {
        a = { axis, values: {} };
        axes.set(axis, a);
      }
      if (!(axis in defaults)) defaults[axis] = val;
      a.values[val.toLowerCase()] = val;
    }
  }
  if (!axes.size) return null;
  const bridges = {};
  for (const [k, a] of axes) bridges[k] = { axis: a.axis, values: a.values };
  return { defaults, bridges };
}

/**
 * 解析 Pixso 链接：抽 fileKey（/design/{fileKey} 路径段）与组件锚点 guid（item-id 优先，回落 page-id）。
 * 兼容形态：https://host/design/{fileKey}?item-id=19:1378 、https://host/app/design/{fileKey}?page-id=318%3A4076
 * @param {string} url Pixso 跳转链接
 * @returns {{fileKey: string|null, guid: string|null}} 非法/不匹配 → 均为 null（searchParams 自动解码 %3A → :）
 */
export function parsePixsoUrl(url) {
  const out = { fileKey: null, guid: null };
  if (!url || typeof url !== "string") return out;
  try {
    const u = new URL(url.trim());
    const m = /\/design\/([^/?#]+)/.exec(u.pathname);
    if (m) out.fileKey = decodeURIComponent(m[1]);
    const g = u.searchParams.get("item-id") || u.searchParams.get("page-id");
    if (g) out.guid = g;
  } catch {
    /* 非法 URL 静默回落 */
  }
  return out;
}

/** Pixso 缩略图 URL：guid 去冒号（19:1378 → 19-1378）；suffix "-preview" = 多变体拼合预览图 */
export function pixsoThumb(guid, suffix = "") {
  return guid ? `/static/design-systems/pixso-thumbs/${String(guid).replace(/:/g, "-")}${suffix}.png` : "";
}
