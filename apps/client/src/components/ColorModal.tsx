import type { CardColor } from "@pro-gyakuten/protocol";
import { useGameStore } from "../stores/gameStore";
import { useToastStore } from "../stores/toastStore";

const COLORS: Exclude<CardColor, "wild">[] = ["red", "yellow", "blue", "green"];

export function ColorModal() {
  const pendingWildCard = useGameStore((s) => s.pendingWildCard);
  const pendingWildColor = useGameStore((s) => s.pendingWildColor);
  const pendingWildAction = useGameStore((s) => s.pendingWildAction);
  const setPendingWild = useGameStore((s) => s.setPendingWild);
  const wsRef = (window as unknown as { __wsRef: { send: (e: unknown) => void } }).__wsRef;

  if (!pendingWildCard || pendingWildColor) return null;

  const handleColor = (color: Exclude<CardColor, "wild">) => {
    const state = useGameStore.getState();
    const toast = useToastStore.getState().showToast;

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
  };

  return (
    <div className="modal-overlay" onClick={handleBackdrop}>
      <div className="panel modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>请选择变色后的颜色</h3>
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
