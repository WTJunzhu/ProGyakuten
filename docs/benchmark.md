# ProGyakuten 性能压测报告

> 本文档为压测框架和结果模板，用于面试时展示可量化的性能数据。

---

## 测试环境

| 项目 | 值 |
|------|-----|
| 服务器 | Render (Singapore, 0.5 CPU / 512MB) |
| Node.js | 22.x |
| 数据库 | Turso (edge) |
| 测试工具 | autocannon / k6 |
| 本地基准 | MacBook Pro M2, 16GB |

---

## 核心规则引擎吞吐量

> 测试方法：直接调用 `@pro-gyakuten/core` 的 `applyPlayCard()` / `applyDrawCard()` 等纯函数，测量每秒可判定的操作数。

| 操作 | ops/sec | 备注 |
|------|---------|------|
| `applyPlayCard` | — | 单次出牌判定 |
| `applyDrawCard` | — | 摸牌判定 |
| `applySnatchCard` | — | 抢牌判定 |
| `finishPlay + replenishPlayerHand` | — | 出牌 + 补牌完整流程 |
| `Full game simulation (100 turns)` | — | 模拟完整对局 |

---

## WebSocket 服务端并发

> 测试方法：autocannon / k6 模拟多房间并发，每个房间 4 人（含 2 AI），测量消息延迟和吞吐。

| 指标 | 1 房间 | 10 房间 | 50 房间 |
|------|--------|---------|---------|
| 消息延迟 (p50) | — | — | — |
| 消息延迟 (p99) | — | — | — |
| 吞吐 (msg/sec) | — | — | — |
| 内存占用 | — | — | — |
| CPU 占用 | — | — | — |

---

## 断线重连

| 指标 | 值 |
|------|-----|
| 重连延迟 | — |
| 状态快照大小 | — |
| 恢复成功率 | — |

---

## 客户端性能

| 指标 | 值 |
|------|-----|
| 首屏加载 (FCP) | — |
| 可交互时间 (TTI) | — |
| JS Bundle 大小 (gzip) | — |
| 手牌渲染 (60 张) | — |
| 出牌飞行动画帧率 | — |

---

## 压测脚本

```bash
# 核心引擎微基准
node -e "
  const { applyPlayCard, initGame } = require('@pro-gyakuten/core');
  // ... 运行 100000 次并计时
"

# WebSocket 并发 (autocannon)
npx autocannon -c 100 -d 30 ws://localhost:3001

# k6 脚本
# k6 run scripts/load-test.js
```

---

## 方法论说明

1. **核心引擎测试**：使用 `process.hrtime.bigint()` 纳秒级计时，预热 1000 次后取 100000 次平均值
2. **WebSocket 测试**：autocannon 建立 100 个并发连接，持续 30 秒，取 p50/p99
3. **客户端测试**：Chrome DevTools Performance tab，Lighthouse CI
4. **所有测试运行 3 次取中位数**，排除首次冷启动
