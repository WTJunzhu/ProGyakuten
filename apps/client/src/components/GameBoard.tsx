import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, AllowedAction, GamePublicState, CharacterPublicInfo } from "@pro-gyakuten/protocol";
import { isCardPlayableLite, isCardSnatchableLite, matchesSkipConstraintLite } from "@pro-gyakuten/core";
import { useGameStore } from "../stores/gameStore";
import { useToastStore } from "../stores/toastStore";
import { cardFace, cardCornerText } from "../utils/card";

interface Props {
  wsSend: (e: unknown) => void;
  logCollapsed?: boolean;
}

function isActionAllowed(allowed: AllowedAction[], action: AllowedAction): boolean {
  return allowed.includes(action);
}

type GameState = NonNullable<ReturnType<typeof useGameStore.getState>["gameState"]>;

function isCardPlayable(card: Card, state: GameState, allowed: AllowedAction[], playerId: string, playableDrawnCardId: string | undefined, phase: string | undefined): boolean {
  if (phase === "post_draw_window") {
    return playableDrawnCardId === card.id && isActionAllowed(allowed, "play_drawn");
  }
  if (!isActionAllowed(allowed, "play")) return false;
  return isCardPlayableLite({ card, topCard: state.topCard, drawCardStack: state.drawCardStack, penaltySourceKind: state.penaltySourceKind, skipConstraint: state.skipConstraint, currentPlayerId: state.currentPlayerId, playerId });
}

function isCardSnatchable(card: Card, state: GameState, allowed: AllowedAction[], phase: string | undefined): boolean {
  if (phase !== "snatch_window" || !isActionAllowed(allowed, "snatch")) return false;
  return isCardSnatchableLite({ card, topCard: state.topCard, drawCardStack: state.drawCardStack });
}

function canStartWildCombo(card: Card, state: GameState, allowed: AllowedAction[], playerId: string, phase: string | undefined): boolean {
  if (card.kind !== "wild") return false;
  if (phase === "snatch_window") return isActionAllowed(allowed, "snatch");
  return state.currentPlayerId === playerId && isActionAllowed(allowed, "play");
}

function isWildComboTarget(card: Card, pendingWildCard: Card | null, pendingWildColor: string | null, state: GameState, allowed: AllowedAction[], playerId: string, phase: string | undefined): boolean {
  if (!pendingWildCard || !pendingWildColor) return false;
  if (card.id === pendingWildCard.id) return false;
  if (card.kind === "wild" || card.kind === "wild_draw_four") return false;
  const transformed: Card = { ...card, color: pendingWildColor as Card["color"] };
  if (phase === "snatch_window") {
    return isCardSnatchable(transformed, state, allowed, phase);
  }
  if (!isActionAllowed(allowed, "play")) return false;
  return isCardPlayableLite({ card: transformed, topCard: state.topCard, drawCardStack: state.drawCardStack, penaltySourceKind: state.penaltySourceKind, skipConstraint: state.skipConstraint, currentPlayerId: state.currentPlayerId, playerId });
}

function getPassLabel(phase: string | undefined, drawCardStack: number): string {
  if (phase === "post_draw_window") return "放弃打出";
  if (drawCardStack > 0) return "承受罚摸";
  return "跳过";
}

function getPhaseTitle(phase: string): string {
  const map: Record<string, string> = { turn_main: "主回合", snatch_window: "抢牌判定", post_draw_window: "摸牌判定" };
  return map[phase] ?? phase;
}

function getPhaseSubtitle(phase: string, actingPlayerId: string, sourcePlayerId?: string): string {
  if (phase === "turn_main") return `当前行动: ${actingPlayerId}`;
  if (phase === "snatch_window") return `${sourcePlayerId ?? actingPlayerId} 出牌后，等待抢牌`;
  return `${actingPlayerId} 正在判断是否打出刚摸到的牌`;
}

// ─── CharacterPanel: portrait + hover tooltip + click to activate ───
function CharacterPanel({
  character,
  compact = false,
  canActivate = false,
  isTargetable = false,
  onClick
}: {
  character: CharacterPublicInfo;
  compact?: boolean;
  canActivate?: boolean;
  isTargetable?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const clickable = canActivate || isTargetable;
  return (
    <div
      className={[
        "char-panel",
        compact ? "compact" : "",
        canActivate ? "skill-ready" : "",
        isTargetable ? "skill-targetable" : "",
        clickable ? "clickable" : ""
      ].filter(Boolean).join(" ")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={clickable ? onClick : undefined}
    >
      <div className="char-portrait">立绘</div>
      <div className="char-name-label">{character.name}</div>
      {canActivate && <div className="skill-ready-dot" title="技能可发动" />}
      {hover && (
        <div className="char-tooltip">
          <div className="char-tooltip-name">{character.name}</div>
          <div className="char-tooltip-desc">{character.description}</div>
          {canActivate && (
            <div className="char-tooltip-hint">▶ 点击立绘发动技能</div>
          )}
          {isTargetable && (
            <div className="char-tooltip-hint">▶ 点击选为目标</div>
          )}
          {character.skills.length > 0 && (
            <div className="char-tooltip-skills">
              {character.skills.map((skill) => (
                <div key={skill.id} className="char-tooltip-skill">
                  <div className="char-tooltip-skill-header">
                    <span className="char-tooltip-skill-name">{skill.name}</span>
                    {skill.isActive && <span className="skill-badge active">主动</span>}
                    {!skill.isActive && <span className="skill-badge passive">被动</span>}
                    {skill.maxUsesPerGame !== undefined && (
                      <span className="skill-badge limited">限{skill.maxUsesPerGame}次</span>
                    )}
                  </div>
                  <div className="char-tooltip-skill-desc">{skill.description}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const LONG_PRESS_MS = 300;
const MIN_VISIBLE = 28;
const MAX_VISIBLE = 92;
const MAX_EXPAND = 36;
const SIGMA = 90;

export function GameBoard({ wsSend, logCollapsed = false }: Props) {
  const gameState = useGameStore((s) => s.gameState);
  const hand = useGameStore((s) => s.hand);
  const teammateHands = useGameStore((s) => s.teammateHands);
  const phase = useGameStore((s) => s.phase);
  const allowedActions = useGameStore((s) => s.allowedActions);
  const playerId = useGameStore((s) => s.playerId);
  const playableDrawnCardId = useGameStore((s) => s.playableDrawnCardId);
  const gameOverState = useGameStore((s) => s.gameOverState);
  const pendingWildCard = useGameStore((s) => s.pendingWildCard);
  const pendingWildColor = useGameStore((s) => s.pendingWildColor);
  const setPendingWild = useGameStore((s) => s.setPendingWild);
  const logLines = useGameStore((s) => s.logLines);
  const nextSeq = useGameStore((s) => s.nextSeq);
  const reorderHand = useGameStore((s) => s.reorderHand);
  const characterAssignments = useGameStore((s) => s.characterAssignments);
  const pendingSkill = useGameStore((s) => s.pendingSkill);
  const setPendingSkill = useGameStore((s) => s.setPendingSkill);
  const isSpectating = useGameStore((s) => s.isSpectating);
  const spectators = useGameStore((s) => s.spectators);

  const logRef = useRef<HTMLDivElement>(null);
  const phaseTimeRef = useRef<HTMLDivElement>(null);
  const handContainerRef = useRef<HTMLDivElement>(null);
  const tableCenterRef = useRef<HTMLDivElement>(null);

  const [hoverX, setHoverX] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{ cardId: string; startX: number; startY: number } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase timer ticker
  useEffect(() => {
    const interval = setInterval(() => {
      if (phaseTimeRef.current && phase) {
        const remain = Math.max(0, phase.endsAt - Date.now());
        phaseTimeRef.current.textContent = `${(remain / 1000).toFixed(1)}s`;
      }
    }, 100);
    return () => clearInterval(interval);
  }, [phase]);

  // Cleanup long press timer
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  if (!gameState) return <div style={{ padding: 40, textAlign: "center" }}>加载中...</div>;

  const isMyTurn = gameState.currentPlayerId === playerId;
  const myTeam = gameState.teams.teamA.includes(playerId) ? "teamA" : "teamB";
  const otherPlayers = gameState.players.filter((p) => p.playerId !== playerId);
  const myCharacter = characterAssignments[playerId];

  // ─── 技能激活逻辑 ───
  const canUseSkillNow = isActionAllowed(allowedActions, "use_skill");

  const handleOwnPortraitClick = () => {
    if (!canUseSkillNow || !myCharacter) return;
    // 找第一个当前可发动的技能（单技能角色直接激活）
    const skill = myCharacter.skills.find((s) => s.isActive || s.inputType);
    if (!skill) return;
    const inputType = skill.inputType ?? "none";

    if (inputType === "none") {
      wsSend({ type: "useSkill", skillId: skill.id, payload: {} });
    } else {
      setPendingSkill({ skillId: skill.id, inputType });
    }
  };

  const handleTargetPortraitClick = (targetPlayerId: string) => {
    if (!pendingSkill || pendingSkill.inputType !== "target") return;
    wsSend({ type: "useSkill", skillId: pendingSkill.skillId, payload: { targetPlayerId } });
    setPendingSkill(null);
  };

  // 判断一个对手是否是当前技能的有效目标（由 canActivate 在服务端验证，客户端只高亮）
  const isValidSkillTarget = (targetPlayerId: string): boolean => {
    if (!pendingSkill || pendingSkill.inputType !== "target") return false;
    // 只高亮非己方玩家（仅外观提示，服务端做真正校验）
    const myTeamPlayers =
      myTeam === "teamA" ? gameState.teams.teamA : gameState.teams.teamB;
    return !myTeamPlayers.includes(targetPlayerId);
  };

  // ─── Card position calculation with hover expansion ───
  const containerWidth = handContainerRef.current?.clientWidth ?? 800;
  const cardCount = hand.length;
  const baseVisible = cardCount > 0 ? Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, (containerWidth - 80) / cardCount)) : MIN_VISIBLE;
  const totalWidth = cardCount > 0 ? (cardCount - 1) * baseVisible + 80 : 0;
  const visibleWidth = totalWidth > containerWidth ? (containerWidth - 80) / cardCount : baseVisible;

  const getCardLeft = useCallback((index: number): number => {
    if (!handContainerRef.current) return index * visibleWidth;
    const cw = handContainerRef.current.clientWidth;
    const count = hand.length;
    const vw = Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, (cw - 80) / count));
    const tw = count > 0 ? (count - 1) * vw + 80 : 0;
    const finalVw = tw > cw ? (cw - 80) / count : vw;
    let left = index * finalVw;
    if (hoverX !== null) {
      const cardCenter = left + 40;
      const dist = cardCenter - hoverX;
      const expand = MAX_EXPAND * Math.exp(-(dist * dist) / (2 * SIGMA * SIGMA));
      const direction = dist < 0 ? -1 : 1;
      left += expand * direction;
    }
    return left;
  }, [hoverX, hand.length]);

  // ─── Action handlers ───
  const playCard = (card: Card) => {
    if (card.kind === "wild_draw_four") {
      setPendingWild(card, null, "play");
      return;
    }
    wsSend({ type: "playCard", playerId, cardId: card.id, turnId: gameState.turnId, seq: nextSeq() });
  };

  const handleSnatch = (card: Card) => {
    if (card.kind === "wild_draw_four") {
      setPendingWild(card, null, "snatch");
      return;
    }
    wsSend({ type: "snatchCard", playerId, cardId: card.id });
  };

  const handleComboStart = (card: Card) => {
    setPendingWild(card, null, phase?.phase === "snatch_window" ? "snatch" : "combo");
  };

  const handleCardClick = (card: Card) => {
    if (touchHandledRef.current) { touchHandledRef.current = false; return; }

    // ── 技能选牌模式 ──────────────────────────────────────
    if (pendingSkill) {
      if (pendingSkill.inputType === "card") {
        // 御琴羽：只能选数字牌
        if (card.kind !== "number") {
          useToastStore.getState().showToast("请选择一张数字牌", "warning");
          return;
        }
        wsSend({ type: "useSkill", skillId: pendingSkill.skillId, payload: { cardId: card.id } });
        setPendingSkill(null);
        return;
      }
      if (pendingSkill.inputType === "card_and_color") {
        // 亚双义：不能选 Wild / +4
        if (card.kind === "wild" || card.kind === "wild_draw_four") {
          useToastStore.getState().showToast("Wild 牌和 +4 牌不可变色", "warning");
          return;
        }
        // 打开颜色弹窗，复用 ColorModal 的 skill_recolor 流程
        setPendingWild(card, null, "skill_recolor");
        return;
      }
      return; // 其他 inputType 在此不处理手牌点击
    }
    // ─────────────────────────────────────────────────────

    if (pendingWildCard && card.id === pendingWildCard.id) {
      setPendingWild(null, null, null);
      return;
    }
    if (pendingWildCard && pendingWildColor) {
      const target = isWildComboTarget(card, pendingWildCard, pendingWildColor, gameState, allowedActions, playerId, phase?.phase);
      if (target) {
        wsSend({
          type: "comboPlay",
          playerId,
          wildCardId: pendingWildCard.id,
          targetCardId: card.id,
          declaredColor: pendingWildColor,
          turnId: gameState.turnId,
          seq: nextSeq()
        });
        setPendingWild(null, null, null);
        return;
      }
    }
    const canPlay = isCardPlayable(card, gameState, allowedActions, playerId, playableDrawnCardId, phase?.phase);
    const canSnatch = isCardSnatchable(card, gameState, allowedActions, phase?.phase);
    const canCombo = canStartWildCombo(card, gameState, allowedActions, playerId, phase?.phase);
    if (canSnatch) { handleSnatch(card); return; }
    if (canCombo) { handleComboStart(card); return; }
    if (canPlay) { playCard(card); return; }
  };

  // ─── Drag: zone detection ───
  const isInPlayArea = useCallback((x: number, y: number): boolean => {
    if (!tableCenterRef.current) return false;
    const rect = tableCenterRef.current.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  const isInHandArea = useCallback((x: number, y: number): boolean => {
    if (!handContainerRef.current) return false;
    const rect = handContainerRef.current.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top - 40 && y <= rect.bottom + 40;
  }, []);

  const getDropIndex = useCallback((x: number): number => {
    if (!handContainerRef.current) return hand.length - 1;
    const rect = handContainerRef.current.getBoundingClientRect();
    const relX = x - rect.left;
    const count = hand.length;
    const cw = rect.width;
    const vw = Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, (cw - 80) / count));
    return Math.min(count - 1, Math.max(0, Math.round(relX / vw)));
  }, [hand.length]);

  // ─── Drag: pointer down + move detection ───
  const pointerStartRef = useRef<{ cardId: string; x: number; y: number } | null>(null);
  const touchHandledRef = useRef(false);

  const handlePointerDown = useCallback((card: Card, e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    touchHandledRef.current = false;
    pointerStartRef.current = { cardId: card.id, x: e.clientX, y: e.clientY };
    // Long-press timer for touch: sets dragState + hoverX after LONG_PRESS_MS
    const startX = e.clientX;
    const startY = e.clientY;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setDragState({ cardId: card.id, startX, startY });
    }, LONG_PRESS_MS);
  }, []);

  // Track pointer movement — set dragState when threshold exceeded
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!pointerStartRef.current || dragState) return;
      const dx = Math.abs(e.clientX - pointerStartRef.current.x);
      const dy = Math.abs(e.clientY - pointerStartRef.current.y);
      if (dx > 5 || dy > 5) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setDragState({ cardId: pointerStartRef.current.cardId, startX: pointerStartRef.current.x, startY: pointerStartRef.current.y });
      }
    };
    document.addEventListener("pointermove", handleMove);
    return () => document.removeEventListener("pointermove", handleMove);
  }, [dragState]);

  // ─── HTML5 Drag: start ───
  const handleDragStart = useCallback((card: Card, e: React.DragEvent) => {
    if (!dragState || dragState.cardId !== card.id) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", card.id);
    e.dataTransfer.effectAllowed = "move";
  }, [dragState]);

  // ─── HTML5 Drag: end (zone detection) ───
  const handleDragEnd = useCallback((card: Card, e: React.DragEvent) => {
    if (!dragState || dragState.cardId !== card.id) {
      setDragState(null);
      pointerStartRef.current = null;
      return;
    }
    const endX = e.clientX;
    const endY = e.clientY;

    if (isInPlayArea(endX, endY)) {
      const canPlay = isCardPlayable(card, gameState, allowedActions, playerId, playableDrawnCardId, phase?.phase);
      const canSnatch = isCardSnatchable(card, gameState, allowedActions, phase?.phase);
      if (canSnatch) { handleSnatch(card); }
      else if (canPlay) { playCard(card); }
      else { useToastStore.getState().showToast("当前无法打出此牌", "warning"); }
    } else if (isInHandArea(endX, endY)) {
      const fromIndex = hand.findIndex(c => c.id === card.id);
      const toIndex = getDropIndex(endX);
      if (fromIndex !== -1 && fromIndex !== toIndex) {
        reorderHand(fromIndex, toIndex);
      }
    }
    setDragState(null);
    pointerStartRef.current = null;
  }, [dragState, gameState, allowedActions, playerId, playableDrawnCardId, phase, hand, isInPlayArea, isInHandArea, getDropIndex, handleSnatch, playCard, reorderHand]);

  // ─── HTML5 Drag: over hand container ───
  const handleHandDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverX(e.nativeEvent.offsetX);
  }, []);

  // ─── Hover: mouse move on hand container ───
  const handleHandMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState) return;
    setHoverX(e.nativeEvent.offsetX);
  }, [dragState]);

  // ─── Hover: mouse leave ───
  const handleHandMouseLeave = useCallback(() => {
    if (dragState) return;
    setHoverX(null);
  }, [dragState]);

  // ─── Touch: long press + expand + drag ───
  const touchStartPos = useRef<{ x: number; y: number; cardId: string } | null>(null);

  const handleTouchStart = useCallback((card: Card, e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY, cardId: card.id };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      if (handContainerRef.current) {
        const rect = handContainerRef.current.getBoundingClientRect();
        setHoverX(touch.clientX - rect.left);
      }
      setDragState({ cardId: card.id, startX: touch.clientX, startY: touch.clientY });
    }, LONG_PRESS_MS);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (handContainerRef.current) {
      const rect = handContainerRef.current.getBoundingClientRect();
      setHoverX(touch.clientX - rect.left);
    }
    if (dragState && touchStartPos.current) {
      const dx = Math.abs(touch.clientX - touchStartPos.current.x);
      const dy = Math.abs(touch.clientY - touchStartPos.current.y);
      if (dx > 10 || dy > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    }
  }, [dragState]);

  const handleTouchEnd = useCallback((card: Card, e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    const touch = e.changedTouches[0];
    const endX = touch.clientX;
    const endY = touch.clientY;

    if (dragState && dragState.cardId === card.id) {
      if (isInPlayArea(endX, endY)) {
        const canPlay = isCardPlayable(card, gameState, allowedActions, playerId, playableDrawnCardId, phase?.phase);
        const canSnatch = isCardSnatchable(card, gameState, allowedActions, phase?.phase);
        if (canSnatch) { handleSnatch(card); }
        else if (canPlay) { playCard(card); }
        else { useToastStore.getState().showToast("当前无法打出此牌", "warning"); }
      } else if (isInHandArea(endX, endY)) {
        const fromIndex = hand.findIndex(c => c.id === card.id);
        const toIndex = getDropIndex(endX);
        if (fromIndex !== -1 && fromIndex !== toIndex) {
          reorderHand(fromIndex, toIndex);
        }
      }
      setDragState(null);
      pointerStartRef.current = null;
      touchHandledRef.current = true;
    } else if (!dragState) {
      touchHandledRef.current = true;
      handleCardClick(card);
    }
    setHoverX(null);
    touchStartPos.current = null;
  }, [dragState, gameState, allowedActions, playerId, playableDrawnCardId, phase, hand, isInPlayArea, isInHandArea, getDropIndex, handleSnatch, playCard, handleCardClick, reorderHand]);

  return (
    <div className="game-view" style={{ display: "grid" }}>
      {/* Settlement overlay */}
      {gameOverState && (
        <div className="settlement-overlay" style={{ display: "flex" }}>
          <div className="panel settlement-card">
            <h2 style={{ margin: "0 0 10px" }}>
              {gameOverState.winnerTeam === myTeam ? "我方胜利" : "我方失败"}
            </h2>
            <div className="hint" style={{ fontSize: 14 }}>
              本局已结束，可以留在房间再来一局，或退出房间。
            </div>
            <div className="settlement-actions">
              <button onClick={() => {
                useGameStore.getState().resetGame();
                useGameStore.getState().setView("room");
              }}>再来一局</button>
              <button onClick={() => {
                wsSend({ type: "leaveRoom", playerId });
                useGameStore.getState().resetGame();
                useGameStore.getState().setView("lobby");
              }}>退出房间</button>
            </div>
          </div>
        </div>
      )}

      {/* Row 1: Opponents */}
      <div className="opponents-area">
        {otherPlayers.map((p) => {
          const isTeammate = myTeam === "teamA"
            ? gameState.teams.teamA.includes(p.playerId)
            : gameState.teams.teamB.includes(p.playerId);
          const handHtml = isTeammate
            ? (teammateHands[p.playerId] ?? [])
            : null;

          return (
            <div
              key={p.playerId}
              className={`opponent ${p.playerId === gameState.currentPlayerId ? "active" : ""} ${!p.connected ? "disconnected" : ""}`}
            >
              <div style={{ fontWeight: 700 }}>
                {p.playerId}{isTeammate ? " (队友)" : ""}
              </div>
              {characterAssignments[p.playerId] && (
                <CharacterPanel
                  character={characterAssignments[p.playerId]}
                  compact
                  isTargetable={isValidSkillTarget(p.playerId)}
                  onClick={() => handleTargetPortraitClick(p.playerId)}
                />
              )}
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                {handHtml
                  ? handHtml.map((c) => (
                      <div key={c.id} className={`card small-card ${c.color}`}>{cardFace(c)}</div>
                    ))
                  : Array.from({ length: p.handCount }, (_, i) => (
                      <span key={i} className="card-back" />
                    ))
                }
              </div>
              <div className="hint">手牌: {p.handCount}</div>
            </div>
          );
        })}
      </div>

      {/* Row 2: Table center */}
      <div className={`table-center${dragState ? " drag-zone-play" : ""}`} ref={tableCenterRef}>
        <div className="pile-column">
          <div className="pile-caption">摸牌堆</div>
          <div className="pile-stack">
            <div className="draw-count">{gameState.drawPileCount}</div>
            <div className="deck" title="摸牌堆" />
          </div>
        </div>

        <div className="panel phase-panel">
          <div className="phase-title">{phase ? getPhaseTitle(phase.phase) : "回合阶段"}</div>
          <div className="phase-time" ref={phaseTimeRef}>{phase ? `${Math.max(0, (phase.endsAt - Date.now()) / 1000).toFixed(1)}s` : "--.-s"}</div>
          <div className="phase-subtitle">{phase ? getPhaseSubtitle(phase.phase, phase.actingPlayerId, phase.sourcePlayerId) : "等待开始"}</div>
        </div>

        <div className="pile-column">
          <div className="pile-caption">弃牌堆</div>
          <div className="pile-stack">
            {gameState.previousTopCard && (
              <div className={`discard-shadow ${gameState.previousTopCard.color}`}>
                <div style={{ fontSize: 24 }}>{cardFace(gameState.previousTopCard)}</div>
              </div>
            )}
            <div className={`discard ${gameState.topCard.color}`}>
              <div style={{ fontSize: 32 }}>{cardFace(gameState.topCard)}</div>
              {gameState.drawCardStack > 0 && (
                <div className="penalty-count">+{gameState.drawCardStack}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Player area or Spectator controls */}
      {isSpectating ? (
        <div className="player-area spectator-area">
          <div className="spectator-toolbar">
            <div className="spectator-badge">
              👁 观战中
              {spectators.length > 0 && (
                <span className="spectator-count">（{spectators.length} 人观战）</span>
              )}
            </div>
            <button onClick={() => {
              wsSend({ type: "leaveSpectator" });
              useGameStore.getState().resetGame();
              useGameStore.getState().setView("lobby");
            }}>离开观战</button>
          </div>
        </div>
      ) : (
      <div className="player-area">
        <div className="toolbar">
          {myCharacter && (
            <CharacterPanel
              character={myCharacter}
              canActivate={canUseSkillNow && !pendingSkill}
              onClick={handleOwnPortraitClick}
            />
          )}
          <div className="status-badge">
            {phase?.phase === "snatch_window" ? "抢牌判定阶段"
              : phase?.phase === "post_draw_window"
                ? (phase.actingPlayerId === playerId ? "判断是否打出刚摸到的牌" : `等待 ${phase.actingPlayerId} 判定`)
                : isMyTurn ? "你的主回合" : `等待 ${gameState.currentPlayerId}`}
          </div>
          <button
            disabled={!isActionAllowed(allowedActions, "callUno")}
            onClick={() => wsSend({ type: "callUno", playerId, turnId: gameState.turnId, seq: nextSeq() })}
          >喊 UNO</button>
          <button
            disabled={!isActionAllowed(allowedActions, "check_uno")}
            onClick={() => wsSend({ type: "checkUno", playerId })}
          >检查UNO</button>
          <button
            disabled={!isActionAllowed(allowedActions, "skip_snatch")}
            onClick={() => wsSend({ type: "skipSnatch", playerId })}
          >跳过抢牌</button>
          <button
            disabled={!isActionAllowed(allowedActions, "draw")}
            onClick={() => wsSend({ type: "drawCard", playerId, turnId: gameState.turnId, seq: nextSeq() })}
          >摸牌</button>
          <button
            disabled={!isActionAllowed(allowedActions, "pass")}
            onClick={() => wsSend({ type: "passTurn", playerId, turnId: gameState.turnId, seq: nextSeq() })}
          >{getPassLabel(phase?.phase, gameState.drawCardStack)}</button>
          <button onClick={() => {
            wsSend({ type: "leaveRoom", playerId });
            useGameStore.getState().resetGame();
            useGameStore.getState().setView("lobby");
          }}>退出房间</button>
        </div>

        <div className="hand-scroll">
          <div
            className={`hand-container${dragState ? " drag-zone-hand" : ""}`}
            ref={handContainerRef}
            onMouseMove={handleHandMouseMove}
            onMouseLeave={handleHandMouseLeave}
            onDragOver={handleHandDragOver}
          >
            {hand.map((card, index) => {
              const canPlay = isCardPlayable(card, gameState, allowedActions, playerId, playableDrawnCardId, phase?.phase);
              const canSnatch = isCardSnatchable(card, gameState, allowedActions, phase?.phase);
              const canCombo = canStartWildCombo(card, gameState, allowedActions, playerId, phase?.phase);
              const comboTarget = isWildComboTarget(card, pendingWildCard, pendingWildColor, gameState, allowedActions, playerId, phase?.phase);
              const enabled = pendingWildCard
                ? card.id === pendingWildCard.id || comboTarget
                : canPlay || canSnatch || canCombo;

              const classes = [
                "card",
                card.color,
                !enabled && "disabled",
                (canSnatch || comboTarget) && "can-snatch",
                pendingWildCard?.id === card.id && "combo-source",
                pendingWildColor && card.kind !== "wild" && card.kind !== "wild_draw_four" && "combo-preview",
                comboTarget && "combo-eligible",
                dragState?.cardId === card.id && "dragging"
              ].filter(Boolean).join(" ");

              const cardStyle: React.CSSProperties = {
                left: getCardLeft(index),
                zIndex: hoverX !== null ? 1 : index
              };

              const comboStyle: Record<string, string> = {};
              if (pendingWildColor && card.kind !== "wild" && card.kind !== "wild_draw_four") {
                const previewColors: Record<string, string> = { red: "#e74c3c", yellow: "#f1c40f", blue: "#3498db", green: "#2ecc71" };
                comboStyle["--combo-preview-color"] = previewColors[pendingWildColor] ?? "#fff";
                comboStyle["--combo-base-color"] = previewColors[card.color] ?? card.color;
                comboStyle["--combo-preview-text"] = pendingWildColor === "yellow" ? "#333" : "#fff";
              }

              return (
                <div
                  key={card.id}
                  className={classes}
                  style={{ ...cardStyle, ...comboStyle }}
                  draggable
                  onClick={() => handleCardClick(card)}
                  onPointerDown={(e) => handlePointerDown(card, e)}
                  onPointerUp={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } pointerStartRef.current = null; }}
                  onPointerLeave={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } pointerStartRef.current = null; }}
                  onDragStart={(e) => handleDragStart(card, e)}
                  onDragEnd={(e) => handleDragEnd(card, e)}
                  onTouchStart={(e) => handleTouchStart(card, e)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={(e) => handleTouchEnd(card, e)}
                >
                  <span className="corner tl">{cardCornerText(card)}</span>
                  <span className="card-center">{cardFace(card)}</span>
                  <span className="corner br">{cardCornerText(card)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )} {/* end of isSpectating ? ... : player-area */}

      {/* Side panel: log */}
      <div className={`side-panel panel${logCollapsed ? " collapsed" : ""}`}>
        <div style={{ fontWeight: 700 }}>对局日志</div>
        <div className="log-content" ref={logRef}>
          {logLines.map((line, i) => (
            <div key={i} style={{ marginBottom: 6 }}>{line}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
