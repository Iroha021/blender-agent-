# Blender AI Agent

用自然语言驱动 Blender 建模的 AI Agent。前端是 React + Three.js 的可视化工作台，后端是 MCP host + DeepSeek 推理循环，通过 Blender 里的 **Blender MCP** 插件（HTTP MCP server，默认 `http://127.0.0.1:9876/mcp`）直接操控 Blender。

- 三栏极简深色界面：左侧工程文件管理、中部 3D 实时预览、右侧 AI 工作流与对话
- AI 每一步工具调用后自动从 Blender 导出 GLB，Three.js 预览实时刷新
- 关键决策由 AI 用选项询问你（`ask_user`），而不是瞎猜
- 前端可构建为 **单个 HTML 文件**（内联全部 JS/CSS）

## 架构

```
浏览器：React 18 + Three.js + TailwindCSS（vite-plugin-singlefile 单文件构建）
   │   SSE /api/events（思考/工具/问题/场景增量） + REST 控制接口
   ▼
Express 后端（server/）
   ├─ AgentHub：时间线、状态、SSE 广播、待答问题
   ├─ SimpleAgent：DeepSeek 流式推理 + 工具调用循环（可替换）
   └─ McpHost：按 config/mcp.json 连接 MCP server（url=Streamable HTTP / command=stdio）
   │   MCP (Streamable HTTP POST /mcp)
   ▼
Blender MCP 插件（Blender 内置 addon 的 HTTP 服务，127.0.0.1:9876）
   │   bpy.app.timers 主线程执行
   ▼
Blender 场景
```

## 目录结构

```
config/mcp.json      MCP server 配置（Claude 风格的 mcpServers，支持 url 或 command）
server/              后端：Express + MCP host + DeepSeek 循环
shared/types.ts      前后端共享类型
src/                 前端 React 应用
  components/        三栏布局 / 文件面板 / 3D 视口 / 工作流时间线 / 输入框
  viewer/            Three.js 场景渲染器（OrbitControls、GLTFLoader、线框）
  hooks/useAgent.ts  SSE 事件流与操作封装
projects/            工程文件（*.blend）与 .sync/scene.glb 预览
dist/index.html      npm run build 产出的单文件前端
```

## 前置条件

- Node.js ≥ 18、npm
- Blender 4.x / 5.x，并启用插件 **Blender MCP**（本机已安装在
  `%APPDATA%\Blender Foundation\Blender\<版本>\scripts\addons\blender_mcp`）
  1. Blender 3D 视图按 `N` → 侧边栏 **MCP** 标签页 → 点击 **Start MCP Server**
  2. 面板显示 Running / Port 9876 即可；端口被占用时在面板里停掉再启动
- 一个 DeepSeek API Key（https://platform.deepseek.com）

> 不再需要 blender-mcp-ultra 的 Python 网关：插件的 80 多个工具由后端直接经 HTTP MCP 调用。

## 快速开始

```bash
npm install
cp .env.example .env
# 编辑 .env：填入 DEEPSEEK_API_KEY（BLENDER_MCP_URL 默认指向 127.0.0.1:9876/mcp）
```

先打开 Blender 并在 MCP 面板点击 Start MCP Server，然后：

```bash
npm run dev      # 开发：Vite :5173 + 后端 :8787（自动代理 /api）
```

打开 http://127.0.0.1:5173 。

生产模式 / 单文件交付：

```bash
npm run build    # 产出 dist/index.html（全部资源内联）
npm start        # 后端 :8787，同时托管 dist/index.html
# 浏览器打开 http://127.0.0.1:8787
```

也可以把 `dist/index.html` 拷贝到任意位置直接用浏览器打开（`file://`）。此时它会默认请求 `http://127.0.0.1:8787` 的后端；如端口不同，点右上角 ⚙ 设置后端地址并保存。

## 使用

1. 在右下输入框描述需求，例如「做一个低多边形风格的小茶几，木质桌面、黑色金属腿」。
2. 右侧工作流实时展示 AI 思考（thinking）、工具调用（参数/输出/耗时）与结论。
3. AI 遇到关键选择（风格、尺寸、物体命名等）会弹出选项，点击或直接输入回答。
4. 每次建模操作后中部预览自动从 Blender 重新导出并刷新；也可点「同步」手动拉取。
5. 左侧 `+` 新建工程（在 Blender 中另存为 `projects/*.blend`），点击工程行可打开。

## 配置

### `.env`

| 变量 | 说明 |
| --- | --- |
| `DEEPSEEK_API_KEY` | 必填；缺失时后端拒绝对话并提示 |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat`，可换 `deepseek-reasoner` |
| `DEEPSEEK_BASE_URL` | 默认 `https://api.deepseek.com`，兼容网关可改 |
| `BLENDER_MCP_URL` | Blender MCP 插件地址，默认 `http://127.0.0.1:9876/mcp` |
| `PORT` | 后端端口，默认 8787 |

### `config/mcp.json`

MCP host 启动时读取该文件里的 mcpServers（支持 `${VAR}` 从 `.env` 展开）。有 `url` 时走 Streamable HTTP，有 `command` 时按 stdio 拉起子进程：

```json
{
  "mcpServers": {
    "blender": {
      "url": "${BLENDER_MCP_URL}",
      "timeoutMs": 180000
    }
  }
}
```

换成 stdio MCP server（如 blender-mcp-ultra）时写成 `command`/`args` 即可，后端无需改代码。

## 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/events` | SSE 事件流（snapshot/entry/delta/patch/status/scene） |
| GET | `/api/status` | 当前连接状态与工具数 |
| POST | `/api/agent/message` | `{text}` 发起任务；有待答问题时自动作为回答 |
| POST | `/api/agent/answer` | `{text}` 回答 AI 的提问 |
| POST | `/api/agent/cancel` | 中止当前任务 |
| POST | `/api/agent/reset` | 清空会话（不影响场景） |
| POST | `/api/mcp/reconnect` | 重新连接 MCP server |
| POST | `/api/sync` | 立即从 Blender 导出 GLB 到预览 |
| GET | `/api/files` | 工程列表 |
| POST | `/api/files/new` | `{name}` 新建并另存为 `.blend` |
| POST | `/api/files/open` | `{name}` 在 Blender 中打开 |
| DELETE | `/api/files/:name` | 删除工程文件 |

## 常见问题

- **提示「未配置 DEEPSEEK_API_KEY」**：在 `.env` 填好 Key 后重启后端。
- **Blender 状态红 / 工具超时**：确认 Blender 里 MCP 面板显示 Running；若端口 9876 被多个 Blender 实例占用，关掉多余的 Blender 再 Start MCP Server。
- **预览一直「等待 Blender 场景」**：Blender 中必须有对象；点击预览右上角「同步」重试。
- **换模型 / 换 MCP server**：改 `.env` 或 `config/mcp.json` 后重启后端；agent 循环集中在 `server/agent.ts`，系统提示词在 `server/prompt.ts`，方便替换。

## 安全提示

`execute_python` 可以在 Blender 中执行任意 Python。请只在本地使用，不要把后端端口暴露到公网。
