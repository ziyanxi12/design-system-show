import http from "node:http";

const PORT = Number(process.env.PORT || 3091);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "uiplusToken, Content-Type",
};

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  }, JSON.stringify(body));
}

function avatarSvg(account) {
  const hue = [...account].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
  const fontSize = Math.min(30, Math.floor(160 / account.length));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
  <rect width="120" height="120" fill="#eceef3"/>
  <circle cx="60" cy="60" r="60" fill="hsl(${hue}, 62%, 47%)"/>
  <text x="60" y="${60 + fontSize * 0.35}" text-anchor="middle" font-family="Arial, 'PingFang SC', sans-serif" font-size="${fontSize}" font-weight="600" fill="#ffffff">${account}</text>
</svg>`;
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, CORS_HEADERS);
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const match = url.pathname.match(/^\/face\/([A-Za-z0-9]+)\/120$/);

  if (req.method === "GET" && match) {
    const [, account] = match;
    send(res, 200, {
      ...CORS_HEADERS,
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    }, avatarSvg(account));
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/face/")) {
    sendJson(res, 400, { detail: "路径格式 /face/{account}/120，account 为字母数字，尺寸固定 120" });
    return;
  }

  sendJson(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`face-api listening at http://localhost:${PORT}`);
  console.log(`try: <img src="http://localhost:${PORT}/face/20031134/120">`);
});
