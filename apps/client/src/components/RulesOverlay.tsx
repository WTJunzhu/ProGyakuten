interface Props {
  onClose: () => void;
}

export function RulesOverlay({ onClose }: Props) {
  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="panel rules-card" onClick={(e) => e.stopPropagation()}>
        <h2>规则详情</h2>
        <h3>胜利目标</h3>
        <p>逆转 Uno 是一个组队对抗版 Uno。每局只能由 2 人、4 人或 6 人参加，系统会把玩家平均分成两队。任意一名队友先出完手牌，该队就立即获胜。</p>
        <h3>基础出牌</h3>
        <p>基础出牌方式仍然保留了同颜色或同内容可以出牌的思路，但大多数功能牌都已经和官方 Uno 不同，抢牌机制也会对局势产生很大影响。</p>
        <h3>普通 Wild</h3>
        <p>普通 Wild 不能单独打出。你需要先点击 Wild，选择一种颜色，然后再点击一张非 Wild 且非 +4 的牌。系统会把那张牌临时视作所选颜色的牌，再按照正常规则判断是否可以打出。</p>
        <h3>+4 与加牌链</h3>
        <p>+4 仍然是一张独立的功能牌，不需要和其他牌组合。加牌规则是：+2 后面可以继续接 +2 或 +4；+4 后面只能继续接 +4。同色 reverse 仍然可以作为反弹牌来改变罚摸方向。</p>
        <h3>Reverse</h3>
        <p>reverse 有两种作用。普通情况下，它会改变出牌方向。在罚摸连锁中，如果颜色满足条件，玩家也可以打出同色 reverse 来反弹当前罚摸。</p>
        <h3>Skip</h3>
        <p>skip 是一张禁色锁内容牌。当你打出 skip 时，让最后一次打出这张 skip 的玩家的下家进入一次受限主回合，只能打出任意颜色但内容相同的牌，或者直接打出 +4。</p>
        <h3>UNO 与抢牌</h3>
        <p>玩家只剩一张牌时最好主动喊 Uno。场上所有人都可以点击"检查 UNO"。每次有人出牌后都会进入抢牌判定阶段，其他玩家可以选择抢牌或跳过。</p>
        <button className="rules-close" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
