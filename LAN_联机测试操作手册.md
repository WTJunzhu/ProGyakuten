# new-uno 联机测试操作手册（最终版）

## 1. 手册说明

本手册整合了 `new-uno` 的完整联机流程，覆盖两种模式：

- 模式 A：同一局域网联机（LAN）
- 模式 B：跨网络联机（cpolar 隧道）

适用目标：

- 你负责所有部署与配置
- 其他玩家只需打开页面并输入必要字段

---

## 2. 房主端固定启动流程（两种模式共用）

### 2.1 启动服务端

```powershell
cd D:\AITest\new-uno
npm.cmd run dev:server
```

### 2.2 启动前端

新开一个终端：

```powershell
cd D:\AITest\new-uno
npm.cmd run dev:client
```

### 2.3 本机健康检查

先在你自己电脑确认：

- 打开 `http://localhost:5173` 能看到页面
- 页面里 `服务器 WS` 填 `ws://localhost:3001`
- 点击 `连接` 后有“连接成功”日志

---

## 3. 模式 A：同一局域网联机（LAN）

### 3.1 房主准备

1. 执行 `ipconfig`，找到正确的局域网 IPv4（例如 `192.168.1.23`）。
2. 以管理员身份放行防火墙端口：

```powershell
netsh advfirewall firewall add rule name="new-uno-vite-5173" dir=in action=allow protocol=TCP localport=5173
netsh advfirewall firewall add rule name="new-uno-ws-3001" dir=in action=allow protocol=TCP localport=3001
```

3. 确认双方在同一网段，且可互相 `ping`。

### 3.2 房主进入游戏

- 页面：`http://localhost:5173`（或 `http://房主IP:5173`）
- `服务器 WS`：`ws://localhost:3001`（或 `ws://房主IP:3001`）
- 输入唯一 `playerId`
- 输入房间号 `roomId`
- 点击：`连接` -> `创建房间`

### 3.3 其他玩家进入游戏

- 页面：`http://房主IP:5173`
- `服务器 WS`：`ws://房主IP:3001`
- 输入唯一 `playerId`
- 输入与房主一致的 `roomId`
- 点击：`连接` -> `加入房间`

---

## 4. 模式 B：跨网络联机（cpolar）

当无法同网段时，使用此模式。

### 4.1 你需要开启两条隧道（非常重要）

cpolar 的一个域名通常只能映射到一个本地端口。因此你需要：

1. **前端隧道**：映射 `localhost:5173` -> 得到地址 A（如 `https://uno-web.cpolar.top`）
2. **WS 隧道**：映射 `localhost:3001` -> 得到地址 B（如 `https://uno-ws.cpolar.top`）

### 4.2 混合内容（HTTPS）限制

- 如果你通过 `https://...` 访问前端页面，浏览器**强制要求** WebSocket 必须使用 `wss://` 协议。
- **错误做法**：在 HTTPS 页面中填写 `ws://...`（会被浏览器拦截）。
- **正确做法**：在 HTTPS 页面中填写 `wss://你的WS隧道域名`（不要带端口号，cpolar 隧道默认已处理端口）。

### 4.3 房主进入游戏（cpolar）

- 打开前端公网地址
- `服务器 WS` 填公网 WS 地址
- 输入唯一 `playerId` 和 `roomId`
- 点击：`连接` -> `创建房间`

### 4.4 其他玩家进入游戏（cpolar）

- 打开同一个前端公网地址
- `服务器 WS` 填同一个公网 WS 地址
- 输入唯一 `playerId`，`roomId` 与房主一致
- 点击：`连接` -> `加入房间`

---

## 5. 对局操作标准顺序

1. 房主先 `创建房间`
2. 玩家陆续 `加入房间`
3. 房主点击 `开始游戏`
4. 正常操作：出牌/抽牌/过牌/UNO
5. 测试重连：任一玩家刷新页面，重新连接后应恢复

---

## 6. 常见问题与处理

### 6.1 点击按钮显示“未连接服务器”

- 必须先点 `连接`
- 确认 `服务器 WS` 不是 `localhost`（远程玩家场景）

### 6.2 cpolar 页面报 `Blocked request host is not allowed`

- 已在客户端加入 `vite server.allowedHosts`
- 重启 `npm.cmd run dev:client` 后再试

### 6.3 打开页面成功，但连接失败

- 检查 `ws://` 与 `wss://` 是否与页面协议匹配
- 检查 WS 隧道是否指向 `3001`

### 6.4 能连接但加入失败

- `roomId` 不一致
- `playerId` 重复
- 房间已满（最多 6 人）

### 6.5 本机有多个 IPv4，不确定哪个可用

- 以“双方可 ping 通”的地址为准
- 虚拟网卡地址（如热点/虚拟适配器）常不可用

---

## 7. 联测前清单

- [ ] 服务端运行中（3001）
- [ ] 前端运行中（5173）
- [ ] 房主页面可正常连接本地 WS
- [ ] 每位玩家 `playerId` 唯一
- [ ] 所有玩家使用同一 `roomId`
- [ ] 远程模式下，页面地址与 WS 地址都来自隧道
- [ ] 隧道窗口保持在线，不要关闭

