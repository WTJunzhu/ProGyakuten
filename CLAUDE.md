# ProGyakuten - 逆转 Uno

## Project Overview

纯 TypeScript monorepo，无 C++。npm workspaces 管理。

```
ProGyakuten/
  packages/protocol/   # 共享类型和事件定义
  packages/core/       # 游戏引擎（规则、动作、设置）
  apps/server/         # WebSocket 游戏服务器 + SQLite/Turso 持久化
  apps/client/         # React SPA 客户端 (Vite + Zustand)
```

构建顺序：protocol → core → server/client

## 重构进度

七阶段重构计划，当前完成情况：
- [x] 阶段零：测试体系建设（57 个 core 测试）
- [x] 阶段一：前端架构重构（React + Vite + Zustand）
- [x] 阶段二：后端架构重构 + 持久化（SQLite）
- [x] 阶段三：账户+角色系统（注册登录、角色槽位）
- [x] 阶段四：消除代码重复 + 加牌流程修复（penaltySource 字段）
- [x] 阶段五：Serverless 部署（Turso + Render + Vercel）
- [ ] 阶段六：协议预留

## 关键技术决策

### penaltySource 字段

加牌链追踪使用 `GameStateInternal.penaltySource: CardKind | null`，不再从弃牌堆扫描。
- +4 来源 → 只能接 +4 或同色反转
- +2 来源 → 可接 +2、+4 或同色反转
- 抢牌判定：纯精确匹配（颜色+种类+数值），与加牌链无关

### Turso 数据库

`@libsql/client` 同时支持本地 SQLite 文件和远程 Turso：
- 不设 `TURSO_URL` → 用 `file:gyakuten.db`（本地开发）
- 设了 `TURSO_URL` → 连接远程 Turso（生产环境）
- persistence.ts 所有方法都是 async

### 客户端 Lite 函数

客户端通过 `packages/core` 的 Lite 函数判定出牌/抢牌合法性，不重复实现逻辑：
- `isCardPlayableLite` / `isCardSnatchableLite` / `matchesSkipConstraintLite`

## Hard Rules

- **绝不未经允许 git push** — 推送前必须获得用户明确允许
- 不要动 GameBoard.tsx 的手牌区布局逻辑（高斯展开 + hoverX），这个反复尝试过多次都失败了

## 测试

```bash
npx vitest run packages/core/tests/core.spec.ts   # 57 个 core 测试
npm run test -w @pro-gyakuten/server               # persistence 测试
npm run build -w @pro-gyakuten/client              # 客户端构建
```

## 部署

后端：Render（免费层 15 分钟休眠，冷启动约 30 秒）
前端：Vercel（免费 CDN）
数据库：Turso（免费 9GB）
环境变量：`TURSO_URL`, `TURSO_AUTH_TOKEN`, `VITE_WS_URL`
