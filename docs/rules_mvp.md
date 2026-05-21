# UNO MVP Rules (2-6 Players)

## Scope

This document freezes the initial online ruleset for `new-uno`.
Server-side rule engine must use this as the source of truth.

## Supported

- Player count: 2-6
- Deck: standard 108-card UNO deck
- Initial hand: 7 cards per player
- Turn order: clockwise by default
- Valid play:
  - Same color as top discard
  - Same value/symbol as top discard
  - Wild / Wild Draw Four (with declared color)
- Draw flow:
  - If player cannot play, draw 1 card
  - After draw, player may play the drawn card if legal, otherwise pass
- Action effects:
  - Skip: next player loses a turn
  - Reverse: direction changes
  - Draw Two: next player draws 2 and loses turn
  - Wild: current player declares next color
  - Wild Draw Four: current player declares next color, next player draws 4 and loses turn
- UNO call:
  - When a player has exactly 1 card left, they must call UNO
  - If they fail to call UNO before the next action window closes, penalty is draw 2
- Win condition:
  - First player with 0 cards wins the round

## Clarifications

- Reverse with 2 players behaves like Skip (same player plays again after reverse application).
- Starting discard cannot be Wild Draw Four.
- If draw pile is empty, reshuffle discard pile (except top card) into draw pile.

## Disabled House Rules (for MVP)

- No draw stacking (`+2` on `+2`, `+4` on `+4`)
- No jump-in
- No seven-zero swap/rotate rule
- No forced play option by server (client can choose after draw if rule allows)

## Configurable Rule Flags (future)

- `allowDrawStacking: false`
- `allowJumpIn: false`
- `allowSevenZero: false`
- `enableWildDrawFourChallenge: false` (MVP disabled, reserved for v1.1)
