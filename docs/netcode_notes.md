# Netcode Notes

## Authority Model

- Server owns canonical game state.
- Client sends action intent only.
- Server validates action and broadcasts state patch.

## Consistency Guards

- `turnId`: prevents stale-turn actions.
- `seq`: prevents replay and out-of-order actions from same player.

## Reconnect

- Disconnect keeps player seat for a 20-second grace period.
- Reconnect event restores connection and sends room snapshot + private hand.
- Server restart restores rooms and game state from SQLite.

## Timeout Automation

- Each turn schedules timeout watcher.
- If no action before deadline, server auto-executes draw and pass.

## Authentication

- Account registration with scrypt password hashing.
- Token-based session management (24-hour expiry).
- Character-based player identity (display name shown in game).

## Persistence

- SQLite database (better-sqlite3) for room state, game snapshots, player sessions, accounts, and characters.
- Rooms and games survive server restarts.

## Current Limitations

- No HTTPS/WSS (requires reverse proxy or platform SSL).
- No challenge flow for Wild Draw Four yet.
