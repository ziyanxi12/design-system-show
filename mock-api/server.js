import http from "node:http";
import { ACCOUNTS } from "./data.js";
import { fetchSubscribedLibraries } from "../scripts/pixso-mapping/fetch-subscribe.js";

const PORT = Number(process.env.PORT || 3090);

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
  // 投影库元信息，不含 components 明细——选定库后走 /pixso/libraries/:id 取全量）
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

  // 单个组件库全量（选定库后前端匹配的数据源：components 为完整清单，guid 为 key）
  const libMatch = /^\/pixso\/libraries\/([\w.-]+)$/.exec(url.pathname);
  if (req.method === "GET" && libMatch) {
    SUBSCRIBE.then(
      (snap) => {
        const lib = snap.libraries.find((l) => l.id === libMatch[1]);
        if (!lib) {
          send(res, 404, { detail: `组件库不存在：${libMatch[1]}` });
          return;
        }
        send(res, 200, lib);
      },
      () => send(res, 500, { detail: "订阅组件库数据读取失败" }),
    );
    return;
  }

  send(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`mock-api listening at http://localhost:${PORT}`);
  console.log(`try: curl "http://localhost:${PORT}/getAccount?keyword=hgg" -H "uiplusToken: abc123"`);
});
