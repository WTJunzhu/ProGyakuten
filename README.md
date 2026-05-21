# new-uno

Online-capable UNO prototype based on the previous `uno-master` ruleset.

## What is implemented

- Monorepo workspace:
  - `apps/client`: minimal Web client (Vite + TypeScript)
  - `apps/server`: WebSocket authoritative game server
  - `packages/core`: shared UNO rule engine (TypeScript)
  - `packages/protocol`: shared network message contracts
- Frozen MVP rule document at `docs/rules_mvp.md`
- Core rule tests (Vitest)
- Real-time room flow for 2-6 players:
  - create/join room
  - start game
  - play/draw/pass/call UNO
- Stability baseline:
  - `seq` monotonic checks
  - `turnId` checks
  - turn timeout auto draw+pass
  - reconnect grace window + snapshot recovery

## Quick start

```bash
npm install
npm run build
npm run -w @new-uno/core test
```

### Run server

```bash
npm run dev:server
```

### Run client

```bash
npm run dev:client
```

Open the client in browser and observe server events in the page log.
