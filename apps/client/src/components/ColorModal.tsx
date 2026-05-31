import type { CardColor } from "@pro-gyakuten/protocol";
import { useGameStore } from "../stores/gameStore";
import { useToastStore } from "../stores/toastStore";

const COLORS: Exclude<CardColor, "wild">[] = ["red", "yellow", "blue", "green"];

export function ColorModal() {
  const pendingWildCard = useGameStore((s) => s.pendingWildCard);
  const pendingWildColor = useGameStore((s) => s.pendingWildColor);
  const pendingWildAction = useGameStore((s) => s.pendingWildAction);
  const setPendingWild = useGameStore((s) => s.setPendingWild);
  const setPendingSkill = useGameStore((s) => s.setPendingSkill);
  const pendingSkill = useGameStore((s) => s.pendingSkill);
  const wsRef = (window as unknown as { __wsRef: { send: (e: unknown) => void } }).__wsRef;

  if (!pendingWildCard || pendingWildColor) return null;

  const handleColor = (color: Exclude<CardColor, "wild">) => {
    const state = useGameStore.getState();
    const toast = useToastStore.getState().showToast;

    // ── 七色染刃：选颜色后发送 useSkill ──────────────────
    if (pendingWildAction === "skill_recolor" && pendingSkill) {
      wsRef?.send({
        type: "useSkill",
        skillId: pendingSkill.skillId,
        payload: { cardId: pendingWildCard.id, newColor: color }
      });
      setPendingWild(null, null, null);
      setPendingSkill(null);
      return;
    }

    // ── Wild 单独出牌：先选颜色，再点目标牌 ────────────────
    if (pendingWildCard.kind === "wild") {
      setPendingWild(pendingWildCard, color, state.pendingWildAction);
      toast("颜色已选择，请再点击一张非 Wild 牌完成组合出牌", "info");
      return;
    }

    if (pendingWildAction === "snatch") {
      wsRef?.send({
        type: "snatchCard",
        playerId: state.playerId,
        cardId: pendingWildCard.id,
        declaredColor: color
      });
      setPendingWild(null, null, null);
      return;
    }

    wsRef?.send({
      type: "playCard",
      playerId: state.playerId,
      cardId: pendingWildCard.id,
      declaredColor: color,
      turnId: state.gameState!.turnId,
      seq: state.nextSeq()
    });
    setPendingWild(null, null, null);
  };

  const handleBackdrop = () => {
    setPendingWild(null, null, null);
    if (pendingWildAction === "skill_recolor") setPendingSkill(null);
  };

  const title =
    pendingWildAction === "skill_recolor"
      ? "请选择变换后的颜色（七色染刃）"
      : "请选择变色后的颜色";

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="panel modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <div className="color-options">
          {COLORS.map((color) => (
            <div
              key={color}
              className={`color-btn ${color}`}
              onClick={() => handleColor(color)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
