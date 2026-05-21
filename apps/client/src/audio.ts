import type { Card, GamePublicState } from "@pro-gyakuten/protocol";

type BgmGroupName =
  | "login_lobby"
  | "room_waiting"
  | "game_base"
  | "game_advantage"
  | "game_disadvantage"
  | "result_win"
  | "result_lose";

type BgmTrackName =
  | "login_lobby_main"
  | "room_waiting_main"
  | "game_base_main"
  | "game_advantage_1"
  | "game_advantage_2"
  | "game_advantage_3"
  | "game_advantage_4"
  | "game_advantage_5"
  | "game_disadvantage_1"
  | "game_disadvantage_2"
  | "game_disadvantage_3"
  | "game_disadvantage_4"
  | "game_disadvantage_5"
  | "result_win_main"
  | "result_lose_main";

type SfxName = "reverse" | "draw_stack" | "skip";
type Mood = "advantage" | "disadvantage";
type NonGameView = "login" | "lobby" | "room";

interface BgmTrackConfig {
  name: BgmTrackName;
  src: string;
  loopStart: number;
  loopEnd: number | null;
  baseVolume: number;
}

interface SfxConfig {
  name: SfxName;
  src: string;
  baseVolume: number;
}

const AUDIO_MUTE_STORAGE_KEY = "new_uno_audio_muted";
const AUDIO_VOLUME_STORAGE_KEY = "new_uno_audio_volume";

// Resource registry: keep all BGM definitions in one place so later features
// only need to reference a stable track/group name instead of raw file paths.
const BGM_LIBRARY: Record<BgmTrackName, BgmTrackConfig> = {
  login_lobby_main: {
    name: "login_lobby_main",
    src: "/audio/bgm/login_lobby.mp3",
    loopStart: 0,
    loopEnd: 63.3,
    baseVolume: 0.7
  },
  room_waiting_main: {
    name: "room_waiting_main",
    src: "/audio/bgm/room_waiting.mp3",
    loopStart: 0,
    loopEnd: 50,
    baseVolume: 0.7
  },
  game_base_main: {
    name: "game_base_main",
    src: "/audio/bgm/game_base.mp3",
    loopStart: 0,
    loopEnd: 53.1,
    baseVolume: 0.7
  },
  game_advantage_1: {
    name: "game_advantage_1",
    src: "/audio/bgm/game_advantage_1.mp3",
    loopStart: 0,
    loopEnd: 57.7,
    baseVolume: 0.7
  },
  game_advantage_2: {
    name: "game_advantage_2",
    src: "/audio/bgm/game_advantage_2.mp3",
    loopStart: 0,
    loopEnd: 73.5,
    baseVolume: 0.7
  },
  game_advantage_3: {
    name: "game_advantage_3",
    src: "/audio/bgm/game_advantage_3.mp3",
    loopStart: 0,
    loopEnd: 55,
    baseVolume: 0.7
  },
  game_advantage_4: {
    name: "game_advantage_4",
    src: "/audio/bgm/game_advantage_4.mp3",
    loopStart: 0,
    loopEnd: 86,
    baseVolume: 0.7
  },
  game_advantage_5: {
    name: "game_advantage_5",
    src: "/audio/bgm/game_advantage_5.mp3",
    loopStart: 0,
    loopEnd: 87.8,
    baseVolume: 0.7
  },
  game_disadvantage_1: {
    name: "game_disadvantage_1",
    src: "/audio/bgm/game_disadvantage_1.mp3",
    loopStart: 0,
    loopEnd: 70.3,
    baseVolume: 0.7
  },
  game_disadvantage_2: {
    name: "game_disadvantage_2",
    src: "/audio/bgm/game_disadvantage_2.mp3",
    loopStart: 0,
    loopEnd: 61,
    baseVolume: 0.7
  },
  game_disadvantage_3: {
    name: "game_disadvantage_3",
    src: "/audio/bgm/game_disadvantage_3.mp3",
    loopStart: 0,
    loopEnd: 64,
    baseVolume: 0.7
  },
  game_disadvantage_4: {
    name: "game_disadvantage_4",
    src: "/audio/bgm/game_disadvantage_4.mp3",
    loopStart: 0,
    loopEnd: 43.8,
    baseVolume: 0.7
  },
  game_disadvantage_5: {
    name: "game_disadvantage_5",
    src: "/audio/bgm/game_disadvantage_5.mp3",
    loopStart: 0,
    loopEnd: 86,
    baseVolume: 0.7
  },
  result_win_main: {
    name: "result_win_main",
    src: "/audio/bgm/result_win.mp3",
    loopStart: 0,
    loopEnd: 67.3,
    baseVolume: 0.7
  },
  result_lose_main: {
    name: "result_lose_main",
    src: "/audio/bgm/result_lose.mp3",
    loopStart: 0,
    loopEnd: 93.5,
    baseVolume: 0.7
  }
};

const BGM_GROUPS: Record<BgmGroupName, BgmTrackName[]> = {
  login_lobby: ["login_lobby_main"],
  room_waiting: ["room_waiting_main"],
  game_base: ["game_base_main"],
  game_advantage: [
    "game_advantage_1",
    "game_advantage_2",
    "game_advantage_3",
    "game_advantage_4",
    "game_advantage_5"
  ],
  game_disadvantage: [
    "game_disadvantage_1",
    "game_disadvantage_2",
    "game_disadvantage_3",
    "game_disadvantage_4",
    "game_disadvantage_5"
  ],
  result_win: ["result_win_main"],
  result_lose: ["result_lose_main"]
};

const SFX_LIBRARY: Record<SfxName, SfxConfig> = {
  reverse: {
    name: "reverse",
    src: "/audio/sfx/reverse_igiari.mp3",
    baseVolume: 0.78
  },
  draw_stack: {
    name: "draw_stack",
    src: "/audio/sfx/draw_stack_kurae.mp3",
    baseVolume: 0.78
  },
  skip: {
    name: "skip",
    src: "/audio/sfx/skip_matta.mp3",
    baseVolume: 0.78
  }
};

class AudioController {
  private readonly bgm = new Audio();

  private unlocked = false;
  private muted = this.readMuted();
  private volume = this.readVolume();
  private currentBgmName: BgmTrackName | null = null;
  private currentBgmGroup: BgmGroupName | null = null;
  private currentTrack: BgmTrackConfig | null = null;
  private gameEscalated = false;
  private currentMood: Mood | null = null;

  constructor() {
    this.bgm.loop = false;
    this.bgm.preload = "auto";
    this.bgm.muted = this.muted;
    this.applyCurrentBgmVolume();
    this.bgm.addEventListener("timeupdate", () => this.handleLoopRegion());
    this.bgm.addEventListener("ended", () => this.handleTrackEnded());
  }

  init(): void {
    const unlock = () => {
      this.unlock();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
  }

  getToggleLabel(): string {
    return "音频";
  }

  getVolumePercent(): number {
    return Math.round(this.volume * 100);
  }

  setVolumePercent(percent: number): void {
    const nextVolume = Math.min(100, Math.max(0, percent)) / 100;
    this.volume = nextVolume;
    this.muted = nextVolume <= 0;
    localStorage.setItem(AUDIO_VOLUME_STORAGE_KEY, String(nextVolume));
    localStorage.setItem(AUDIO_MUTE_STORAGE_KEY, this.muted ? "1" : "0");
    this.bgm.muted = this.muted;
    this.applyCurrentBgmVolume();
    if (this.muted || this.volume <= 0) {
      this.bgm.pause();
    } else {
      void this.tryPlayBgm();
    }
  }

  syncViewBgm(view: NonGameView): void {
    this.resetGameProgression();
    if (view === "room") {
      this.playBgmGroup("room_waiting");
      return;
    }
    this.playBgmGroup("login_lobby");
  }

  startGame(): void {
    this.resetGameProgression();
    this.playBgmGroup("game_base");
  }

  syncGameFlow(state: GamePublicState, playerId: string | null): void {
    if (!playerId || state.winnerTeam) return;

    const myTeam = state.teams.teamA.includes(playerId) ? "teamA" : "teamB";
    const myPlayers = myTeam === "teamA" ? state.teams.teamA : state.teams.teamB;
    const enemyPlayers = myTeam === "teamA" ? state.teams.teamB : state.teams.teamA;
    const hasMyOneCard = state.players.some((player) => myPlayers.includes(player.playerId) && player.handCount === 1);
    const hasEnemyOneCard = state.players.some(
      (player) => enemyPlayers.includes(player.playerId) && player.handCount === 1
    );

    let nextMood: Mood | null = null;
    if (hasMyOneCard && !hasEnemyOneCard) nextMood = "advantage";
    if (hasEnemyOneCard && !hasMyOneCard) nextMood = "disadvantage";

    if (!this.gameEscalated) {
      if (nextMood) {
        this.gameEscalated = true;
        this.currentMood = nextMood;
        this.playBgmGroup(nextMood === "advantage" ? "game_advantage" : "game_disadvantage", true);
      } else {
        this.playBgmGroup("game_base");
      }
      return;
    }

    if (nextMood && nextMood !== this.currentMood) {
      this.currentMood = nextMood;
      this.playBgmGroup(nextMood === "advantage" ? "game_advantage" : "game_disadvantage", true);
    }
  }

  playResult(won: boolean): void {
    this.playBgmGroup(won ? "result_win" : "result_lose", true);
  }

  playCardSfx(kind: Card["kind"]): void {
    let sfxName: SfxName | null = null;
    if (kind === "reverse") sfxName = "reverse";
    if (kind === "draw_two" || kind === "wild_draw_four") sfxName = "draw_stack";
    if (kind === "skip") sfxName = "skip";
    if (!sfxName) return;
    this.playSfxByName(sfxName);
  }

  private playBgmGroup(group: BgmGroupName, avoidCurrent = false): void {
    const name = this.pickTrackNameFromGroup(group, avoidCurrent ? this.currentBgmName : null);
    if (!name) return;
    this.playBgmByName(name, group);
  }

  private playBgmByName(name: BgmTrackName, group: BgmGroupName | null): void {
    const track = BGM_LIBRARY[name];
    if (!track) return;
    if (this.currentBgmName === name && !this.bgm.paused) return;
    this.currentBgmName = name;
    this.currentBgmGroup = group;
    this.currentTrack = track;
    this.bgm.src = track.src;
    // First play preserves the intro. Subsequent loop-backs jump to loopStart.
    this.bgm.currentTime = 0;
    this.applyCurrentBgmVolume();
    void this.tryPlayBgm();
  }

  private playSfxByName(name: SfxName): void {
    const sfx = SFX_LIBRARY[name];
    if (!sfx || this.muted || this.volume <= 0) return;
    const audio = new Audio(sfx.src);
    audio.volume = sfx.baseVolume * this.volume;
    audio.muted = this.muted;
    void audio.play().catch(() => undefined);
  }

  private pickTrackNameFromGroup(group: BgmGroupName, avoid: BgmTrackName | null): BgmTrackName | null {
    const names = BGM_GROUPS[group] ?? [];
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    const filtered = avoid ? names.filter((name) => name !== avoid) : names;
    const source = filtered.length > 0 ? filtered : names;
    return source[Math.floor(Math.random() * source.length)];
  }

  private handleLoopRegion(): void {
    if (!this.currentTrack) return;
    const { loopEnd, loopStart } = this.currentTrack;
    if (loopEnd === null) return;
    if (this.bgm.currentTime >= loopEnd) {
      this.bgm.currentTime = Math.max(0, loopStart);
      void this.tryPlayBgm();
    }
  }

  private handleTrackEnded(): void {
    if (!this.currentTrack) return;
    this.bgm.currentTime = Math.max(0, this.currentTrack.loopStart);
    void this.tryPlayBgm();
  }

  private unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    void this.tryPlayBgm();
  }

  private applyCurrentBgmVolume(): void {
    const baseVolume = this.currentTrack?.baseVolume ?? 0.7;
    this.bgm.volume = baseVolume * this.volume;
  }

  private readMuted(): boolean {
    try {
      return localStorage.getItem(AUDIO_MUTE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  private readVolume(): number {
    try {
      const raw = localStorage.getItem(AUDIO_VOLUME_STORAGE_KEY);
      if (!raw) return 1;
      const value = Number(raw);
      if (!Number.isFinite(value)) return 1;
      return Math.min(1, Math.max(0, value));
    } catch {
      return 1;
    }
  }

  private resetGameProgression(): void {
    this.gameEscalated = false;
    this.currentMood = null;
  }

  private async tryPlayBgm(): Promise<void> {
    if (!this.unlocked || this.muted || this.volume <= 0 || !this.currentTrack?.src) return;
    try {
      await this.bgm.play();
    } catch {
      return;
    }
  }
}

const audioController = new AudioController();

export function initAudioSystem(): void {
  audioController.init();
}

export function getAudioToggleLabel(): string {
  return audioController.getToggleLabel();
}

export function getAudioVolumePercent(): number {
  return audioController.getVolumePercent();
}

export function setAudioVolumePercent(percent: number): void {
  audioController.setVolumePercent(percent);
}

export function syncViewBgm(view: NonGameView): void {
  audioController.syncViewBgm(view);
}

export function startGameBgmCycle(): void {
  audioController.startGame();
}

export function syncGameBgm(state: GamePublicState, playerId: string | null): void {
  audioController.syncGameFlow(state, playerId);
}

export function playResultBgm(won: boolean): void {
  audioController.playResult(won);
}

export function playCardSfx(kind: Card["kind"]): void {
  audioController.playCardSfx(kind);
}
