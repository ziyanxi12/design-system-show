#!/usr/bin/env python3
"""构造设计系统 zip 上传链路的全部测试包（octo-design-zip/1）。

用法：
    python3 make_test_zips.py        # 在本目录生成全部测试包
    python3 make_test_zips.py --verify  # 生成后逐个打到 http://localhost:8009/api/design-systems/parse 验证预期结果

命名规则：valid-*（应解析/上传成功）、invalid-*（应 400 拒绝）、zip-bomb（安全拒绝）。
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
import zipfile

BASE = os.path.dirname(os.path.abspath(__file__))
PARSE_URL = "http://localhost:8009/api/design-systems/parse"

DESIGN_MD = """---
format: octo-design-md/1
id: e2e-system
name: "E2E 测试系统"
author: "tester01"
cover: cover-cyan.jpg
usage: 143
---

# E2E 测试系统

> 端到端测试（frontmatter usage=143 用于验证「不允许直接使用」规则）。

## 概览 {#overview}

概览正文第一段。

### 设计原则

- 原则一：一致性优先。

## 颜色 {#color}

颜色区块说明。

```json design
{
  "title": "颜色",
  "groups": [
    {
      "name": "品牌色",
      "tokens": [
        { "name": "--color-primary", "value": "#1677ff", "comment": "主色" }
      ]
    }
  ]
}
```
"""

DESIGN_MD_V2 = DESIGN_MD.replace("id: e2e-system", "id: e2e-system-v2")

DESIGN_MD_NO_TOKEN = """---
format: octo-design-md/1
id: no-token-section
name: "无 token 区块系统"
---

# 无 token 区块系统

## 概览 {#overview}

只有概览，没有任何 token 区块（color/typography/spacing/radius/shadow 全缺）。
"""

DESIGN_MD_BAD = "没有 frontmatter 的普通文档，服务端解析应直接失败。"

BUTTON_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
.btn { display:inline-flex; align-items:center; gap:6px; padding:6px 16px; border-radius:6px; font:14px/20px "HarmonyOS Sans SC", sans-serif; cursor:pointer; border:1px solid transparent; }
.btn-primary { background:#1677ff; color:#fff; }
.btn-default { background:#fff; color:rgba(0,0,0,.88); border-color:#d9d9d9; }
</style></head>
<body>
  <button class="btn btn-primary">主要按钮</button>
  <button class="btn btn-default">默认按钮</button>
</body></html>
"""

INPUT_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
.input { padding:6px 12px; border:1px solid #d9d9d9; border-radius:6px; font:14px/20px sans-serif; width:220px; }
</style></head>
<body>
  <input class="input" placeholder="请输入内容" />
</body></html>
"""

PATTERN_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
.form { display:grid; grid-template-columns:80px 240px; gap:14px 16px; align-items:center; font:14px/22px sans-serif; }
.form label { color:rgba(0,0,0,.6); text-align:right; }
</style></head>
<body>
  <div class="form">
    <label>名称</label><span>设备管理</span>
    <label>描述</label><span>设备接入与监控</span>
  </div>
</body></html>
"""

BUTTON_CSS = ".btn{font-size:14px}"


def make_zip(name, entries, prefix=""):
    path = os.path.join(BASE, name)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for rel, content in entries:
            zf.writestr(prefix + rel, content)
    return name


def valid_assets_entries(components=None, patterns=None):
    entries = []
    for rel, content in (components or {}).items():
        entries.append(("assets/components/" + rel, content))
    for rel, content in (patterns or {}).items():
        entries.append(("assets/patterns/" + rel, content))
    return entries


def main():
    written = []

    written.append(make_zip(
        "valid-full.zip",
        [("DESIGN.md", DESIGN_MD)]
        + valid_assets_entries(
            components={"basic/button.html": BUTTON_HTML, "basic/button.css": BUTTON_CSS, "basic/input.html": INPUT_HTML},
            patterns={"form/list-layout.html": PATTERN_HTML},
        )
        + [("skill-design.zip", b"demo skill attachment")],
    ))

    written.append(make_zip("valid-minimal.zip", [("DESIGN.md", DESIGN_MD)]))

    written.append(make_zip(
        "valid-wrapper.zip",
        [("DESIGN.md", DESIGN_MD)]
        + valid_assets_entries(components={"basic/button.html": BUTTON_HTML})
        + [("skill-design.zip", b"skill")],
        prefix="pkg/",
    ))

    written.append(make_zip(
        "valid-reupload-v2.zip",
        [("DESIGN.md", DESIGN_MD_V2)]
        + valid_assets_entries(components={"a/card.html": BUTTON_HTML}),
    ))

    written.append(make_zip(
        "valid-duplicate-names.zip",
        [("DESIGN.md", DESIGN_MD)]
        + valid_assets_entries(components={"a/button.html": BUTTON_HTML, "b/button.html": BUTTON_HTML}),
    ))

    written.append(make_zip(
        "valid-big-html.zip",
        [("DESIGN.md", DESIGN_MD)]
        + valid_assets_entries(components={"big/huge.html": "<html><body>" + "x" * (3 * 1024 * 1024) + "</body></html>"}),
    ))

    chunked_entries = (
        [("DESIGN.md", DESIGN_MD)]
        + valid_assets_entries(components={"basic/button.html": BUTTON_HTML}, patterns={"form/list-layout.html": PATTERN_HTML})
        + [("skill-design.zip", b"skill")]
        + [("assets/components/filler.bin", os.urandom(21 * 1024 * 1024))]
    )
    written.append(make_zip("valid-chunked-21mb.zip", chunked_entries))

    written.append(make_zip(
        "invalid-not-zip.zip",
        [("garbage.bin", b"this is not a zip file " * 50)],
    ))
    with open(os.path.join(BASE, "invalid-not-zip.zip"), "wb") as f:
        f.write(b"garbage bytes pretending to be a zip " * 20)

    written.append(make_zip(
        "invalid-missing-design-md.zip",
        valid_assets_entries(components={"basic/button.html": BUTTON_HTML}),
    ))

    written.append(make_zip("invalid-bad-design-md.zip", [("DESIGN.md", DESIGN_MD_BAD)]))

    written.append(make_zip("invalid-no-token-section.zip", [("DESIGN.md", DESIGN_MD_NO_TOKEN)]))

    path = os.path.join(BASE, "invalid-zip-slip.zip")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(zipfile.ZipInfo("../evil.txt"), "x")
    written.append("invalid-zip-slip.zip")

    path = os.path.join(BASE, "invalid-backslash-slip.zip")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(zipfile.ZipInfo("..\\..\\evil.txt"), "x")
    written.append("invalid-backslash-slip.zip")

    path = os.path.join(BASE, "invalid-absolute-path.zip")
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr(zipfile.ZipInfo("/etc/passwd"), "x")
    written.append("invalid-absolute-path.zip")

    path = os.path.join(BASE, "invalid-symlink.zip")
    with zipfile.ZipFile(path, "w") as zf:
        info = zipfile.ZipInfo("link")
        info.external_attr = 0o120777 << 16
        zf.writestr(info, "/etc/passwd")
    written.append("invalid-symlink.zip")

    path = os.path.join(BASE, "zip-bomb.zip")
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bomb.bin", b"\0" * (200 * 1024 * 1024))
    written.append("zip-bomb.zip")

    with open(os.path.join(BASE, "wrong-ext-design.md"), "w", encoding="utf-8") as f:
        f.write(DESIGN_MD)

    for name in written:
        p = os.path.join(BASE, name)
        print(f"{name:32s} {os.path.getsize(p):>10,} bytes")
    print(f"{'wrong-ext-design.md':32s} {os.path.getsize(os.path.join(BASE, 'wrong-ext-design.md')):>10,} bytes")
    print(f"\n共 {len(written) + 1} 个测试文件")

    if "--verify" in sys.argv:
        verify()


EXPECT = {
    "valid-full.zip": (200, "components=2 patterns=1 skill_zip=True"),
    "valid-minimal.zip": (200, "components=0"),
    "valid-wrapper.zip": (200, "components=1"),
    "valid-reupload-v2.zip": (200, "slug=e2e-system-v2"),
    "valid-duplicate-names.zip": (200, "unique ids"),
    "valid-big-html.zip": (200, "html not embedded"),
    "valid-chunked-21mb.zip": (200, "chunked upload"),
    "invalid-not-zip.zip": (400, "不是合法的 zip"),
    "invalid-missing-design-md.zip": (400, "缺少 DESIGN.md"),
    "invalid-bad-design-md.zip": (400, "frontmatter"),
    "invalid-no-token-section.zip": (400, "token 区块"),
    "invalid-zip-slip.zip": (400, "回溯"),
    "invalid-backslash-slip.zip": (400, "回溯"),
    "invalid-absolute-path.zip": (400, "绝对路径"),
    "invalid-symlink.zip": (400, "符号链接"),
    "zip-bomb.zip": (400, "压缩比异常"),
    "wrong-ext-design.md": (400, "仅支持上传 zip"),
}


def verify():
    print("\n── 验证（POST /api/design-systems/parse）──")
    ok = fail = 0
    for name, (want_status, hint) in EXPECT.items():
        path = os.path.join(BASE, name)
        with open(path, "rb") as f:
            content = f.read()
        boundary = uuid.uuid4().hex
        body = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{name}"\r\n'
            f"Content-Type: application/zip\r\n\r\n"
        ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            PARSE_URL,
            data=body,
            method="POST",
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            resp = urllib.request.urlopen(req)
            status, payload = resp.status, json.load(resp)
        except urllib.error.HTTPError as e:
            status, payload = e.code, json.load(e)
        got_ok = status == want_status
        detail = payload.get("detail", "") if status == 400 else (
            f"组件 {payload['stats']['components']} · Pattern {payload['stats']['patterns']} · 附件 {'有' if payload['skill_zip']['present'] else '无'}"
        )
        mark = "PASS" if got_ok else "FAIL(期望 %s)" % want_status
        print(f"[{mark}] {name:32s} → {status} {detail}")
        ok += got_ok
        fail += not got_ok
    print(f"\n结果：{ok} 通过 / {fail} 失败")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
