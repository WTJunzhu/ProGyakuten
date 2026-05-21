import { useState } from "react";
import { useGameStore } from "../stores/gameStore";
import { useToastStore } from "../stores/toastStore";

interface Props {
  wsSend: (e: unknown) => void;
}

export function CharacterSelect({ wsSend }: Props) {
  const characters = useGameStore((s) => s.characters);
  const token = useGameStore((s) => s.token);
  const setView = useGameStore((s) => s.setView);
  const toast = useToastStore((s) => s.showToast);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [overwriteSlot, setOverwriteSlot] = useState<number | null>(null);

  const handleSelect = (characterId: string) => {
    if (!token) return;
    wsSend({ type: "selectCharacter", token, characterId });
  };

  const handleCreate = () => {
    if (!token) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      toast("请输入角色名称", "warning");
      return;
    }
    wsSend({ type: "createCharacter", token, displayName: trimmed, overwriteSlotIndex: overwriteSlot ?? undefined });
    setShowCreate(false);
    setNewName("");
    setOverwriteSlot(null);
  };

  const handleCreateClick = () => {
    if (characters.length >= 3) {
      // Need to overwrite — show slot selection
      setShowCreate(true);
    } else {
      setShowCreate(true);
    }
  };

  return (
    <div className="center-view">
      <div className="panel center-card">
        <h2>选择角色</h2>
        <div className="lobby-players">
          {characters.map((c) => (
            <div
              key={c.characterId}
              className="opponent"
              style={{ minWidth: 160, cursor: "pointer" }}
              onClick={() => handleSelect(c.characterId)}
            >
              <div style={{ fontWeight: 700 }}>{c.displayName}</div>
              <div className="hint">
                Lv.{c.level} | {c.wins}胜 {c.losses}负
              </div>
            </div>
          ))}
          {characters.length < 3 && (
            <div
              className="opponent"
              style={{ minWidth: 160, cursor: "pointer", borderStyle: "dashed" }}
              onClick={handleCreateClick}
            >
              <div style={{ fontWeight: 700, opacity: 0.6 }}>+ 新建角色</div>
            </div>
          )}
        </div>

        {showCreate && (
          <div style={{ marginTop: 16, padding: 16, border: "1px solid #555", borderRadius: 8 }}>
            <h3 style={{ margin: "0 0 8px" }}>
              {characters.length >= 3 ? "创建角色（需覆盖一个已有角色）" : "创建新角色"}
            </h3>
            <input
              placeholder="角色名称"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            {characters.length >= 3 && (
              <div style={{ marginBottom: 8 }}>
                <div className="hint" style={{ marginBottom: 4 }}>选择要覆盖的角色：</div>
                {characters.map((c) => (
                  <label key={c.characterId} style={{ display: "block", margin: "4px 0", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="overwrite"
                      checked={overwriteSlot === c.slotIndex}
                      onChange={() => setOverwriteSlot(c.slotIndex)}
                    />
                    {" "}{c.displayName} (Lv.{c.level})
                  </label>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCreate}>
                {characters.length >= 3 ? "覆盖创建" : "创建"}
              </button>
              <button onClick={() => { setShowCreate(false); setNewName(""); setOverwriteSlot(null); }}>
                取消
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button onClick={() => { useGameStore.getState().clearSession(); setView("login"); }}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
