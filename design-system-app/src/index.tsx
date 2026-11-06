/* @refresh reload */
import { render } from "solid-js/web"
import { HashRouter, Route, Navigate } from "@solidjs/router"
import type { JSX } from "solid-js"
import DesignSystemPage from "./pages/design-system"
import { applyDemoLogin } from "./utils/demoLogin"
import "./index.css"

// 演示环境：?demo-user=<工号> 写入 mock 登录态（VITE_DEMO_LOGIN 门控，正式环境无操作）
applyDemoLogin()

function App(props: { children?: JSX.Element }): JSX.Element {
  return <>{props.children}</>
}

render(
  () => (
    <HashRouter root={App}>
      <Route path="/" component={() => <Navigate href="/design-system" />} />
      <Route path="/design-system/:id?" component={DesignSystemPage} />
    </HashRouter>
  ),
  document.getElementById("root")!
)
