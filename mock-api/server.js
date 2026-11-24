import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS } from "./data.js";
import { fetchSubscribedLibraries } from "../scripts/pixso-mapping/fetch-subscribe.js";

const PORT = Number(process.env.PORT || 3090);

/* ── 组件缩略图图片服务（mock）──
 * 真实环境图片由独立的图片服务存储，前端用 origin + "/api" + thumbnail_url 访问（网关路由）。
 * demo 用本服务模拟该图片服务：只放 thumbs/ 下几张样例图（从真实缩略图拷贝），
 * 任何 /static/design-systems/pixso-thumbs/*.png 请求都按「路径稳定散列」落到样例图之一
 * ——同一 URL 永远返回同一张，前端任意 thumbnail_url 路径都能出图。 */
const THUMB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "thumbs");
const THUMB_RE = /^\/static\/design-systems\/pixso-thumbs\/[\w.-]+\.png$/;
const THUMB_SAMPLES = (() => {
  try {
    return fs
      .readdirSync(THUMB_DIR)
      .filter((f) => f.endsWith(".png"))
      .map((f) => fs.readFileSync(path.join(THUMB_DIR, f)));
  } catch {
    return []; // thumbs/ 缺失 → 路由 404，不影响其余端点
  }
})();
function thumbPick(p) {
  let h = 0;
  for (const ch of p) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return THUMB_SAMPLES[h % THUMB_SAMPLES.length];
}

/* 订阅组件库快照：启动时加载一次（demo 数据为写死的 JSON，见 fetch-subscribe.js；
 * 正式环境由真实脚本提供同构数据，本服务的对外契约不变） */
const SUBSCRIBE = fetchSubscribedLibraries();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "uiplusToken, Content-Type",
};

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function search(keyword) {
  const kw = keyword.toLowerCase();
  return ACCOUNTS.filter((item) =>
    [item.account, item.nickName, item.userID].some((v) =>
      String(v).toLowerCase().includes(kw)
    )
  );
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/getAccount") {
    const token = req.headers["uiplustoken"];
    if (!token || !String(token).trim()) {
      send(res, 200, { content: null, errorCode: 401, success: false });
      return;
    }

    const keyword = url.searchParams.get("keyword") ?? "";
    const matched = keyword ? search(keyword) : ACCOUNTS;
    send(res, 200, {
      content: { [keyword]: matched },
      errorCode: 0,
      success: true,
    });
    return;
  }

  // 管理台人员搜索（同源网关路径 getW3UserByAccounts：生产由 nginx /main 网关承载，
  // dev 经 admin vite proxy /main → 3090 命中此处；协议与 /getAccount 完全同构）
  if (
    req.method === "GET" &&
    url.pathname === "/main/rest.root/workspace/user/getW3UserByAccounts"
  ) {
    const token = req.headers["uiplustoken"];
    if (!token || !String(token).trim()) {
      send(res, 200, { content: null, errorCode: 401, success: false });
      return;
    }

    const keyword = url.searchParams.get("keyword") ?? "";
    const matched = keyword ? search(keyword) : ACCOUNTS;
    send(res, 200, {
      content: { [keyword]: matched },
      errorCode: 0,
      success: true,
    });
    return;
  }

  // 用户信息查询（USER_INFO_API_URL 协议：?account= 精确查、无鉴权——打点身份完整化用）
  if (req.method === "GET" && url.pathname === "/getUserInfo") {
    const account = url.searchParams.get("account") ?? "";
    const hit = account ? ACCOUNTS.find((item) => item.account === account) : null;
    send(res, 200, hit
      ? { content: { account: hit.account, nickName: hit.nickName, dept: hit.dept, deptCode: [] }, errorCode: 0, success: true }
      : { content: null, errorCode: 404, success: false });
    return;
  }

  // 组件库订阅列表（编辑路由「关联设计组件」向导：选择规范的领域树 + 搜索数据源；
  // 投影库元信息，不含 components 明细——选定库后走 /main 网关接口按 fileKey 取全量）
  if (req.method === "GET" && url.pathname === "/pixso/libraries") {
    SUBSCRIBE.then(
      (snap) =>
        send(res, 200, {
          fetchedAt: snap.fetchedAt,
          libraries: snap.libraries.map(({ components, ...meta }) => ({
            ...meta,
            componentCount: meta.componentCount ?? Object.keys(components || {}).length,
          })),
        }),
      () => send(res, 500, { detail: "订阅组件库数据读取失败" }),
    );
    return;
  }

  // 组件库明细（正式同构接口：GET /main/rest.root/workspace/pixsoFile/library?fileKey=…——
  // 与 getW3UserByAccounts 一样走 /main 网关路径，dev 由 vite proxy /main → 3090 命中此处；
  // 响应为信封 {content:"<JSON 字符串>"}：库数据序列化成 JSON 字符串放在 content，前端二次 JSON.parse）
  const libMatch = /^\/main\/rest\.root\/workspace\/pixsoFile\/library$/.exec(url.pathname);
  if (req.method === "GET" && libMatch) {
    const fileKey = url.searchParams.get("fileKey") || "";
    SUBSCRIBE.then(
      (snap) => {
        const lib = snap.libraries.find((l) => l.fileKey === fileKey);
        if (!lib) {
          send(res, 404, { detail: `组件库不存在：fileKey=${fileKey}` });
          return;
        }
        /* 模拟真实明细结构：顶层仅 file_key（snake_case）+ components 等真实字段——
           剥离 demo 快照的 camelCase 展示元数据（name/version/componentCount 等，
           真实明细响应无这些，向导展示元数据走订阅列表 fetch-subscribe） */
        const { fileKey: fk, id, name, version, componentCount, icon, domain, libraryName, ...rest } = lib;
        send(res, 200, { content: JSON.stringify({ ...rest, file_key: fk }) });
      },
      () => send(res, 500, { detail: "订阅组件库数据读取失败" }),
    );
    return;
  }

  // 组件缩略图（mock 图片服务：任意文件名落到样例图，见文件头注释）
  if (req.method === "GET" && THUMB_RE.test(url.pathname)) {
    if (!THUMB_SAMPLES.length) {
      send(res, 404, { detail: "thumbs/ 样例图缺失" });
      return;
    }
    const buf = thumbPick(url.pathname);
    res.writeHead(200, {
      ...CORS_HEADERS,
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Content-Length": buf.length,
    });
    res.end(buf);
    return;
  }

  send(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`mock-api listening at http://localhost:${PORT}`);
  console.log(`try: curl "http://localhost:${PORT}/getAccount?keyword=hgg" -H "uiplusToken: abc123"`);
});
