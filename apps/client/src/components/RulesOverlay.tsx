interface Props {
  onClose: () => void;
}

export function RulesOverlay({ onClose }: Props) {
  return (
    <div className="rules-overlay" onClick={onClose}>
      <div className="panel rules-card" onClick={(e) => e.stopPropagation()}>
        <h2>规则详情</h2>
        <h3>游戏目标</h3>
        <p>组队对抗版 UNO。2/4/6 人均分两队，同队手牌互见。任意队友先出完手牌，该队立即获胜。</p>
        <h3>基础出牌</h3>
        <p>出与弃牌堆顶同颜色或同内容的牌。无法出牌则摸 1 张结束回合。本作功能牌与官方 UNO 不同，抢牌机制影响巨大。</p>
        <h3>Wild（变色组合牌）</h3>
        <p>Wild 不能单出。点击 Wild → 选颜色 → 再点一张非 Wild 非 +4 的牌，系统将目标牌视作所选颜色再判断合法性。</p>
        <h3>+4 与加牌链</h3>
        <p>+4 独立打出，出牌者选颜色。+2 后可接 +2/+4/同色 Reverse；+4 后只能接 +4/同色 Reverse。同色 Reverse 可反弹罚摸方向。</p>
        <h3>Reverse（反转牌）</h3>
        <p>普通情况改变出牌方向；加牌链中可打出同色 Reverse 反弹罚摸。</p>
        <h3>Skip（跳过牌）</h3>
        <p>Skip 是"禁色锁内容牌"：打出后下家进入受限回合，只能出同内容任意颜色的牌或 +4，颜色无效。无法出牌先罚摸 1 张，仍不行则结束回合。</p>
        <h3>补牌</h3>
        <p>出牌后若手牌无数牌，自动补摸直到出现数字牌为止。</p>
        <h3>抢牌</h3>
        <p>每次出牌后进入 30s 抢牌窗口，其他玩家可打出与顶牌完全相同的牌抢夺出牌权。Wild 可组合抢牌（先变色再判断完全一致）。</p>
        <h3>UNO</h3>
        <p>剩 1 张牌时主动喊 UNO。其他人可点击"检查 UNO"，漏喊罚摸 2 张，误报罚摸 2 张。被查前可补喊。</p>
        <h3>爆牌判负</h3>
        <p>手牌 ≥ 20 张的玩家所在队伍直接判负。</p>
        <button className="rules-close" onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}
