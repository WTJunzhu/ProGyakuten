# ProGyakuten 部署记录 & 开发规范

> 最后更新：2026-07-01

---

## 一、部署架构

| 组件 | 平台 | 地址 | 用途 |
|------|------|------|------|
| 前端 | Vercel | `pro-gyakuten-client.vercel.app` | React + Vite 静态托管 |
| 后端 | Render | `progyakuten.onrender.com` | Node.js WebSocket 服务 |
| 数据库 | Turso | 通过 `TURSO_URL` / `TURSO_AUTH_TOKEN` 连接 | libsql 云数据库 |

**三个平台都会监听 GitHub 仓库 `WTJunzhu/ProGyakuten` 的 `main` 分支 push，自动触发重新部署。**

---

## 二、本次部署修复的所有问题

### 2.1 Vercel（前端）部署问题

| # | 错误 | 原因 | 修复 |
|---|------|------|------|
| 1 | `No Output Directory named "dist" found` | Vite 默认输出到 `apps/client/dist`，Vercel 在根目录找 `dist` | 修改 `vite.config.ts` 设置 `outDir: "dist"`，让 Vite 输出到根目录 `dist/` |
| 2 | `vercel.json` 的 `outputDirectory` 不生效 | Vercel 在 monorepo 场景下对 `outputDirectory` 解析不一致 | 不依赖 `vercel.json` 路径覆盖，让 Vite 直接输出到 Vercel 默认查找的根目录 `dist/` |
| 3 | Vercel Output 里全是 `.d.ts` 类型文件 | `apps/client` 的 `tsc` 编译也输出到 `apps/client/dist`，Vercel 读到了 tsc 产物而非 Vite 产物 | 确认 Vite 从根目录运行时 `outDir: "dist"` 直接输出到根 `dist/`，移除多余的 `cp` 命令 |
| 4 | `cp: cannot stat 'apps/client/dist'` | Vite 在 Vercel 环境的工作目录是根目录，不存在 `apps/client/dist` | 移除 `cp` 命令，Vite 的 `outDir: "dist"` 在 Vercel 上直接就是根目录的 `dist/` |

**最终 `vercel.json`：**
```json
{
  "buildCommand": "npm run build -w @pro-gyakuten/protocol && npm run build -w @pro-gyakuten/core && npm run build -w @pro-gyakuten/client",
  "outputDirectory": "dist",
  "installCommand": "npm install"
}
```

**最终 `apps/client/vite.config.ts`：**
```ts
export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
```

### 2.2 Render（后端）部署问题

| # | 错误 | 原因 | 修复 |
|---|------|------|------|
| 1 | TypeScript 编译错误：`Type "game_intro" is not assignable` | `RoomSnapshotEvent.status` 类型缺少 `"game_intro"` | 在 `packages/protocol/src/index.ts` 的 `RoomSnapshotEvent.status` 加入 `"game_intro"` |
| 2 | `UseSkillEvent` 缺少 `playerId`，导致类型收窄到 `never` | `handler.ts` 里 `event.type === "useSkill"` 后访问 `event.playerId`，但 protocol 里没定义 | 在 `UseSkillEvent` 加入 `playerId: string` |
| 3 | `event.type === "teamChat"` 不在 `ClientEvent` 里 | `index.ts` 里 case 了 `"teamChat"` 但 protocol 没定义 | 新增 `TeamChatEvent` 并加入 `ClientEvent` 联合类型 |
| 4 | `loadRoom` 返回对象缺少 `aiPlayers`、`spectators` | `RoomState` 接口要求这两个必填字段，但 `persistence.ts` 的 `loadRoom` 没返回 | 补上 `aiPlayers: []`, `spectators: []` |
| 5 | `node apps/server/dist/index.js` 找不到文件 | `tsconfig.json` 没有 `rootDir: "src"`，tsc 把 `src/` 目录层级也带入输出，产物在 `dist/src/index.js` | 加入 `rootDir: "src"` |
| 6 | `Cannot find module '.../packages/core/dist/setup'` | ESM 模式下 import 不带 `.js` 扩展名，Node.js 无法解析 | 改用 `module: "Node16"` + `moduleResolution: "Node16"`，所有相对 import 加 `.js` |
| 7 | `ENOENT: no such file or directory, open '.../dist/db/schema.sql'` | tsc 不编译 `.sql` 文件，`readFileSync` 引用的路径在 dist 里不存在 | 将 SQL 内联为 `persistence.ts` 里的常量字符串 |

### 2.3 TypeScript 模块系统修复

**核心改动**：将 server 和 packages 的 `module` / `moduleResolution` 从 `ESNext`/`Bundler` 改为 `Node16`/`Node16`，所有相对 import 加上 `.js` 扩展名。

| 包 | tsconfig 改动 | 说明 |
|----|-------------|------|
| `packages/protocol` | 加 `module: "Node16"`, `moduleResolution: "Node16"` | 单文件无相对 import |
| `packages/core` | 加 `module: "Node16"`, `moduleResolution: "Node16"` | 约 23 个文件加 `.js` |
| `apps/server` | 加 `module: "Node16"`, `moduleResolution: "Node16"`, `rootDir: "src"` | 约 18 个文件加 `.js` |
| `apps/client` | 保持 `Bundler` 模式不变 | Vite 项目不需要 `.js` 扩展名 |

---

## 三、当前部署配置清单

### 3.1 Vercel（前端）

- **Framework Preset**: Other
- **Build Command**: （由 `vercel.json` 指定）
- **Output Directory**: `dist`（由 `vercel.json` 指定）
- **Install Command**: `npm install`（由 `vercel.json` 指定）
- **环境变量**: 无（前端 WebSocket 地址硬编码在源码中，或通过 Vite env 配置）

### 3.2 Render（后端）

- **Runtime**: Node
- **Region**: Singapore
- **Build Command**: `npm install && npm run build -w @pro-gyakuten/protocol && npm run build -w @pro-gyakuten/core && npm run build -w @pro-gyakuten/server`
- **Start Command**: `node apps/server/dist/index.js`
- **环境变量**:
  - `TURSO_URL` — Turso 数据库连接 URL
  - `TURSO_AUTH_TOKEN` — Turso 认证令牌
  - `NODE_ENV` = `production`

### 3.3 Turso（数据库）

- 数据库名：`progyakuten`（或用户自定义）
- 表结构：6 张表（rooms, room_players, game_snapshots, player_sessions, accounts, characters）
- 建表逻辑：服务端启动时 `SqlitePersistence.init()` 自动执行，SQL 已内联在 `persistence.ts` 中

---

## 四、以后修改代码的注意事项

### 4.1 模块系统规范 ⚠️ 最重要

**`apps/server`、`packages/core`、`packages/protocol` 使用 `Node16` 模块解析，所有相对 import 必须带 `.js` 扩展名：**

```ts
// ✅ 正确
import { foo } from "./utils.js";
import type { Bar } from "../types.js";

// ❌ 错误 — Node.js ESM 运行时会报 MODULE_NOT_FOUND
import { foo } from "./utils";
import type { Bar } from "../types";
```

**`apps/client` 使用 `Bundler` 模式，不需要 `.js` 扩展名：**

```ts
// ✅ 正确（client 里）
import { foo } from "./utils";
```

**判断规则**：如果你在编辑 `apps/server/src/`、`packages/core/src/`、`packages/protocol/src/` 下的文件，所有 `from "./..."` 或 `from "../..."` 都要加 `.js`。`from "@pro-gyakuten/..."` 包名 import 不需要加。

### 4.2 TypeScript 编译路径

- **`apps/server/tsconfig.json`** 已设 `rootDir: "src"`，确保 `tsc` 输出到 `dist/index.js` 而非 `dist/src/index.js`
- **`packages/protocol` 和 `packages/core`** 同样有 `rootDir: "src"`
- **不要随意修改 `rootDir` 或 `outDir`**，否则 Render 的启动路径会失效

### 4.3 非 TypeScript 文件的处理

**tsc 不会复制非 `.ts` 文件到 `dist/`**。如果需要读取外部文件（如 `.sql`、`.json`、`.html`）：

- **优先方案**：将内容内联为 TypeScript 常量（已对 `schema.sql` 这样处理）
- **备选方案**：在构建命令里加 `cp` 复制文件，或在 `render.yaml` 的 buildCommand 里处理

### 4.4 `RoomState` 必填字段

`RoomState` 接口的 `aiPlayers: string[]` 和 `spectators: string[]` 是**必填字段**。创建 `RoomState` 对象时必须提供，即使为空数组：

```ts
// ✅ 正确
const room: RoomState = { ...other, aiPlayers: [], spectators: [] };

// ❌ 错误 — TS 编译报错
const room: RoomState = { ...other }; // 缺少 aiPlayers, spectators
```

### 4.5 Protocol 类型同步

修改 `packages/protocol/src/index.ts` 时注意：

- 新增 `ServerEvent` 变体 → 同时在 `ServerEvent` 联合类型里注册
- 新增 `ClientEvent` 变体 → 同时在 `ClientEvent` 联合类型里注册
- 新增枚举值（如 status 的 `"game_intro"`）→ 检查所有使用该枚举的地方是否兼容
- 修改接口字段 → 检查 `apps/server` 和 `apps/client` 里对应的 handler/组件

### 4.6 构建顺序

monorepo 的包有依赖关系，构建顺序必须是：

```
1. @pro-gyakuten/protocol  （无依赖）
2. @pro-gyakuten/core      （依赖 protocol）
3. @pro-gyakuten/server    （依赖 protocol + core）
4. @pro-gyakuten/client    （依赖 protocol + core，Vite 构建）
```

**本地开发**：`npm run dev -w @pro-gyakuten/server` 等命令会自动处理依赖。
**部署构建**：`vercel.json` 和 `render.yaml` 里的 buildCommand 已按此顺序排列，不要随意调换。

### 4.7 部署后验证流程

每次 push 到 `main` 分支后，建议验证：

1. **Vercel**：访问 `pro-gyakuten-client.vercel.app`，确认页面加载
2. **Render**：访问 `progyakuten.onrender.com/health`，确认返回 `ok`
3. **功能测试**：注册账号 → 创建角色 → 建房 → 开始游戏

---

## 五、常见问题速查

| 问题 | 排查方向 |
|------|---------|
| Vercel 报 `No Output Directory` | 检查 `vite.config.ts` 的 `build.outDir` 和 `vercel.json` 的 `outputDirectory` |
| Vercel 页面 404 | 检查 Vercel Deployments 里的 Output 文件列表，确认根目录有 `index.html` |
| Render 报 `MODULE_NOT_FOUND` | 检查相对 import 是否都带了 `.js` 扩展名 |
| Render 报 `ENOENT` 文件找不到 | 检查是否有非 TS 文件被 `readFileSync` 引用，应该内联到代码里 |
| Render 报 TS 编译错误 | 本地先跑 `npm run build -w @pro-gyakuten/server`，修完再 push |
| Turso 连接失败 | 检查 Render 环境变量 `TURSO_URL` 和 `TURSO_AUTH_TOKEN` 是否正确 |
| 前端连不上后端 WebSocket | 检查前端代码里的 WebSocket URL 是否指向 `progyakuten.onrender.com` |
