# 测试执行页生成工具

这个工具把标准化测试数据转换成完整的 HTML 测试执行页。它不解析 Markdown，输入文件需要由人工或其他工具提前整理为 JSON、JSONL 或 CSV。

## 推荐选型

推荐主格式使用 JSON：

- 能表达环境、数据表、回归清单、用例数组等层级结构。
- 不需要额外依赖，Node.js 原生即可稳定生成。
- 后续如果要从 Excel、Markdown 或接口导出，也建议转换到 JSON。

JSONL 适合只维护用例列表，每行一条用例。CSV 适合 Excel 手工编辑，但步骤和预期结果需要用 `|` 分隔。

## 直接使用 CLI

```bash
node generate-test-runner.mjs --input data.json --output runner.html
```

也可以指定格式：

```bash
node generate-test-runner.mjs -i cases.csv -o runner.html -f csv
node generate-test-runner.mjs -i cases.jsonl -o runner.html
```

或通过 npx：

```bash
npx test-runner-generator --input data.json --output runner.html
```

## JSON 格式

### 最小可用示例

只要有 `cases`，并且每条用例有 `id`，就可以生成页面：

```json
{
  "cases": [
    { "id": "TC-01" },
    { "id": "TC-02", "title": "查询列表" }
  ]
}
```

缺失字段会自动补默认值。上面的 `TC-01` 会被补成：

```json
{
  "id": "TC-01",
  "title": "TC-01",
  "name": "TC-01",
  "precondition": "无",
  "steps": ["按测试目标执行"],
  "expected": ["符合预期"],
  "category": "默认",
  "module": "默认-默认",
  "regression": false
}
```

### 完整推荐示例

```json
{
  "title": "测试执行页",
  "subtitle": "面向测试执行：按步骤勾选、记录结果、标记状态；所有进度自动保存在当前浏览器。",
  "storageKey": "test-runner:my-module-uat",
  "env": [
    {
      "label": "部署环境",
      "value": "UAT"
    },
    {
      "label": "后端地址",
      "value": "127.0.0.1"
    },
    {
      "label": "数据库",
      "value": "测试环境 MySQL"
    },
    {
      "label": "认证方式",
      "value": "Bearer Token，需先调用登录接口获取 access_token"
    },
    {
      "label": "登录接口",
      "value": "POST /api/user/login",
      "code": true
    },
    {
      "label": "登录Body",
      "value": "{\n  \"username\": \"admin\",\n  \"password\": \"******\"\n}",
      "code": true
    }
  ],
  "tables": [
    {
      "name": "example_table",
      "purpose": "示例表"
    }
  ],
  "regression": [
    {
      "id": "TC-01",
      "name": "列表加载与翻页",
      "reason": "核心入口和分页基础"
    }
  ],
  "cases": [
    {
      "id": "TC-01",
      "title": "列表 — 正常加载与翻页",
      "name": "进入列表页面，验证列表正常加载，翻页可用",
      "precondition": "系统中已有测试数据",
      "steps": [
        "登录系统，进入列表页面",
        "查看分页器，确认显示总条数",
        "点击下一页按钮",
        "切换每页条数"
      ],
      "expected": [
        "页面载入后表格有数据",
        "翻页后表格数据刷新",
        "切换每页条数后行数对应变化"
      ],
      "category": "前端操作",
      "module": "列表模块",
      "regression": true
    },
    {
      "id": "TC-02",
      "title": "分页参数边界 — 非法值容错",
      "precondition": "已获取 access_token",
      "steps": [
        "POST /api/list，body：{\"page\": 0, \"limit\": 10}",
        "POST /api/list，body：{\"page\": 1, \"limit\": 500}"
      ],
      "expected": [
        "均返回 HTTP 200",
        "page=0 时按第 1 页返回",
        "limit=500 时最多返回系统允许的最大条数"
      ],
      "category": "接口边界",
      "module": "接口测试",
      "regression": false
    }
  ]
}
```

### 顶层字段

| 字段 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `title` | 否 | string | `测试执行页` | 页面标题，也参与自动生成 `storageKey` |
| `subtitle` | 否 | string | 默认执行页说明 | 页面副标题 |
| `storageKey` | 否 | string | 自动生成 | 浏览器本地进度的存储键 |
| `env` | 否 | array 或 object | `[]` | 环境说明，展示在"开始前准备"下方 |
| `tables` | 否 | array | `[]` | 涉及数据表 |
| `regression` | 否 | array | 自动从 `cases[].regression` 生成 | 回归测试清单 |
| `cases` | 是 | array | 无 | 测试用例列表 |

`storageKey` 可以不写。工具会基于 `title + 用例 id 列表` 自动生成稳定 key，避免不同测试执行页共用同一份浏览器进度。

### env 写法

`env` 推荐用数组，便于控制顺序和代码块展示：

```json
{
  "env": [
    { "label": "后端地址", "value": "127.0.0.1" },
    { "label": "登录接口", "value": "POST /api/user/login", "code": true }
  ]
}
```

也可以写成普通对象，工具会按键值自动展示：

```json
{
  "env": {
    "部署环境": "UAT",
    "后端地址": "127.0.0.1",
    "说明": "每轮测试前确认数据已刷新"
  }
}
```

`env[].code` 为 `true` 时，该项会按代码块展示，适合接口、JSON body、SQL 等内容。

### cases 字段

用例里只有 `id` 是必填。其他字段都有默认值。

| 字段 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | 是 | string | 无 | 用例编号，如 `TC-01` |
| `title` | 否 | string | `id` | 页面卡片标题 |
| `name` | 否 | string | `title` 或 `id` | 用例名称/简述 |
| `precondition` | 否 | string | `无` | 测试前提 |
| `steps` | 否 | string[] | `["按测试目标执行"]` | 执行步骤；JSON 推荐写数组 |
| `expected` | 否 | string[] | `["符合预期"]` | 预期结果/验收点；JSON 推荐写数组 |
| `category` | 否 | string | `默认` | 类型筛选项，例如 `前端操作`、`接口边界` |
| `module` | 否 | string | `默认-<category>` | 模块筛选项 |
| `regression` | 否 | boolean/string | `false` | 是否进入回归清单；支持 `true`、`1`、`yes`、`是` |

### regression 写法

如果不写 `regression` 清单，工具会自动把 `cases[].regression === true` 的用例生成到回归测试清单。

需要自定义回归理由时，可以显式填写：

```json
{
  "regression": [
    { "id": "TC-01", "name": "列表加载与翻页", "reason": "核心入口和分页基础" }
  ]
}
```

## 图片附件

生成后的 HTML 支持在每条用例下上传多张图片。实现方式是：

- 勾选状态、执行状态、备注仍保存在 `localStorage`。
- 图片会压缩后保存到浏览器 IndexedDB，不直接写入 `localStorage`。
- 导出 HTML 测试报告时，图片会转换成内嵌 data URL 并显示在对应用例下方。
- 侧边栏"本地存储"会统计文本进度和图片附件占用，旁边"清空"按钮会清空当前页面的进度、备注和图片。

单张原图超过 20 MB 时会跳过。普通截图会先压缩到最长边 1600px 左右，避免报告文件和浏览器存储快速膨胀。

## CSV 格式

CSV 表头建议固定为：

```csv
id,title,name,module,category,regression,precondition,steps,expected
TC-01,列表加载,验证列表加载,前端模块,前端操作,true,已有数据,打开页面|查看表格,表格有数据|分页正常
```

CSV 中的 `steps` 和 `expected` 用半角竖线 `|` 分隔多条内容。JSON/JSONL 中推荐直接写数组。

CSV/JSONL 只适合维护用例列表；环境信息和数据表会使用默认空值。需要完整页面元数据时使用 JSON。

## 验证

```bash
npm test
```
