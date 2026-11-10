import http from "node:http";
import { ACCOUNTS } from "./data.js";

const PORT = Number(process.env.PORT || 3090);

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

  // 用户信息查询（USER_INFO_API_URL 协议：?account= 精确查、无鉴权——打点身份完整化用）
  if (req.method === "GET" && url.pathname === "/getUserInfo") {
    const account = url.searchParams.get("account") ?? "";
    const hit = account ? ACCOUNTS.find((item) => item.account === account) : null;
    send(res, 200, hit
      ? { content: { account: hit.account, nickName: hit.nickName, dept: hit.dept, deptCode: [] }, errorCode: 0, success: true }
      : { content: null, errorCode: 404, success: false });
    return;
  }

  send(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`mock-api listening at http://localhost:${PORT}`);
  console.log(`try: curl "http://localhost:${PORT}/getAccount?keyword=hgg" -H "uiplusToken: abc123"`);
});
