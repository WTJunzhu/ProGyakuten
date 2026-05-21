# 逆转 Uno (ProGyakuten)

组队对抗版 Uno 线上游戏，支持 2/4/6 人对局。

## 功能

- 组队对抗：两队成员轮流出牌，队友手牌互见
- 账户系统：注册/登录，scrypt 密码加密
- 角色系统：每账户 3 个角色槽位，等级/胜负统计
- 抢牌机制：出牌后进入抢牌窗口，完全匹配可抢夺出牌权
- Wild 组合：Wild 牌可与任意牌组合打出，改变该牌颜色
- Skip 约束：打出 skip 后锁定下家只能出同内容牌
- 罚摸连锁：+2/+4 可叠加，reverse 可反弹
- 断线重连：20 秒宽限期，刷新页面自动恢复对局
- 音频系统：BGM 场景切换 + SFX 音效

## 技术栈

- **前端**：React 19 + Zustand 5 + Vite + TypeScript
- **后端**：Node.js + ws + better-sqlite3
- **包管理**：npm workspaces monorepo

## 项目结构

```
apps/client/       -- React 前端
apps/server/       -- WebSocket 游戏服务器
packages/core/     -- UNO 规则引擎
packages/protocol/ -- 前后端通信协议类型
```

## 快速开始

```bash
npm install
npm run build
```

### 启动服务器

```bash
npm run dev:server
```

### 启动客户端

```bash
npm run dev:client
```

打开 `http://localhost:5173`，注册账户后选择角色即可开始。

## 联机

- **局域网**：房主启动服务后，其他玩家通过 `http://房主IP:5173` 访问
- **跨网络**：使用 cpolar 等内网穿透工具，详见 `LAN_联机测试操作手册.md`
