import type { CreateGameRulesOptions, GameRuleConfig, GameRules } from "./types.js";

export const defaultRuleConfig: GameRuleConfig = {
  allowSnatch: true,
  allowPostDrawWindow: true,
  enforceUnoPenalty: true,
  initialHandsNumbersOnly: true,
  allowWildStartCard: false,
  maxHandSize: 50,
  phaseDurations: {
    turnMainMs: 30_000,
    snatchWindowMs: 5_000,
    postDrawWindowMs: 5_000
  }
};

export function createGameRules(options: CreateGameRulesOptions = {}): GameRules {
  return {
    config: {
      ...defaultRuleConfig,
      ...options.config,
      phaseDurations: {
        ...defaultRuleConfig.phaseDurations,
        ...options.config?.phaseDurations
      }
    },
    hooks: [...(options.hooks ?? [])]
  };
}

export function withRuleOverrides(baseRules: GameRules, options: CreateGameRulesOptions = {}): GameRules {
  return {
    config: {
      ...baseRules.config,
      ...options.config,
      phaseDurations: {
        ...baseRules.config.phaseDurations,
        ...options.config?.phaseDurations
      }
    },
    hooks: [...baseRules.hooks, ...(options.hooks ?? [])]
  };
}
