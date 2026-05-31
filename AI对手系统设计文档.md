# AI 对手系统设计文档

## 一、概述

AI 对手系统允许在 2/4/6 人房间中添加机器人玩家，填补空缺座位或提供单人练习对象。AI 完全运行在服务端，无需 WebSocket 连接，直接调用现有 `applyXxx` 动作函数。

---

## 二、架构

### AI = 永不断线的虚拟玩家

- AI 的 `playerId` 格式为 `"AI_1"`、`"AI_2"`（最多 3 个，对应 6 人局）
- `RoomState.aiPlayers: string[]` 标记哪些 playerId 是 AI
- 没有 WebSocket 连接，不在 `playersById` Map 中
- 在 `room.players` 和 `room.teams` 中与真实玩家完全一致

### 触发机制

每个阶段启动时（`startMainTurn` / `startSnatchWindow` / `startPostDrawWindow`）调用 `triggerAiIfNeeded(room)`，若当前行动方是 AI，则用随机延迟安排动作执行：

| 阶段 | 基础延迟 | 抖动 |
|------|---------|------|
| 主回合 | 700ms | ±500ms |
| 抢牌窗口 | 350ms | ±250ms |
| 摸牌后窗口 | 300ms | ±200ms |

### 文件结构

```
apps/server/src/ai/
  types.ts       ← AiDecision 联合类型
  strategy.ts    ← Level-1 贪心决策逻辑
  scheduler.ts   ← 延迟调度 + 三阶段执行器
  index.ts       ← 公开 triggerAiIfNeeded(room)
```

---

## 三、决策策略（Level-1 贪心）

### 主回合优先级

```
1. 技能发动（条件满足时自动激活）
2. 罚摸连锁 → 优先 +4 > +2 > 同色反转，否则承受
3. Skip 约束 → 打出匹配牌或 +4，否则摸牌
4. 正常回合：
   a. 对方剩 1 张时优先 Skip/+2/+4 阻击
   b. 功能牌 > Wild 组合 > 数字牌
   c. 无牌可出 → 摸牌
5. 手牌剩 2 张时自动喊 UNO
```

### 抢牌策略

- 功能牌（Skip/+2/Reverse）：**必抢**
- 数字牌：手牌 ≤ 3 张时抢，否则放弃
- Wild 组合抢牌：条件满足时抢

### 技能支持

| 角色 | 技能 | AI 行为 |
|------|------|--------|
| 成步堂龙之介 | 天降神判 | 对方剩 1 张时自动目标并触发 |
| 御琴羽寿沙都 | 连律折减 | drawCardStack≥10 时用最大数字牌 |
| 亚双义一真 | 七色染刃 | 条件满足时选第一张可变色牌，变为手牌最多色 |

---

## 四、房间配置

**添加/移除 AI**（仅房主在 lobby 状态可操作）：

```typescript
// 客户端 → 服务端
AddAiPlayerEvent    { type: "addAiPlayer" }
RemoveAiPlayerEvent { type: "removeAiPlayer"; playerId: string }
```

- AI 在选角阶段自动随机选择角色，无需等待
- 若全员（含 AI）选完则跳过倒计时
- 大厅和房间页面 AI 玩家显示紫色边框 + 🤖 图标

---

## 五、已知问题与待修复事项

### 核心逻辑层

| # | 问题 | 优先级 | 修复思路 |
|---|------|--------|---------|
| A-1 | **技能发动后 AI 回合未推进**：`handleAiSkill` 执行技能、广播状态后直接返回，未再次触发 AI 主回合决策。游戏流程卡住，需等回合超时才能推进 | 高 | 技能执行后，根据技能是否消耗回合判断：若不消耗（如御琴羽、亚双义），在 `handleAiSkill` 末尾重新调用 `handleAiMainTurn`，跳过技能决策分支 |
| A-2 | **Wild 组合出牌后未喊 UNO**：UNO 检查只在 `hand.length === 2 && !pendingWildCard` 时触发，Wild 组合出牌会同时消耗两张牌，导致漏喊 | 中 | 在 `executeMainDecision` 的 `comboPlay` 分支也加入 UNO 前置检查（`hand.length === 3` 时喊，因为组合打掉 2 张后剩 1 张） |
| A-3 | **服务端重启后 AI 玩家失效**：`in_game` 房间从 SQLite 恢复时，`aiPlayers` 数组保留了 ID，但 AI 调度不会自动触发，对局永久卡住在 AI 回合 | 高 | 在 `restoreRooms` 的重连宽限期结束后，对含 AI 的 `in_game` 房间调用 `triggerAiIfNeeded(room)` 重启 AI 调度 |
| A-4 | **`decideSkillUse` 调用时机**：在罚摸连锁中，`decideSkillUse` 先于连锁判断执行。若此时御琴羽技能触发，AI 会用技能把罚摸压到 10 以下，然后下一帧再判断连锁，逻辑正确但不直观 | 低 | 可接受，行为符合规则 |

### 服务端层

| # | 问题 | 优先级 | 修复思路 |
|---|------|--------|---------|
| A-5 | **多 AI 连续抢牌可能的抖动**：多个 AI 同时进入 snatch_window 时，各自以 350±250ms 延迟决策。若 AI-1 抢成功后触发新 snatch_window，AI-2 的旧计划已因 phaseToken 失效而自动取消，新 snatch_window 里 AI-2 会被重新调度。行为正确，但日志可能密集 | 低 | 已靠 phaseToken 保护，无需修复，可加日志降级 |
| A-6 | **AI 难度固定**：当前只有 Level-1 贪心，无难度选项 | 低 | 后续在 `addAiPlayer` 事件中加 `difficulty?: "easy"|"normal"|"hard"` 参数，切换不同策略函数 |

---

## 六、后续扩展方向

- **难度分级**：easy = 随机出牌；normal = 当前 Level-1；hard = 加入对手手牌推断
- **团队协作逻辑（Level-2）**：不 skip 快赢的队友，用反转帮队友挡罚摸
- **自定义 AI 角色**：在 `addAiPlayer` 时指定 AI 使用的角色
- **AI 速度配置**：通过环境变量 `AI_THINK_MS` 调整思考时间
