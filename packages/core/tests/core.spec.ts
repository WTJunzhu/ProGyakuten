import { describe, expect, it, beforeEach } from "vitest";
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
  isCardSnatchable,
  isCardSnatchableLite,
  hasWildComboSnatchOption,
  getPlayerHand,
  toPublicState,
  alignTurnToSkipConstraint,
  registerCharacter,
  getCharacter,
  getAllCharacters,
  applyCharacterSkills,
  canUseSkill,
  consumeSkillUse,
  characterRegistry
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

  it("same-color reverse on +2 reverses direction", () => {
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

    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "rev_red");
    expect(state.drawCardStack).toBe(2);
    expect(state.direction).toBe(-1);
  });

  it("same-color reverse on +4 is allowed", () => {
    const state = setup4p("ds7");
    state.players[0].hand = [
      { id: "w4", color: "wild", kind: "wild_draw_four" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "rev_red", color: "red", kind: "reverse" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4", "red");
    expect(state.drawCardStack).toBe(4);

    const result = applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "rev_red");
    expect(result.ok).toBe(true);
    expect(state.drawCardStack).toBe(4);
    expect(state.direction).toBe(-1);
  });

  it("wrong-color reverse on +4 is rejected", () => {
    const state = setup4p("ds8");
    state.players[0].hand = [
      { id: "w4", color: "wild", kind: "wild_draw_four" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "rev_blue", color: "blue", kind: "reverse" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4", "red");
    expect(state.drawCardStack).toBe(4);

    const result = applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "rev_blue");
    expect(result.ok).toBe(false);
  });

  it("+4→reverse→+2 is rejected (penalty source is +4)", () => {
    const state = setup4p("ds9");
    state.players[0].hand = [
      { id: "w4", color: "wild", kind: "wild_draw_four" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "rev_red", color: "red", kind: "reverse" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];
    state.players[2].hand = [
      { id: "d2_red", color: "red", kind: "draw_two" },
      { id: "extra3", color: "yellow", kind: "number", value: 3 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4", "red");
    expect(state.drawCardStack).toBe(4);

    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "rev_red");
    expect(state.drawCardStack).toBe(4);

    const result = applyPlayCard(state, state.players[2].playerId, state.turnId, 1, "d2_red");
    expect(result.ok).toBe(false);
  });

  it("+4→+4→pass results in 8 penalty cards", () => {
    const state = setup4p("ds6");
    state.players[0].hand = [
      { id: "w4_1", color: "wild", kind: "wild_draw_four" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "w4_2", color: "wild", kind: "wild_draw_four" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4_1", "red");
    expect(state.drawCardStack).toBe(4);

    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "w4_2", "blue");
    expect(state.drawCardStack).toBe(8);

    const p3HandBefore = state.players[2].hand.length;
    applyPassTurn(state, state.players[2].playerId, state.turnId, 1);
    expect(state.players[2].hand.length).toBe(p3HandBefore + 8);
  });

  it("+4→wild-color-reverse→+2 is rejected (source stays +4)", () => {
    const state = setup4p("ds10");
    state.players[0].hand = [
      { id: "w4", color: "wild", kind: "wild_draw_four" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];
    state.players[1].hand = [
      { id: "wild1", color: "wild", kind: "wild" },
      { id: "rev_green", color: "green", kind: "reverse" },
      { id: "extra2", color: "yellow", kind: "number", value: 3 }
    ];
    state.players[2].hand = [
      { id: "d2_red", color: "red", kind: "draw_two" },
      { id: "extra3", color: "blue", kind: "number", value: 5 }
    ];

    // Player 0 plays +4 (declares red)
    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4", "red");
    expect(state.drawCardStack).toBe(4);
    expect(state.penaltySource).toBe("wild_draw_four");

    // Player 1 plays wild + reverse combo (declares red → red reverse)
    applyComboPlay(state, state.players[1].playerId, state.turnId, 1, "wild1", "rev_green", "red");
    expect(state.drawCardStack).toBe(4);
    expect(state.penaltySource).toBe("wild_draw_four");

    // Player 2 tries +2 → rejected because source is +4
    const result = applyPlayCard(state, state.players[2].playerId, state.turnId, 1, "d2_red");
    expect(result.ok).toBe(false);
  });

  it("+2→reverse→+4 is allowed (source is +2)", () => {
    const state = setup2p("ds11");
    state.players[0].hand = [
      { id: "d2_red", color: "red", kind: "draw_two" },
      { id: "w4", color: "wild", kind: "wild_draw_four" }
    ];
    state.players[1].hand = [
      { id: "rev_red", color: "red", kind: "reverse" },
      { id: "extra2", color: "green", kind: "number", value: 8 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "d2_red");
    expect(state.penaltySource).toBe("draw_two");

    // Player 1 plays reverse → direction flips, next is player 0 again
    applyPlayCard(state, state.players[1].playerId, state.turnId, 1, "rev_red");
    expect(state.penaltySource).toBe("draw_two");

    // Player 0 plays +4 (allowed because penaltySource is +2, not +4)
    const result = applyPlayCard(state, state.players[0].playerId, state.turnId, 2, "w4", "red");
    expect(result.ok).toBe(true);
    expect(state.penaltySource).toBe("wild_draw_four");
  });

  it("penaltySource clears after penalty resolves", () => {
    const state = setup4p("ds12");
    state.players[0].hand = [
      { id: "w4", color: "wild", kind: "wild_draw_four" },
      { id: "extra1", color: "blue", kind: "number", value: 9 }
    ];

    applyPlayCard(state, state.players[0].playerId, state.turnId, 1, "w4", "red");
    expect(state.penaltySource).toBe("wild_draw_four");

    applyPassTurn(state, state.players[1].playerId, state.turnId, 1);
    expect(state.penaltySource).toBe(null);
    expect(state.drawCardStack).toBe(0);
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

  it("+4 cannot snatch +2 (different kind, no exact match)", () => {
    const state = setup4p("sn4");
    state.discardPile = [{ id: "top_red_d2", color: "red", kind: "draw_two", value: 0 }];
    state.drawCardStack = 2;
    state.penaltySource = "draw_two";
    state.players[2].hand = [
      { id: "wd4", color: "red", kind: "wild_draw_four", value: 0 }
    ];

    const result = applySnatchCard(state, state.players[2].playerId, "wd4");
    expect(result.ok).toBe(false);
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

// ============================================================
// Combo snatch: Wild + colored card
// ============================================================
describe("combo snatch with Wild", () => {
  it("hasWildComboSnatchOption detects Wild + reverse combo", () => {
    const state = setup2p("wcs1");
    // Top card: blue reverse
    state.discardPile = [{ id: "top_blue_rev", color: "blue", kind: "reverse" }];
    state.drawCardStack = 0;

    // Player has: wild + green reverse
    const hand: Card[] = [
      { id: "wild1", color: "wild", kind: "wild" },
      { id: "green_rev", color: "green", kind: "reverse" }
    ];

    expect(hasWildComboSnatchOption(state, hand)).toBe(true);
  });

  it("isCardSnatchable rejects green reverse for blue reverse top", () => {
    const state = setup2p("wcs2");
    state.discardPile = [{ id: "top_blue_rev", color: "blue", kind: "reverse" }];
    state.drawCardStack = 0;
    state.players[0].hand = [
      { id: "wild1", color: "wild", kind: "wild" },
      { id: "green_rev", color: "green", kind: "reverse" }
    ];

    const greenRev = state.players[0].hand[1];
    expect(isCardSnatchable(state, greenRev)).toBe(false);
  });

  it("isCardSnatchableLite: transformed blue reverse matches blue reverse top", () => {
    const topCard: Card = { id: "top_blue_rev", color: "blue", kind: "reverse" };
    const transformedCard: Card = { id: "green_rev", color: "blue", kind: "reverse" };

    expect(isCardSnatchableLite({ card: transformedCard, topCard, drawCardStack: 0 })).toBe(true);
  });

  it("applyComboSnatch succeeds: Wild + green reverse (declared blue) on blue reverse", () => {
    const state = setup2p("wcs3");
    state.discardPile = [{ id: "top_blue_rev", color: "blue", kind: "reverse" }];
    state.drawCardStack = 0;
    state.direction = 1;

    // p2 (index 1) is the snatcher
    state.currentPlayerIndex = 0;
    const snatcherId = state.players[1].playerId;
    state.players[1].hand = [
      { id: "wild1", color: "wild", kind: "wild" },
      { id: "green_rev", color: "green", kind: "reverse" },
      { id: "other", color: "red", kind: "number", value: 3 }
    ];

    const result = applyComboSnatch(state, snatcherId, "wild1", "green_rev", "blue");
    expect(result.ok).toBe(true);
    // After combo, the green reverse (now blue) should be on top
    const top = state.discardPile[state.discardPile.length - 1];
    expect(top.kind).toBe("reverse");
    expect(top.color).toBe("blue");
  });

  it("isCardSnatchableLite: green reverse (original) does NOT match blue reverse top", () => {
    const topCard: Card = { id: "top_blue_rev", color: "blue", kind: "reverse" };
    const originalCard: Card = { id: "green_rev", color: "green", kind: "reverse" };

    expect(isCardSnatchableLite({ card: originalCard, topCard, drawCardStack: 0 })).toBe(false);
  });
});

// ============================================================
// 新钩子触发测试
// ============================================================
describe("character system hooks", () => {
  it("afterCardDrawn fires when drawing a card", () => {
    const state = setup2p("hook_draw1");
    let firedCount = 0;
    state.rules.hooks.push({ afterCardDrawn: () => { firedCount++; } });

    applyDrawCard(state, state.players[0].playerId, state.turnId, 1);
    expect(firedCount).toBe(1);
  });

  it("afterCardDrawn receives correct player and card", () => {
    const state = setup2p("hook_draw2");
    let capturedPlayerId = "";
    state.rules.hooks.push({
      afterCardDrawn: ({ player, card }) => {
        capturedPlayerId = player.playerId;
        expect(card).toBeDefined();
      }
    });

    applyDrawCard(state, state.players[0].playerId, state.turnId, 1);
    expect(capturedPlayerId).toBe("p1");
  });

  it("beforePenaltyDraw fires before penalty cards are drawn", () => {
    const state = setup4p("hook_penalty1");
    let capturedCount = 0;
    state.rules.hooks.push({ beforePenaltyDraw: ({ count }) => { capturedCount = count; } });

    state.drawCardStack = 2;
    state.penaltySource = "draw_two";
    applyPassTurn(state, state.players[0].playerId, state.turnId, 1);
    expect(capturedCount).toBe(2);
  });

  it("beforePenaltyDraw fires with correct drawCardStack count", () => {
    const state = setup4p("hook_penalty2");
    let firedWith = 0;
    state.rules.hooks.push({ beforePenaltyDraw: ({ count }) => { firedWith = count; } });

    state.drawCardStack = 6;
    state.penaltySource = "draw_two";
    applyPassTurn(state, state.players[0].playerId, state.turnId, 1);
    expect(firedWith).toBe(6);
  });

  it("onSkipConstraintSet fires when a skip card is played", () => {
    const state = setup4p("hook_skip1");
    let fired = false;
    state.rules.hooks.push({ onSkipConstraintSet: () => { fired = true; } });

    state.players[0].hand = [{ id: "skip_red", color: "red", kind: "skip" }];
    applyPlayCard(state, "p1", state.turnId, 1, "skip_red");
    expect(fired).toBe(true);
  });

  it("onSkipConstraintSet receives correct source and target players", () => {
    const state = setup4p("hook_skip2");
    let sourceId = "";
    let targetId = "";
    state.rules.hooks.push({
      onSkipConstraintSet: ({ sourcePlayer, targetPlayer }) => {
        sourceId = sourcePlayer.playerId;
        targetId = targetPlayer.playerId;
      }
    });

    state.players[0].hand = [{ id: "skip_red", color: "red", kind: "skip" }];
    applyPlayCard(state, "p1", state.turnId, 1, "skip_red");
    expect(sourceId).toBe("p1");
    expect(targetId).toBe("p2");
  });
});

// ============================================================
// 角色注册表测试
// ============================================================
describe("character registry", () => {
  beforeEach(() => {
    characterRegistry.clear();
  });

  it("registerCharacter adds a character to the registry", () => {
    registerCharacter({ id: "test_char", name: "测试角色", description: "desc", skills: [] });
    expect(getCharacter("test_char")).toBeDefined();
    expect(getCharacter("test_char")?.name).toBe("测试角色");
  });

  it("getCharacter returns undefined for unknown id", () => {
    expect(getCharacter("nonexistent")).toBeUndefined();
  });

  it("getAllCharacters returns all registered characters", () => {
    registerCharacter({ id: "char_a", name: "A", description: "", skills: [] });
    registerCharacter({ id: "char_b", name: "B", description: "", skills: [] });
    expect(getAllCharacters()).toHaveLength(2);
  });

  it("applyCharacterSkills sets characterAssignments", () => {
    registerCharacter({ id: "char_a", name: "A", description: "", skills: [] });
    const state = setup2p("char_apply1");
    applyCharacterSkills(state, { p1: "char_a" });
    expect(state.characterAssignments?.["p1"]).toBe("char_a");
  });

  it("applyCharacterSkills injects skill hooks into game rules", () => {
    let hookFired = false;
    registerCharacter({
      id: "hook_char",
      name: "钩子角色",
      description: "",
      skills: [{
        id: "hook_skill",
        name: "钩子技能",
        description: "",
        isActive: false,
        createHooks: (playerId) => ({
          afterCardPlayed: ({ player }) => {
            if (player.playerId === playerId) hookFired = true;
          }
        })
      }]
    });

    const state = setup2p("char_apply2");
    applyCharacterSkills(state, { p1: "hook_char" });

    state.players[0].hand = [
      { id: "red_3", color: "red", kind: "number", value: 3 },
      { id: "red_4", color: "red", kind: "number", value: 4 }
    ];
    applyPlayCard(state, "p1", state.turnId, 1, "red_3");
    expect(hookFired).toBe(true);
  });

  it("applyCharacterSkills initializes skillState for limited-use skills", () => {
    registerCharacter({
      id: "limited_char",
      name: "限次角色",
      description: "",
      skills: [{
        id: "limited_skill",
        name: "限次技能",
        description: "",
        isActive: true,
        maxUsesPerGame: 2
      }]
    });

    const state = setup2p("char_apply3");
    applyCharacterSkills(state, { p1: "limited_char" });
    expect(state.skillState?.["p1"]?.["limited_skill"]?.usesRemaining).toBe(2);
  });

  it("canUseSkill returns true when uses remain", () => {
    const state = setup2p("skill_use1");
    state.skillState = { p1: { skill_a: { usesRemaining: 1 } } };
    expect(canUseSkill(state, "p1", "skill_a")).toBe(true);
  });

  it("canUseSkill returns false when uses exhausted", () => {
    const state = setup2p("skill_use2");
    state.skillState = { p1: { skill_a: { usesRemaining: 0 } } };
    expect(canUseSkill(state, "p1", "skill_a")).toBe(false);
  });

  it("canUseSkill returns false when already used this turn", () => {
    const state = setup2p("skill_use3");
    state.skillState = { p1: { skill_a: { usesRemaining: 3, lastUsedTurnId: state.turnId } } };
    expect(canUseSkill(state, "p1", "skill_a")).toBe(false);
  });

  it("consumeSkillUse decrements usesRemaining", () => {
    const state = setup2p("skill_use4");
    state.skillState = { p1: { skill_a: { usesRemaining: 3 } } };
    consumeSkillUse(state, "p1", "skill_a");
    expect(state.skillState?.["p1"]?.["skill_a"]?.usesRemaining).toBe(2);
    expect(state.skillState?.["p1"]?.["skill_a"]?.lastUsedTurnId).toBe(state.turnId);
  });
});
