import { useState, useCallback } from "react";
import { getAudioVolumePercent, setAudioVolumePercent } from "../audio";

interface Props {
  visible: boolean;
}

export function AudioPanel({ visible }: Props) {
  const [volume, setVolume] = useState(getAudioVolumePercent());

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    setAudioVolumePercent(val);
  }, []);

  if (!visible) return null;

  return (
    <div className="audio-panel panel">
      <div style={{ fontWeight: 700, marginBottom: 8 }}>音量调节</div>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={handleChange}
        style={{ width: "100%", margin: 0, padding: 0 }}
      />
      <div style={{ textAlign: "center", fontSize: 13, marginTop: 4 }}>{volume}%</div>
    </div>
  );
}
