# 逆转 UNO · ProGyakuten

组队对抗版 UNO 线上卡牌游戏。2/4/6 人分两队，队友手牌互见，先出完手牌的队伍获胜。

---

## 游戏规则

### 核心目标

两队玩家轮流出牌，率先有一名玩家出完所有手牌，该玩家所在队伍获胜。

### 牌组（108 张）

| 类型 | 数量 | 说明 |
|------|------|------|
| 数字牌 1-9 | 72 张（红黄蓝绿各 18 张，每个数字各 2 张） | 无特殊效果 |
| 反转 (Reverse) | 12 张（每种颜色 3 张） | 翻转出牌方向；加牌链中可反弹 |
| +2 (Draw Two) | 8 张（每种颜色 2 张） | 加牌计数器 +2，可叠加 |
| 跳过 (Skip) | 4 张（每种颜色 1 张） | 下一个同队玩家被限制出牌 |
| 变色 (Wild) | 6 张 | 不能单独出，须与另一张非 Wild 牌组合 |
| +4 (Wild Draw Four) | 6 张 | 加牌计数器 +4，可叠加；需指定颜色 |

### 核心机制

- **组队**：玩家交替分入 teamA / teamB，队友手牌互见
- **初始手牌**：队伍人数 + 1 张，只含数字牌
- **出牌**：匹配颜色或内容；无牌可出时摸 1 张
- **抢牌**：出牌后 30s 窗口，完全匹配（颜色+种类+数值）可抢夺出牌权
- **Wild 组合**：Wild 牌与任意非 Wild 牌组合打出，改变该牌颜色
- **加牌链**：+2 → 可接 +2/+4/同色反转；+4 → 只能接 +4/同色反转
- **Skip 约束**：被 Skip 后只能出同种类牌或 +4
- **UNO**：剩 1 张必须喊 UNO，漏喊罚 2 张，误查罚 2 张
- **补牌**：出牌后若手牌无数字牌，自动补摸
- **爆牌判负**：手牌 ≥ 20 张，所在队伍直接判负

> 完整规则见 [逆转Uno游戏规则全集.md](逆转Uno游戏规则全集.md)

---

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + Zustand 5 + Vite + TypeScript |
| 后端 | Node.js + ws (WebSocket) |
| 数据库 | SQLite (本地) / Turso (生产) |
| 包管理 | npm workspaces monorepo |

---

## 项目结构

```
ProGyakuten/
├── packages/
│   ├── protocol/           # 共享类型和事件定义（前后端契约）
│   └── core/               # 纯规则引擎（无 UI/网络依赖，73 个测试）
│       ├── src/
│       │   ├── setup.ts    # 牌堆创建、游戏初始化
│       │   ├── actions.ts  # 出牌/抢牌/摸牌/UNO 等动作
│       │   ├── engine/     # 状态机（抽牌、回合推进、序列化）
│       │   ├── rules/      # 各牌种效果 + 出牌合法性判定
│       │   ├── characters/ # 角色技能系统（预留）
│       │   └── modifiers/  # 可配置规则参数
│       └── tests/
├── apps/
│   ├── server/             # WebSocket 游戏服务器
│   │   └── src/
│   │       ├── index.ts    # 入口（HTTP + WS）
│   │       ├── handler.ts  # 动作分发
│   │       ├── phase.ts    # 阶段状态机（超时/自动跳过）
│   │       ├── persistence.ts  # 数据库持久化
│   │       ├── ai/         # AI 对手系统
│   │       └── ...
│   └── client/             # React SPA
│       └── src/
│           ├── App.tsx     # 根组件（路由、WebSocket 生命周期）
│           ├── stores/     # Zustand 状态管理
│           ├── components/ # UI 组件（15 个）
│           ├── presentation/  # 演出系统（registry/store/types）
│           └── utils/      # 工具函数
├── docs/
│   ├── deployment-and-guidelines.md
│   ├── netcode_notes.md
│   └── rules_mvp.md
└── 设计文档（8 份）
```

---

## 快速开始

```bash
# 安装依赖
npm install

# 构建（必须按顺序）
npm run build -w @pro-gyakuten/protocol
npm run build -w @pro-gyakuten/core
npm run build -w @pro-gyakuten/server
npm run build -w @pro-gyakuten/client
```

### 启动服务器

```bash
npm run dev -w @pro-gyakuten/server    # → ws://localhost:3001
```

### 启动客户端

```bash
npm run dev -w @pro-gyakuten/client    # → http://localhost:3000
```

打开浏览器访问 `http://localhost:3000`，注册账户 → 选择角色 → 创建/加入房间 → 开始游戏。

---

## 联机

- **局域网**：房主启动服务后，其他人通过 `http://房主IP:3000` 访问
- **跨网络**：使用 cpolar 等内网穿透工具，详见 `LAN_联机测试操作手册.md`

---

## 当前功能

### 核心玩法
- ✅ 2/4/6 人组队对抗
- ✅ 抢牌机制（30s 窗口 + 精确匹配）
- ✅ Wild 组合出牌
- ✅ 加牌链（+2/+4 叠加 + 反转反弹）
- ✅ Skip 约束 + 出牌限制
- ✅ UNO 喊牌/检查 + 罚摸
- ✅ 补牌机制（手牌无数牌自动补）
- ✅ 爆牌判负（手牌 ≥ 20 张，队伍直接判负）

### 账户 & 角色
- ✅ 注册/登录（scrypt 密码加密）
- ✅ 角色系统（每账户 3 槽位，等级/胜负统计）
- ✅ 角色技能系统（3 个原创角色：成步堂龙之介 / 御琴羽寿沙都 / 亚双义一真，当前关闭待优化）

### 网络 & 持久化
- ✅ 断线重连（20s 宽限期）
- ✅ 服务器重启恢复（SQLite/Turso 快照）
- ✅ AI 对手自动填充
- ✅ 观战系统

### 聊天 & 通信
- ✅ 队内文字聊天
- ✅ 全员聊天

### UI & 体验
- ✅ Mac Dock 风格手牌悬浮放大
- ✅ 队友手牌点击全屏浏览
- ✅ 敌人手牌紧凑显示（单张牌背 + 居中数字）
- ✅ 聚焦放大动画（喊 UNO / 加牌链 / 结束）
- ✅ 悬浮 UNO 按钮（剩 1 张时弹出，红色脉冲）
- ✅ 回合方向指示器
- ✅ 倒计时进度条
- ✅ 弃牌堆出牌动画
- ✅ BGM 场景切换（15 首）+ SFX 音效

---

## 测试

```bash
npx vitest run packages/core/tests/core.spec.ts      # 73 个核心规则测试
npm run test -w @pro-gyakuten/server                  # 持久化测试
npm run build -w @pro-gyakuten/client                 # 客户端构建验证
```

---

## 部署

| 组件 | 平台 | 地址 |
|------|------|------|
| 前端 | Vercel | `pro-gyakuten-client.vercel.app` |
| 后端 | Render (Singapore) | `progyakuten.onrender.com` |
| 数据库 | Turso | libsql 云数据库 |

三个平台均监听 `main` 分支 push 自动部署。

### 环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `TURSO_URL` | Turso 数据库连接 | `file:gyakuten.db` |
| `TURSO_AUTH_TOKEN` | Turso 认证令牌 | — |
| `VITE_WS_URL` | 客户端 WebSocket 地址 | `ws://localhost:3001` |
| `PORT` | 服务器端口 | `3001` |
| `HOST` | 服务器绑定地址 | `0.0.0.0` |

> 详细部署记录和注意事项见 [docs/deployment-and-guidelines.md](docs/deployment-and-guidelines.md)

---

## 开发注意事项

1. **import 扩展名**：`apps/server` 和 `packages/*` 的相对 import 必须带 `.js` 后缀（Node16 ESM），`apps/client` 不需要（Vite Bundler）
2. **构建顺序**：protocol → core → server → client，不可调换
3. **推送**：必须获得明确允许才能 push 到 main

---

## 素材待办

| 素材 | 路径 | 状态 |
|------|------|------|
| 标题背景 | `public/images/backgrounds/title.jpg` | ⏳ |
| 大厅背景 | `public/images/backgrounds/lobby.jpg` | ⏳ |
| 对局背景 | `public/images/backgrounds/game.jpg` | ⏳ |
| 胜利背景 | `public/images/backgrounds/result_win.jpg` | ⏳ |
| 失败背景 | `public/images/backgrounds/result_lose.jpg` | ⏳ |
| 牌效视频（4 个） | `public/video/` | ✅ 已有，视频可见性问题待修 |
| 开局视频 | `public/video/game_intro.mp4` | ⏳ |
| BGM（15 首） | `public/audio/bgm/` | ✅ |
| SFX（6 首） | `public/audio/sfx/` | ✅ |

---

## 设计文档索引

| 文档 | 内容 |
|------|------|
| [逆转Uno游戏规则全集.md](逆转Uno游戏规则全集.md) | 完整游戏规则 |
| [演出系统设计文档.md](演出系统设计文档.md) | 演出层架构（BGM/SFX/视频/背景） |
| [AI对手系统设计文档.md](AI对手系统设计文档.md) | AI 机器人设计 |
| [聊天系统设计文档.md](聊天系统设计文档.md) | 队内/全员聊天 |
| [观战系统设计文档.md](观战系统设计文档.md) | 观战功能 |
| [角色系统设计文档.md](角色系统设计文档.md) | 角色技能系统 |
| [前端优化说明.md](前端优化说明.md) | 前端优化待办清单（P1-P5） |
| [docs/deployment-and-guidelines.md](docs/deployment-and-guidelines.md) | 部署记录 & 开发规范 |
