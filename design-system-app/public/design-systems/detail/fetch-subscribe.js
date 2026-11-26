/* fetch-subscribe.js —— 订阅组件库列表获取（前端模块，浏览器兼容）
 *
 * 职责：只提供库列表元数据（不含组件明细）。edit-mode.js 打开向导时直接 import 调用。
 * 组件明细数据：edit-mode.js 在用户点「开始匹配」时按 fileKey 走网关接口按需获取
 * （GET /main/rest.root/workspace/pixsoFile/library?fileKey=…，见 edit-mode.js 的 fetchLibraryComponents）。
 *
 * 输出结构（嵌套树，正式环境组件库层级不固定，任意深度递归）：
 *   {
 *     "fetchedAt": "ISO 时间",
 *     "tree": [                                  // 第一层 = 领域（向导左栏）
 *       { "name": "ICT基础设施", "children": [
 *           { "name": "ICT领域组件库", "children": [
 *               { "name": "ICT UI_v3.1.1", "children": [
 *                   { "id": "…", "name": "…", "version": "…", "componentCount": N,
 *                     "icon": "…", "fileKey": "…", "libraryName": "…" }
 *                 ] }
 *             ] }
 *         ] }
 *     ]
 *   }
 * 节点规则：有 children = 分组节点（仅作层级展示，不可选）；无 children = 库叶子。
 * 叶子保留 id/version/componentCount/icon/fileKey/libraryName 字段——
 * edit-mode.js 用 flatTree() 摊平树取叶子，匹配（runMatch/match-core）与发布逻辑只消费叶子。
 *
 * demo 实现：fetchSubscribedLibraries() 直接返回写死的树
 * （ICT 领域三层示范，其余领域一层直挂叶子；fileKey 均指向 mock-api 可用的存量 stub）。
 * 正式环境：替换函数体为真实获取，接口与输出结构不变。
 */

const DATA = {
  "fetchedAt": "2026-11-20T10:00:00+08:00",
  "tree": [
    {
      "name": "H Design",
      "children": [
        {
          "id": "hdesign-official",
          "name": "H Design 官网设计规范",
          "version": "1.0",
          "componentCount": 38,
          "icon": "harmonyos",
          "fileKey": "8mM_mVuB2jY7d4T0oqFCTg",
          "libraryName": "H Design 官网设计规范",
        },
      ],
    },
    {
      "name": "ICT基础设施",
      "children": [
        {
          "name": "ICT领域组件库",
          "children": [
            {
              "name": "ICT UI_v3.1.1",
              "children": [
                {
                  "id": "ict-ui-l4",
                  "name": "ICT UI_v3.1.1_智慧运维L4体验设计组件库",
                  "version": "3.1.1",
                  "componentCount": 10,
                  "icon": "ict",
                  "fileKey": "stubIctUiV311",
                  "libraryName": "ICT UI_v3.1.1",
                },
                {
                  "id": "ict-ui-pc",
                  "name": "ICT UI_v3.1.1_PC端组件库（新)",
                  "version": "3.1.1",
                  "componentCount": 8,
                  "icon": "ict",
                  "fileKey": "stubIctUiV311",
                  "libraryName": "ICT UI_v3.1.1",
                },
              ],
            },
            {
              "name": "ICT UI_v3.1.0",
              "children": [
                {
                  "id": "ict-ui-v310-l4",
                  "name": "ICT UI_v3.1.0_智慧运维L4体验设计组件库",
                  "version": "3.1.0",
                  "componentCount": 9,
                  "icon": "ict",
                  "fileKey": "stubIctUiV311",
                  "libraryName": "ICT UI_v3.1.0",
                },
              ],
            },
          ],
        },
        {
          "name": "ICT业务组件库",
          "children": [
            {
              "id": "ict-biz-flow",
              "name": "流程类业务组件库",
              "version": "2.0",
              "componentCount": 6,
              "icon": "ict",
              "fileKey": "stubIctUiV311",
              "libraryName": "ICT业务组件库",
            },
            {
              "id": "ict-biz-form",
              "name": "表单类业务组件库",
              "version": "2.1",
              "componentCount": 7,
              "icon": "ict",
              "fileKey": "stubIctUiV311",
              "libraryName": "ICT业务组件库",
            },
          ],
        },
      ],
    },
    {
      "name": "终端",
      "children": [
        {
          "id": "terminal-hm70",
          "name": "终端领域HarmonyOS 7.0设计规范",
          "version": "7.0",
          "componentCount": 9,
          "icon": "harmonyos",
          "fileKey": "stubTerminalHm70",
          "libraryName": "终端领域HarmonyOS 7.0设计规范",
        },
      ],
    },
    {
      "name": "华为云",
      "children": [
        {
          "id": "huawei-cloud",
          "name": "华为云Space 组件库",
          "version": "2.3",
          "componentCount": 6,
          "icon": "cloud",
          "fileKey": "stubHwCloudSpace",
          "libraryName": "华为云Space 组件库",
        },
      ],
    },
    {
      "name": "BP&IT",
      "children": [
        {
          "id": "bpit",
          "name": "BP&IT 通用组件库",
          "version": "1.8",
          "componentCount": 6,
          "icon": "bpit",
          "fileKey": "stubBpitCommon",
          "libraryName": "BP&IT 通用组件库",
        },
      ],
    },
    {
      "name": "数字能源",
      "children": [
        {
          "id": "idee",
          "name": "数字能源 iDEE 组件库",
          "version": "2.0",
          "componentCount": 5,
          "icon": "energy",
          "fileKey": "stubIdee",
          "libraryName": "数字能源 iDEE 组件库",
        },
      ],
    },
    {
      "name": "半导体",
      "children": [
        {
          "id": "eda",
          "name": "半导体 EDA 组件库",
          "version": "1.2",
          "componentCount": 5,
          "icon": "chip",
          "fileKey": "stubEda",
          "libraryName": "半导体 EDA 组件库",
        },
      ],
    },
    {
      "name": "GTS",
      "children": [
        {
          "id": "gts",
          "name": "GTS 网络运维组件库",
          "version": "3.0",
          "componentCount": 5,
          "icon": "gts",
          "fileKey": "stubGtsOps",
          "libraryName": "GTS 网络运维组件库",
        },
      ],
    },
    {
      "name": "开发者领域",
      "children": [
        {
          "id": "dev-next",
          "name": "开发者 HarmonyOS Next 组件库",
          "version": "5.0",
          "componentCount": 5,
          "icon": "harmonyos",
          "fileKey": "stubDevNext",
          "libraryName": "开发者 HarmonyOS Next 组件库",
        },
      ],
    },
  ]
}


export async function fetchSubscribedLibraries() {
  return DATA
}
