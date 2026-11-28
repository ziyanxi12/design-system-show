/* @refresh reload */
import { render } from "solid-js/web"
import { HashRouter, Route, Navigate } from "@solidjs/router"
import type { JSX } from "solid-js"
import DesignSystemPage from "./pages/design-system"
import EditMappingPage from "./pages/design-system/edit"
import { applyDemoLogin } from "./utils/demoLogin"
import { initHostUserChannel } from "./utils/auth"
import "./index.css"

// 演示环境：?demo-user=<工号> 写入 mock 登录态（VITE_DEMO_LOGIN 门控，正式环境无操作）
applyDemoLogin()
// 宿主嵌入握手：onload 后向父页面播报就绪并接收 userInfo 兜底（localStorage 优先；仅嵌入时生效）
initHostUserChannel()

function App(props: { children?: JSX.Element }): JSX.Element {
  return <>{props.children}</>
}

render(
  () => (
    <HashRouter root={App}>
      <Route path="/" component={() => <Navigate href="/design-system" />} />
      {/* 映射编辑页（放在可选参数路由之前：同分先定义的赢，防止 edit 被当作 :section 吞掉） */}
      <Route path="/design-system/:id/edit" component={EditMappingPage} />
      {/* :id? 列表页；:section?/:item? 深链段（如 /design-system/{slug}/components/button） */}
      <Route path="/design-system/:id?/:section?/:item?" component={DesignSystemPage} />
      {/* 旧路径别名（早期入口，保留防断链） */}
      <Route path="/edit/:id" component={EditMappingPage} />
      {/* 旧路径别名（早期入口，保留防断链） */}
      <Route path="/edit/:id" component={EditMappingPage} />
    </HashRouter>
  ),
  document.getElementById("root")!
)
