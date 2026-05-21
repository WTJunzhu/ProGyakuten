# Netcode Notes

## Authority Model

- Server owns canonical game state.
- Client sends action intent only.
- Server validates action and broadcasts state patch.

## Consistency Guards

- `turnId`: prevents stale-turn actions.
- `seq`: prevents replay and out-of-order actions from same player.

## Reconnect

- Disconnect keeps player seat for a grace period.
- Reconnect event restores connection and sends room snapshot + private hand.

## Timeout Automation

- Each turn schedules timeout watcher.
- If no action before deadline, server auto-executes draw and pass.

## Current Limitations

- In-memory room store only.
- No authentication yet.
- No challenge flow for Wild Draw Four yet.
