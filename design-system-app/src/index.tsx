/* @refresh reload */
import { render } from "solid-js/web"
import { Router, Route, Navigate } from "@solidjs/router"
import type { JSX } from "solid-js"
import DesignSystemPage from "./pages/design-system"
import "./index.css"

function App(props: { children?: JSX.Element }): JSX.Element {
  return <>{props.children}</>
}

render(
  () => (
    <Router root={App}>
      <Route path="/" component={() => <Navigate href="/design-system" />} />
      <Route path="/design-system/:id?" component={DesignSystemPage} />
    </Router>
  ),
  document.getElementById("root")!
)
