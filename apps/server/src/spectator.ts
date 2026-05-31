import { toPublicState, getCharacter } from "@pro-gyakuten/core";
import type { CharacterPublicInfo } from "@pro-gyakuten/protocol";
import type { PlayerConn, RoomState } from "./types.js";
import { playersById, send } from "./state.js";
import { broadcastGameState, roomSnapshot } from "./broadcast.js";
import { broadcastRoomSnapshot } from "./room.js";

const MAX_SPECTATORS = 20;

/** 玩家以观战者身份加入房间 */
export function handleJoinRoomAsSpectator(
  conn: PlayerConn,
  room: RoomState
): { ok: boolean; error?: string } {
  if (!conn.playerId) return { ok: false, error: "请先选择角色" };
  if (room.status !== "in_game" && room.status !== "game_over") {
    return { ok: false, error: "该房间当前不可观战" };
  }
  if (room.players.includes(conn.playerId)) {
    return { ok: false, error: "你已经是该房间的玩家" };
  }
  if (room.spectators.includes(conn.playerId)) {
    return { ok: false, error: "你已经在观战该房间" };
  }
  if (room.spectators.length >= MAX_SPECTATORS) {
    return { ok: false, error: "观战人数已达上限" };
  }

  conn.roomId = room.roomId;
  conn.isInLobby = false;
  room.spectators.push(conn.playerId);

  // 向观战者发送当前完整游戏快照（手牌为空）
  if (room.game && room.phase) {
    const assignments = buildCharacterAssignments(room);
    send(conn.ws, {
      type: "spectatorGameSnapshot",
      state: toPublicState(room.game),
      phase: room.phase,
      spectators: room.spectators.map(id => ({ playerId: id })),
      characterAssignments: Object.keys(assignments).length > 0 ? assignments : undefined,
      message: "开始观战"
    });
  }

  // 向所有人（玩家+观战者）广播观战者加入
  broadcastToAll(room, { type: "spectatorJoined", playerId: conn.playerId });
  // 刷新房间快照（含观战者人数）
  broadcastRoomSnapshot(room);

  return { ok: true };
}

/** 观战者主动离开或断线 */
export function handleLeaveSpectator(conn: PlayerConn, room: RoomState): void {
  room.spectators = room.spectators.filter(id => id !== conn.playerId);
  conn.roomId = undefined;
  conn.isInLobby = true;

  broadcastToAll(room, { type: "spectatorLeft", playerId: conn.playerId });
  broadcastRoomSnapshot(room);
}

/** 向房间所有玩家和观战者广播一个事件 */
export function broadcastToAll(room: RoomState, event: unknown): void {
  const everyone = [...room.players, ...room.spectators];
  for (const pid of everyone) {
    const c = playersById.get(pid);
    if (c && c.roomId === room.roomId) {
      send(c.ws, event as never);
    }
  }
}

/** 构建角色分配映射（供观战快照使用） */
function buildCharacterAssignments(room: RoomState): Record<string, CharacterPublicInfo> {
  const assignments: Record<string, CharacterPublicInfo> = {};
  if (!room.game?.characterAssignments) return assignments;
  for (const [playerId, charId] of Object.entries(room.game.characterAssignments)) {
    const char = getCharacter(charId);
    if (char) assignments[playerId] = char;
  }
  return assignments;
}
