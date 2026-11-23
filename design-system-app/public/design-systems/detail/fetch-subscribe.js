/* fetch-subscribe.js —— 订阅组件库列表获取（前端模块，浏览器兼容）
 *
 * 职责：只提供库列表元数据（不含组件明细）。edit-mode.js 打开向导时直接 import 调用。
 * 组件明细数据：edit-mode.js 在用户点「开始匹配」时通过 HTTP API 按需获取（见 edit-mode.js 的 PIXSO_COMPONENTS_API）。
 *
 * demo 实现：fetchSubscribedLibraries() 直接返回写死的库列表。
 * 正式环境：替换函数体为真实获取，接口与输出结构不变。
 */

const DATA = {
  "fetchedAt": "2026-11-20T10:00:00+08:00",
  "libraries": [
    {
      "id": "hdesign-official",
      "name": "H Design 官网设计规范",
      "domain": "H Design",
      "version": "1.0",
      "componentCount": 38,
      "icon": "harmonyos",
      "fileKey": "8mM_mVuB2jY7d4T0oqFCTg",
      "libraryName": "H Design 官网设计规范",
    },
    {
      "id": "ict-ui",
      "name": "ICT UI_v3.1.1",
      "domain": "ICT基础设施",
      "version": "3.1.1",
      "componentCount": 10,
      "icon": "ict",
      "fileKey": "stubIctUiV311",
      "libraryName": "ICT UI_v3.1.1",
    },
    {
      "id": "terminal-hm70",
      "name": "终端领域HarmonyOS 7.0设计规范",
      "domain": "终端",
      "version": "7.0",
      "componentCount": 9,
      "icon": "harmonyos",
      "fileKey": "stubTerminalHm70",
      "libraryName": "终端领域HarmonyOS 7.0设计规范",
    },
    {
      "id": "huawei-cloud",
      "name": "华为云Space 组件库",
      "domain": "华为云",
      "version": "2.3",
      "componentCount": 6,
      "icon": "cloud",
      "fileKey": "stubHwCloudSpace",
      "libraryName": "华为云Space 组件库",
    },
    {
      "id": "bpit",
      "name": "BP&IT 通用组件库",
      "domain": "BP&IT",
      "version": "1.8",
      "componentCount": 6,
      "icon": "bpit",
      "fileKey": "stubBpitCommon",
      "libraryName": "BP&IT 通用组件库",
    },
    {
      "id": "idee",
      "name": "数字能源 iDEE 组件库",
      "domain": "数字能源",
      "version": "2.0",
      "componentCount": 5,
      "icon": "energy",
      "fileKey": "stubIdee",
      "libraryName": "数字能源 iDEE 组件库",
    },
    {
      "id": "eda",
      "name": "半导体 EDA 组件库",
      "domain": "半导体",
      "version": "1.2",
      "componentCount": 5,
      "icon": "chip",
      "fileKey": "stubEda",
      "libraryName": "半导体 EDA 组件库",
    },
    {
      "id": "gts",
      "name": "GTS 网络运维组件库",
      "domain": "GTS",
      "version": "3.0",
      "componentCount": 5,
      "icon": "gts",
      "fileKey": "stubGtsOps",
      "libraryName": "GTS 网络运维组件库",
    },
    {
      "id": "dev-next",
      "name": "开发者 HarmonyOS Next 组件库",
      "domain": "开发者领域",
      "version": "5.0",
      "componentCount": 5,
      "icon": "harmonyos",
      "fileKey": "stubDevNext",
      "libraryName": "开发者 HarmonyOS Next 组件库",
    }
  ]
};


export async function fetchSubscribedLibraries() {
  return DATA
}
