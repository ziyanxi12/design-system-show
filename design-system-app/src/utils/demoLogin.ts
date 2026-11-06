/**
 * 演示专用登录入口（VITE_DEMO_LOGIN=1 时生效）：
 * 打开 `?demo-user=<工号>` 即把对应 mock 用户写入 localStorage `userInfo`
 * （与正式环境统一登录门户写入的位置/结构完全一致），随后剥掉参数刷新地址。
 * 正式环境不设 VITE_DEMO_LOGIN，此入口完全失效。
 */

export const DEMO_PEOPLE: Record<string, { account: string; nickName: string; dept: string[] }> = {
  h20031134: { account: "h20031134", nickName: "何光光", dept: ["华为", "2012实验室", "UX部", "设计一组"] },
  l20031135: { account: "l20031135", nickName: "罗唯", dept: ["华为", "2012实验室", "UX部", "设计二组"] },
  z20041203: { account: "z20041203", nickName: "张三", dept: ["华为", "ICT产品与解决方案", "平台开发部", "前端组"] },
  l20041204: { account: "l20041204", nickName: "李四", dept: ["华为", "ICT产品与解决方案", "平台开发部", "后端组"] },
  w20051507: { account: "w20051507", nickName: "王五", dept: ["华为", "数字能源", "系统设计部", "视觉组"] },
  c20061608: { account: "c20061608", nickName: "陈六", dept: ["华为", "终端云服务", "应用开发部", "质量组"] },
  z20071709: { account: "z20071709", nickName: "赵七", dept: ["华为", "云核心网", "架构部", "平台组"] },
  s20081810: { account: "s20081810", nickName: "孙八", dept: ["华为", "海思半导体", "芯片设计部", "验证组"] },
  z20091911: { account: "z20091911", nickName: "周九", dept: ["华为", "数据存储与机器视觉", "产品部", "运营组"] },
  w20102012: { account: "w20102012", nickName: "吴十", dept: ["华为", "数字金融", "解决方案部", "交付组"] },
}

export function applyDemoLogin(): void {
  if (import.meta.env.VITE_DEMO_LOGIN !== "1") return
  const usp = new URLSearchParams(window.location.search)
  const acc = usp.get("demo-user")
  const person = acc ? DEMO_PEOPLE[acc] : undefined
  if (acc && !person) {
    // eslint-disable-next-line no-console
    console.warn("[demo-login] 未知账号：%s（可选：%s）", acc, Object.keys(DEMO_PEOPLE).join("、"))
  }
  if (person) {
    localStorage.setItem("userInfo", JSON.stringify({
      ...person, deptCode: [], roleID: "", roles: [],
      uid: 0, userID: "u-" + person.account,
    }))
    usp.delete("demo-user")
    const rest = usp.toString()
    window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : "") + window.location.hash)
  }
}
