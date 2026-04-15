# Design Commits — Project Context

## What this is
A Figma plugin + web dashboard that tracks a designer's daily activity (like GitHub contribution graphs). It records every document change in Figma and visualises it as a heatmap, streak, score, leaderboard, and activity log.

## Live URLs
- **Dashboard:** https://sanchit-bajaj.github.io/Design-Commits/dashboard.html#demo
- **Embed widget:** https://sanchit-bajaj.github.io/Design-Commits/embed.html#demo@designcommits.app
- **GitHub repo:** https://github.com/Sanchit-Bajaj/Design-Commits

## Files
| File | Purpose |
|------|---------|
| `code.js` | Figma plugin backend (runs in Figma sandbox, uses `figma.clientStorage`) |
| `ui.html` | Figma plugin UI (webview, uses `localStorage`) |
| `dashboard.html` | Full web dashboard |
| `embed.html` | Embeddable heatmap widget (iframe) |
| `manifest.json` | Figma plugin config |

## Architecture

### Data flow
1. User makes changes in Figma → `code.js` records them via `figma.on("documentchange")`
2. Every 2 seconds, `code.js` persists to `figma.clientStorage` and sends to `ui.html` via postMessage
3. `ui.html` writes to its own `localStorage` under key `dc_v1_[email]`
4. User clicks "Open full dashboard →" → `ui.html` encodes localStorage data as base64 into URL hash
5. Dashboard opens at `dashboard.html#import:BASE64` → decodes + saves to its own localStorage → loads

### localStorage structure
```
dc_v1_[email] = {
  "YYYY-MM-DD": {
    "[figmaUserId]": {
      name: string,
      changes: { created, deleted, edited },
      files: [{ name, key }],
      ts: timestamp
    }
  }
}
dc_sync_ts_[email] = timestamp  // last sync time
```

### Key functions
- `aggregateStore(email)` — sums all Figma accounts per day → heatmap, fileMap, accountMap
- `renderHeatmap(heatmap, weeks)` — day-by-day month grouping (fixes calendar bug), defaults to 26 weeks
- `renderLeaderboard(heatmap, email)` — tier-based leaderboard with mock peers
- `renderActivityLog(heatmap, fileMap, accountMap)` — collapsible monthly sections
- `calcStreak(heatmap)` — consecutive active days from today backwards
- `openWebDashboard()` in ui.html — encodes plugin data into URL for cross-origin handoff

## Features built
- **Heatmap** — month-grouped, day-by-day cells, outline for empty months, subtle fill for future days, range dropdown (3/6/12 months, default 6)
- **Score banner** — today's changes (added/removed), across-accounts breakdown
- **Stats** — streak, days active, all-time changes, best day
- **Leaderboard** — tier system (Top Tier / Active / Growing), opt-out toggle, mock peers
- **Activity log** — collapsible month sections below leaderboard
- **Embed widget** — standalone `embed.html` for iframe embedding
- **Public view** — `#public:email` hash, hides sensitive data
- **Sync bar** — shows last synced time, refresh button, yellow warning if never synced
- **Plugin→dashboard bridge** — base64 URL encoding for cross-origin data handoff

## Deployment
GitHub Pages — push to `main` branch auto-deploys.

```bash
git remote set-url origin https://Sanchit-Bajaj:[TOKEN]@github.com/Sanchit-Bajaj/Design-Commits.git
git push
```

## Known issues / next ideas
- Data only syncs when user clicks "Open full dashboard →" from plugin (no auto-sync without a backend)
- Leaderboard uses mock peer data — needs real multi-user backend to be meaningful
- Consider Supabase backend for real-time sync across devices
