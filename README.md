# NBA Edge — public NBA player-prop research site (v1)

A responsive research website for NBA prop analysis, Pick6 draft entries, transparent prediction tracking, Kalshi market lookup, read-only Kalshi live-game data, and optional sportsbook odds comparison. **No bets or trades are submitted.** No API credentials are included in the project.

## What's included

- Dashboard: archived November 13, 2026 NBA matchups and research picks, clearly labeled historical.
- Analyzer: thirteen user-researched NBA props, recent *observed* hit counts, matchup caveats, plus a custom stat checker where you enter actual game totals.
- Pick6 builder: 2–6 player selections, MORE/LESS, manually entered posted projections, same-player/game warnings, and optional break-even payout arithmetic.
- Prediction tracker: per-pick logs, pending/hit/miss/push/void status, CSV export, and separate drafts. Never equates a saved draft with a wager.
- Kalshi scanner: public NBA point, rebound and assist contracts by event date and public bid/ask snapshots, via `/api/kalshi`.
- Live game data: Kalshi event ticker → milestone ID → `/live_data/milestone/{id}?include_player_stats=true`, via `/api/live`. Player stats are only included where Kalshi has a supported player mapping. The older `/live_data/{type}/milestone/{id}` endpoint is deliberately **not** used.
- Optional sportsbook scanner: server-side The Odds API proxy, available only to signed-in users, via `/api/odds`.
- Public accounts: Supabase email/password sign-up/sign-in and private per-user `predictions` and `entries` tables with Row-Level Security. Demo mode stores records only in the current browser.

**Important:** Archived game logs and chosen research thresholds are NOT real-time DraftKings Pick6 board lines or calibrated success probabilities. Live NBA game feeds and player stat feeds are only enabled where those APIs actually supply data. The site doesn't auto-grade forecasts against official box scores in v1.

## Deploy for friends (Vercel + Supabase)

1. Put the project in your GitHub repository. **A private repository is preferable while configuring the first release**, although public source code is fine if all secrets remain server-side and the files are reviewed before each push. Your current `Tirthbarochia/Nba-Edge` repository is public.
2. Create a Supabase project at https://supabase.com. In its SQL editor run `supabase/schema.sql` once. In Authentication, enable email/password sign-ups and email verification. Configure the hosted site as the Site URL, with any necessary redirect URLs.
3. Edit **`config.js`** with only your Supabase project URL and **publishable** key. This file ships to every visitor; do **not** put any confidential keys in it.
4. Connect the GitHub repository to Vercel at https://vercel.com and select `Other` or `No Framework` if prompted. Set the source root to the repository root. Vercel serves static files and its Node serverless functions from `api/`.
5. In Vercel Settings → Environment Variables, add:

   - `SUPABASE_URL` — same Supabase URL as above.
   - `SUPABASE_PUBLISHABLE_KEY` — same Supabase publishable key as above, used only to validate logged-in sessions server-side. (It is safe for the client.)
   - `ODDS_API_KEY` — **a new rotated** The Odds API key; this is secret and must remain server-side. If absent, the sportsbook scanner displays a configuration error, but other site features continue working.

6. Deploy. Verify email sign-up, sign-in, your private prediction history, and that two accounts cannot read each other's data. Verify Kalshi market lookups, live milestone lookup and odds API proxy separately. Configure a custom domain if desired.

You do not need a Kalshi API key for public market or live-game lookups. You do **not** need a BALLDONTLIE key for v1 because that integration isn't yet implemented. For enhanced player stats and automatic historical calculations, BALLDONTLIE or an equivalent licensed feed can be added later.

### Run locally

For the static user interface without live serverless APIs:

```bash
cd nba-edge-v1
python -m http.server 8000
```

Visit `http://localhost:8000/`. Public sign-in requires Supabase configuration and the sportsbook/Kalshi server APIs require a platform that runs `api/*.js` endpoints (Vercel is the intended target). Do not open `index.html` directly as a file; browsers generally block ES module imports across local `file://` URLs.

For serverless preview you can use Vercel's local development CLI after logging into your Vercel account:

```bash
npx vercel dev
```

API keys should go into local `.env` files (not source control). `npm run check` performs syntax checks and `npm test` executes mock API tests without real credentials or an Internet connection.

## Saved sportsbook snapshot and insight history

Visitors never call The Odds API directly. `snapshot.js` buys one full-slate copy of today's player-prop lines on a budget, saves it in Supabase (`supabase/odds_store.sql`), and `/api/lines` and `/api/insights` read that saved copy.

- Default budget: **one refresh per Eastern day**, not before 11 AM ET, triggered by the daily cron or the first visit after that hour. A refresh costs up to 3 credits per upcoming game (points, rebounds, assists; one region). The provider's reported remaining credits are recorded, and a refresh is skipped when they cannot cover it.
- Change the budget with `ODDS_REFRESHES_PER_DAY`, `ODDS_REFRESH_MINUTES` and `ODDS_FIRST_REFRESH_HOUR_ET`. The signed-in Odds scanner has its own `ODDS_SCANNER_DAILY_CREDITS` allowance (default 10).
- Every suggested insight is stored in `insight_picks` and stays listed for the rest of the day. A later refresh can add suggestions or mark an earlier one as no longer passing the filters; it never deletes one. `first_pick` keeps the suggestion exactly as first published.
- The three tables are server-only. Server functions authenticate with `NBA_EDGE_SERVER_TOKEN`; the database stores only its SHA-256 hash. Without that variable the public routes return "unavailable" and spend nothing.

Setup: run `supabase/odds_store.sql`, store the token hash as described at the end of that file, then add `NBA_EDGE_SERVER_TOKEN` to the Vercel project.

## Integrations

| Source | Auth | What it provides | How integrated |
|---|---|---|---|
| Kalshi public API | None | Player-related market prices and event/milestone live data | `api/kalshi.js`, `api/live.js` |
| The Odds API | Private API key | Licensed sportsbook event/prop odds, not official Pick6 lines | `api/odds.js` |
| Supabase | Publishable client key and private policies | User registration, login, per-user predictions and drafts | `config.js`, `supabase/schema.sql`, `app.js` |
| DraftKings Pick6 | No verified public feed | Actual projections | Manually enter the exact displayed lines in v1 |

## Privacy, accuracy and publication checklist

- A key sent in chat should be **rotated before production deployment**. Never publish an API key, Supabase `service_role` key, or token in this repository. Don't use The Odds API directly from the browser.
- Supabase Row-Level Security is enabled on both tables. No public read policy exists. Use separate test users to confirm isolation.
- Add appropriate privacy, terms and any legally required notices before advertising widely. Confirm NBA statistical data and bookmaker/market data licenses permit public redistribution.
- Apply persistent rate limiting and server-side caching before scaling traffic or exposing expensive odds endpoints broadly.
- All market prices are snapshots, may exclude platform fees, and require independent verification. No real-money betting is conducted by this site.
- No profitable edge has been demonstrated by this demo. A 9/10 historical hit count is not a 90% calibrated prediction. Do not present research/watchlist examples as current bets.
- Future updates: reliable licensed injury + game-log feed; audited walk-forward backtesting and calibration; line movement history; verified ticket settlement; account email verification testing; moderation and abuse controls.

**Kalshi references:** https://docs.kalshi.com ; https://external-api.kalshi.com/trade-api/v2/exchange/status