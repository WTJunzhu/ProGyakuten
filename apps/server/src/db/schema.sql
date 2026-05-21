-- 房间表
CREATE TABLE IF NOT EXISTS rooms (
  room_id TEXT PRIMARY KEY,
  owner_player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
  teams_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 玩家-房间关联
CREATE TABLE IF NOT EXISTS room_players (
  room_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  PRIMARY KEY (room_id, player_id),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
);

-- 游戏状态快照
CREATE TABLE IF NOT EXISTS game_snapshots (
  room_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  phase_json TEXT,
  saved_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
);

-- 玩家会话（用于断线重连）
CREATE TABLE IF NOT EXISTS player_sessions (
  player_id TEXT PRIMARY KEY,
  room_id TEXT,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 账户表
CREATE TABLE IF NOT EXISTS accounts (
  account_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 角色表
CREATE TABLE IF NOT EXISTS characters (
  character_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  assets_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
  UNIQUE(account_id, slot_index)
);
