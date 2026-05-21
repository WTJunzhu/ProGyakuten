import { describe, expect, it } from "vitest";
import type { Card } from "@pro-gyakuten/protocol";
import {
  applyCallUno,
  applyCheckUno,
  applyComboPlay,
  applyComboSnatch,
  applyDrawCard,
  applyPassTurn,
  applyPlayCard,
  applySnatchCard,
  createGame,
  isCardPlayable,
  getPlayerHand,
  toPublicState,
  alignTurnToSkipConstraint
} from "../src/index";

// Helper: force a deterministic game state after createGame
function setup2p(roomId = "test"): ReturnType<typeof createGame> {
  const state = createGame(roomId, ["p1", "p2"]);
  state.currentPlayerIndex = 0;
  state.direction = 1;
  state.discardPile = [{ id: "top_red_5", color: "red", kind: "number", value: 5 }];
  state.skipConstraint = undefined;
  state.drawCardStack = 0;
  return state;
}

function setup4p(roomId = "test"): ReturnType<typeof createGame> {
  const state = createGame(roomId, ["p1", "p2", "p3", "p4"]);
  state.currentPlayerIndex = 0;
  state.direction = 1;
  state.discardPile = [{ id: "top_red_5", color: "red", kind: "number", value: 5 }];
  state.skipConstraint = undefined;
  state.drawCardStack = 0;
  return state;
}

// ============================================================
// 基础创建测试
// ============================================================
describe("game creation", () => {
  it("creates 2-player game with correct hand sizes", () => {
    const state = createGame("cr1", ["p1", "p2"]);
    expect(state.players[0].hand).toHaveLength(2);
    expect(state.players[1].hand).toHaveLength(2);
  });

  it("creates 4-player game with correct hand sizes", () => {
    const state = createGame("cr2", ["p1", "p2", "p3", "p4"]);
    expect(state.players.every((p) => p.hand.length === 3)).toBe(true);
  });

  it("creates 6-player game with correct hand sizes", () => {
    const state = createGame("cr3", ["p1", "p2", "p3", "p4", "p5", "p6"]);
    expect(state.players.every((p) => p.hand.length === 4)).toBe(true);
  });

  it("initial hands contain only number cards", () => {
    for (let i = 0; i < 20; i++) {
      const state = createGame(`cr4_${i}`, ["p1", "p2", "p3", "p4", "p5", "p6"]);
      for (const player of state.players) {
        expect(player.hand.every((card) => card.kind === "number")).toBe(true);
      }
    }
  });

  it("top card is never wild or wild_draw_four", () => {
    for (let i = 0; i < 20; i++) {
      const state = createGame(`cr5_${i}`, ["p1", "p2", "p3", "p4"]);
      const top = state.discardPile[state.discardPile.length - 1];
      expect(top.kind).not.toBe("wild");
      expect(top.kind).not.toBe("wild_draw_four");
    }
  });
});

// ============================================================
// 基础游戏流程
// ============================================================
describe("core game flow", () => {
  it("draws a card without auto-ending the turn", () => {
    const state = setup2p("draw1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    const before = state.players[state.currentPlayerIndex].hand.length;
    const result = applyDrawCard(state, currentPlayer, state.turnId, 1);
    expect(result.ok).toBe(true);
    expect(state.players[state.currentPlayerIndex].hand.length).toBe(before + 1);
    expect(state.players[state.currentPlayerIndex].playerId).toBe(currentPlayer);
  });

  it("passes turn after drawing", () => {
    const state = setup2p("pass1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    applyDrawCard(state, currentPlayer, state.turnId, 1);
    const result = applyPassTurn(state, currentPlayer, state.turnId, 2);
    expect(result.ok).toBe(true);
    expect(state.players[state.currentPlayerIndex].playerId).not.toBe(currentPlayer);
  });

  it("records uno call when player has 2 cards", () => {
    const state = setup2p("uno1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "c1", color: "red", kind: "number", value: 3 },
      { id: "c2", color: "blue", kind: "number", value: 5 }
    ];
    const result = applyCallUno(state, currentPlayer, state.turnId, 1);
    expect(result.ok).toBe(true);
    expect(state.players[state.currentPlayerIndex].saidUnoForTurnId).toBe(state.turnId);
  });

  it("penalizes playing to one card without calling UNO", () => {
    const state = setup2p("uno2");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "play_me", color: "red", kind: "number", value: 7 },
      { id: "keep_me", color: "blue", kind: "number", value: 9 }
    ];
    const result = applyPlayCard(state, currentPlayer, state.turnId, 1, "play_me");
    expect(result.ok).toBe(true);
    const originalPlayer = state.players.find((p) => p.playerId === currentPlayer)!;
    expect(originalPlayer.hand.length).toBe(1);
    expect(originalPlayer.missedUnoPending).toBe(true);
  });

  it("does not penalize player who called UNO before playing to one card", () => {
    const state = setup2p("uno3");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "play_me", color: "red", kind: "number", value: 7 },
      { id: "keep_me", color: "blue", kind: "number", value: 9 }
    ];
    applyCallUno(state, currentPlayer, state.turnId, 1);
    const result = applyPlayCard(state, currentPlayer, state.turnId, 2, "play_me");
    expect(result.ok).toBe(true);
    const originalPlayer = state.players.find((p) => p.playerId === currentPlayer)!;
    expect(originalPlayer.missedUnoPending).toBe(false);
  });

  it("passes turn after reverse in a 2-player game", () => {
    const state = setup2p("rev1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "reverse", color: "red", kind: "reverse" },
      { id: "extra", color: "blue", kind: "number", value: 8 }
    ];
    const result = applyPlayCard(state, currentPlayer, state.turnId, 1, "reverse");
    expect(result.ok).toBe(true);
    // In 2-player, reverse = bounce back to other player
    expect(state.players[state.currentPlayerIndex].playerId).not.toBe(currentPlayer);
  });

  it("skip sets constraint targeting next player", () => {
    const state = setup4p("skip1");
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;
    state.players[0].hand = [{ id: "skip_red", color: "red", kind: "skip" }];
    state.players[1].hand = [
      { id: "blue_3", color: "blue", kind: "number", value: 3 },
      { id: "red_5", color: "red", kind: "number", value: 5 }
    ];

    const result = applyPlayCard(state, p1, state.turnId, 1, "skip_red");
    expect(result.ok).toBe(true);
    expect(state.skipConstraint?.targetPlayerId).toBe(p2);
    expect(state.skipConstraint?.requiredKind).toBe("number");
    expect(state.skipConstraint?.requiredValue).toBe(5);
  });

  it("rejects playing a wild alone", () => {
    const state = setup2p("wild1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "wild_only", color: "wild", kind: "wild" },
      { id: "keep_me", color: "blue", kind: "number", value: 8 }
    ];
    const result = applyPlayCard(state, currentPlayer, state.turnId, 1, "wild_only");
    expect(result.ok).toBe(false);
  });

  it("wild + non-wild combo play works", () => {
    const state = setup2p("combo1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "wild_combo", color: "wild", kind: "wild" },
      { id: "target_skip", color: "blue", kind: "skip" },
      { id: "keep_me", color: "green", kind: "number", value: 1 }
    ];

    const result = applyComboPlay(state, currentPlayer, state.turnId, 1, "wild_combo", "target_skip", "red");
    expect(result.ok).toBe(true);
    expect(state.discardPile[state.discardPile.length - 1].color).toBe("red");
    expect(state.discardPile[state.discardPile.length - 1].kind).toBe("skip");
  });

  it("wild + non-wild combo snatch works", () => {
    const state = setup4p("combo2");
    state.players[2].hand = [
      { id: "wild_combo", color: "wild", kind: "wild" },
      { id: "target_num", color: "blue", kind: "number", value: 5 },
      { id: "keep_me", color: "green", kind: "number", value: 9 }
    ];

    const result = applyComboSnatch(state, state.players[2].playerId, "wild_combo", "target_num", "red");
    expect(result.ok).toBe(true);
    expect(state.discardPile[state.discardPile.length - 1].color).toBe("red");
    expect(state.discardPile[state.discardPile.length - 1].value).toBe(5);
  });

  it("rejects draw two after a wild draw four stack", () => {
    const state = setup4p("stack1");
    state.players[0].hand = [{ id: "w4_red", color: "wild", kind: "wild_draw_four" }];
    state.players[1].hand = [{ id: "d2_red", color: "red", kind: "draw_two" }];

    const first = applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4_red", "red");
    expect(first.ok).toBe(true);

    const second = applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "d2_red");
    expect(second.ok).toBe(false);
  });

  it("publishes the previous discard top card", () => {
    const state = setup2p("prev1");
    const originalTop = state.discardPile[state.discardPile.length - 1];
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "play_me", color: "red", kind: "number", value: 3 },
      { id: "keep_me", color: "blue", kind: "number", value: 9 }
    ];

    applyPlayCard(state, currentPlayer, state.turnId, 1, "play_me");
    const pub = toPublicState(state);
    expect(pub.previousTopCard?.id).toBe(originalTop.id);
    expect(pub.topCard?.id).toBe("play_me");
  });

  it("replaces oldest card when drawing beyond 50-card hand cap", () => {
    const state = setup2p("cap1");
    const currentPlayer = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = Array.from({ length: 50 }, (_, i) => ({
      id: `c_${i}`,
      color: "red" as const,
      kind: "number" as const,
      value: ((i % 9) + 1)
    }));
    state.drawPile.push({ id: "new_card", color: "green", kind: "number", value: 8 });

    applyDrawCard(state, currentPlayer, state.turnId, 1);
    expect(state.players[0].hand).toHaveLength(50);
    expect(state.players[0].hand.some((card) => card.id === "c_0")).toBe(false);
    expect(state.players[0].hand.some((card) => card.id === "new_card")).toBe(true);
  });
});

// ============================================================
// Skip 约束测试
// ============================================================
describe("skip constraint", () => {
  it("sets skipConstraint with matching kind and value", () => {
    const state = setup4p("sc1");
    state.players[0].hand = [{ id: "skip_red", color: "red", kind: "skip" }];
    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "skip_red");

    expect(state.skipConstraint).toBeDefined();
    expect(state.skipConstraint?.requiredKind).toBe("number");
    expect(state.skipConstraint?.requiredValue).toBe(5);
  });

  it("under skip constraint, only matching content cards are playable", () => {
    const state = setup4p("sc2");
    state.players[0].hand = [{ id: "skip_red", color: "red", kind: "skip" }];
    state.players[1].hand = [
      { id: "blue_3", color: "blue", kind: "number", value: 3 },
      { id: "red_5", color: "red", kind: "number", value: 5 },
      { id: "red_skip", color: "red", kind: "skip" }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "skip_red");
    alignTurnToSkipConstraint(state);
    expect(isCardPlayable(state, state.players[1].hand[0])).toBe(false); // blue 3 - wrong value
    expect(isCardPlayable(state, state.players[1].hand[1])).toBe(true);  // red 5 - matches value
    expect(isCardPlayable(state, state.players[1].hand[2])).toBe(false); // skip - wrong kind
  });

  it("+4 is always playable even under skip constraint", () => {
    const state = setup4p("sc3");
    state.players[0].hand = [{ id: "skip_red", color: "red", kind: "skip" }];
    state.players[1].hand = [
      { id: "blue_5", color: "blue", kind: "number", value: 5 },
      { id: "wild4", color: "wild", kind: "wild_draw_four" }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "skip_red");
    alignTurnToSkipConstraint(state);
    expect(isCardPlayable(state, state.players[1].hand[0])).toBe(true);  // blue 5 matches value
    expect(isCardPlayable(state, state.players[1].hand[1])).toBe(true);  // +4 always playable
  });

  it("skip constraint is cleared after constrained player plays", () => {
    const state = setup4p("sc4");
    state.players[0].hand = [
      { id: "skip_red", color: "red", kind: "skip" },
      { id: "extra", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [{ id: "red_5", color: "red", kind: "number", value: 5 }];

    const r1 = applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "skip_red");
    expect(r1.ok).toBe(true);

    alignTurnToSkipConstraint(state);

    // Debug: verify state before p2 plays
    const p2Id = state.players[1].playerId;
    const currentId = state.players[state.currentPlayerIndex].playerId;
    const constraint = state.skipConstraint;

    // p2 should be current player
    expect(currentId).toBe(p2Id);
    // constraint should target p2
    expect(constraint?.targetPlayerId).toBe(p2Id);

    const r2 = applyPlayCard(state, p2Id, state.turnId, 1, "red_5");
    if (!r2.ok) {
      // If play failed, log why for debugging
      throw new Error(`p2 play failed: ${r2.code} - ${r2.message}`);
    }
    expect(state.skipConstraint).toBeUndefined();
  });
});

// ============================================================
// 罚摸连锁测试
// ============================================================
describe("draw card stack", () => {
  it("+2→+2→pass results in 4 penalty cards", () => {
    const state = setup4p("ds1");
    state.players[0].hand = [
      { id: "d2_red", color: "red", kind: "draw_two" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "d2_blue", color: "blue", kind: "draw_two" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "d2_red");
    expect(state.drawCardStack).toBe(2);

    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "d2_blue");
    expect(state.drawCardStack).toBe(4);

    const p3HandBefore = state.players[2].hand.length;
    applyPassTurn(state, state.players[2].playerId, state.turnId, 1);
    expect(state.players[2].hand.length).toBe(p3HandBefore + 4);
    expect(state.drawCardStack).toBe(0);
  });

  it("+2→+4→pass results in 6 penalty cards", () => {
    const state = setup4p("ds2");
    state.players[0].hand = [
      { id: "d2_red", color: "red", kind: "draw_two" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "w4", color: "wild", kind: "wild_draw_four" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "d2_red");
    expect(state.drawCardStack).toBe(2);

    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "w4", "blue");
    expect(state.drawCardStack).toBe(6);

    const p3HandBefore = state.players[2].hand.length;
    applyPassTurn(state, state.players[2].playerId, state.turnId, 1);
    expect(state.players[2].hand.length).toBe(p3HandBefore + 6);
  });

  it("+4→+2 is rejected", () => {
    const state = setup4p("ds4");
    state.players[0].hand = [{ id: "w4", color: "wild", kind: "wild_draw_four" }];
    state.players[1].hand = [{ id: "d2_red", color: "red", kind: "draw_two" }];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4", "red");
    expect(state.drawCardStack).toBe(4);

    const result = applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "d2_red");
    expect(result.ok).toBe(false);
  });

  it("same-color reverse in draw stack reverses direction", () => {
    const state = setup4p("ds5");
    state.players[0].hand = [
      { id: "d2_red", color: "red", kind: "draw_two" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "rev_red", color: "red", kind: "reverse" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "d2_red");
    expect(state.drawCardStack).toBe(2);
    expect(state.direction).toBe(1);

    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "rev_red");
    expect(state.drawCardStack).toBe(2);
    expect(state.direction).toBe(-1);
    // After reverse, next player is p1 (going backwards from p2)
    expect(state.players[state.currentPlayerIndex].playerId).toBe(state.players[0].playerId);
  });
});

// ============================================================
// Wild 组合出牌
// ============================================================
describe("wild combo with different card types", () => {
  it("wild + skip card combo", () => {
    const state = setup2p("wc1");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "wild_combo", color: "wild", kind: "wild" },
      { id: "skip_blue", color: "blue", kind: "skip" }
    ];

    const result = applyComboPlay(state, cp, state.turnId, 1, "wild_combo", "skip_blue", "red");
    expect(result.ok).toBe(true);
    expect(state.discardPile[state.discardPile.length - 1].kind).toBe("skip");
    expect(state.discardPile[state.discardPile.length - 1].color).toBe("red");
  });

  it("wild + draw_two card combo", () => {
    const state = setup2p("wc3");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "wild_combo", color: "wild", kind: "wild" },
      { id: "d2_blue", color: "blue", kind: "draw_two" }
    ];

    const result = applyComboPlay(state, cp, state.turnId, 1, "wild_combo", "d2_blue", "red");
    expect(result.ok).toBe(true);
    expect(state.drawCardStack).toBe(2);
  });

  it("wild + wild_draw_four combo is rejected", () => {
    const state = setup2p("wc5");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "wild1", color: "wild", kind: "wild" },
      { id: "wild2", color: "wild", kind: "wild_draw_four" }
    ];

    const result = applyComboPlay(state, cp, state.turnId, 1, "wild1", "wild2", "red");
    expect(result.ok).toBe(false);
  });
});

// ============================================================
// 补牌机制
// ============================================================
describe("replenish hand", () => {
  it("auto-draws after playing last number card until hand has a number card", () => {
    const state = setup2p("rp1");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "play_me", color: "red", kind: "number", value: 3 },
      { id: "skip_card", color: "red", kind: "skip" }
    ];
    state.drawPile = [
      { id: "drawn_1", color: "blue", kind: "number", value: 7 },
      { id: "drawn_2", color: "green", kind: "number", value: 2 }
    ];

    applyPlayCard(state, cp, state.turnId, 1, "play_me");
    const originalPlayer = state.players.find((p) => p.playerId === cp)!;
    const hasNumber = originalPlayer.hand.some((card) => card.kind === "number");
    expect(hasNumber).toBe(true);
  });
});

// ============================================================
// UNO 检查边界
// ============================================================
describe("UNO check edge cases", () => {
  it("player can recover missed UNO before being checked", () => {
    const state = setup2p("uno_check1");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "p1_card", color: "red", kind: "number", value: 3 }
    ];
    state.players[state.currentPlayerIndex].missedUnoPending = true;

    const callResult = applyCallUno(state, cp, state.turnId, 1);
    expect(callResult.ok).toBe(true);
    expect(state.players[state.currentPlayerIndex].missedUnoPending).toBe(false);
  });
});

// ============================================================
// 验证逻辑
// ============================================================
describe("validation", () => {
  it("rejects action when not your turn (NOT_YOUR_TURN)", () => {
    const state = setup2p("val1");
    const notCurrentPlayer = state.players[1].playerId;
    state.players[1].hand = [{ id: "card", color: "red", kind: "number", value: 3 }];

    const result = applyPlayCard(state, notCurrentPlayer, state.turnId, 1, "card");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NOT_YOUR_TURN");
  });

  it("rejects action with wrong turnId (TURN_MISMATCH)", () => {
    const state = setup2p("val2");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "card", color: "red", kind: "number", value: 3 }
    ];

    const result = applyPlayCard(state, cp, state.turnId + 99, 1, "card");
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TURN_MISMATCH");
  });

  it("rejects action with stale seq (SEQ_MISMATCH)", () => {
    const state = setup2p("val3");
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].lastSeq = 5;

    const result = applyDrawCard(state, cp, state.turnId, 3);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SEQ_MISMATCH");
  });
});

// ============================================================
// 开局顶牌
// ============================================================
describe("starting top card", () => {
  it("starting top card is always a number card", () => {
    for (let i = 0; i < 50; i++) {
      const state = createGame(`start_${i}`, ["p1", "p2", "p3", "p4"]);
      const top = state.discardPile[state.discardPile.length - 1];
      expect(top.kind).toBe("number");
    }
  });

  it("starting direction is always 1 and first player is index 0", () => {
    for (let i = 0; i < 20; i++) {
      const state = createGame(`start_dir_${i}`, ["p1", "p2", "p3", "p4"]);
      expect(state.direction).toBe(1);
      expect(state.currentPlayerIndex).toBe(0);
    }
  });
});

// ============================================================
// 抢牌
// ============================================================
describe("snatch", () => {
  it("allows snatching with an exact match card", () => {
    const state = setup4p("sn1");
    state.players[2].hand = [
      { id: "snatch_card", color: "red", kind: "number", value: 5 },
      { id: "extra", color: "blue", kind: "number", value: 9 }
    ];

    const result = applySnatchCard(state, state.players[2].playerId, "snatch_card");
    expect(result.ok).toBe(true);
    expect(state.players[2].hand.length).toBe(1);
  });

  it("rejects snatching with a non-matching card", () => {
    const state = setup4p("sn2");
    state.players[2].hand = [
      { id: "wrong_card", color: "blue", kind: "number", value: 5 }
    ];

    const result = applySnatchCard(state, state.players[2].playerId, "wrong_card");
    expect(result.ok).toBe(false);
  });

  it("wild combo snatch works with correct color transformation", () => {
    const state = setup4p("sn3");
    state.players[2].hand = [
      { id: "wild_c", color: "wild", kind: "wild" },
      { id: "blue_5", color: "blue", kind: "number", value: 5 }
    ];

    const result = applyComboSnatch(state, state.players[2].playerId, "wild_c", "blue_5", "red");
    expect(result.ok).toBe(true);
  });
});

// ============================================================
// toPublicState
// ============================================================
describe("toPublicState", () => {
  it("includes all required fields", () => {
    const state = setup2p("pub1");
    const pub = toPublicState(state);

    expect(pub.roomId).toBe("pub1");
    expect(pub.gameId).toBeDefined();
    expect(pub.turnId).toBeDefined();
    expect(pub.currentPlayerId).toBeDefined();
    expect(pub.direction).toBeDefined();
    expect(pub.topCard).toBeDefined();
    expect(pub.players).toHaveLength(2);
    expect(pub.drawPileCount).toBeGreaterThan(0);
    expect(pub.teams).toBeDefined();
    expect(pub.drawCardStack).toBe(0);
  });

  it("hides hand contents from public state", () => {
    const state = setup2p("pub2");
    const pub = toPublicState(state);

    for (const player of pub.players) {
      expect(player).not.toHaveProperty("hand");
      expect(player.handCount).toBeDefined();
      expect(typeof player.handCount).toBe("number");
    }
  });

  it("includes previousTopCard after first play", () => {
    const state = setup2p("pub3");
    const firstTop = state.discardPile[state.discardPile.length - 1];
    const cp = state.players[state.currentPlayerIndex].playerId;
    state.players[state.currentPlayerIndex].hand = [
      { id: "play_me", color: "red", kind: "number", value: 3 },
      { id: "extra", color: "blue", kind: "number", value: 9 }
    ];

    applyPlayCard(state, cp, state.turnId, 1, "play_me");
    const pub = toPublicState(state);

    expect(pub.previousTopCard?.id).toBe(firstTop.id);
    expect(pub.topCard?.id).toBe("play_me");
  });
});

// ============================================================
// getPlayerHand
// ============================================================
describe("getPlayerHand", () => {
  it("returns a copy of the player hand", () => {
    const state = setup2p("ph1");
    const hand = getPlayerHand(state, state.players[0].playerId);

    expect(hand.length).toBe(state.players[0].hand.length);
    hand.push({ id: "fake", color: "red", kind: "number", value: 1 });
    expect(state.players[0].hand.length).not.toBe(hand.length);
  });

  it("returns empty array for unknown player", () => {
    const state = setup2p("ph2");
    const hand = getPlayerHand(state, "unknown");
    expect(hand).toEqual([]);
  });
});
