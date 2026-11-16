# Session handoff
Date/time and timezone: 2026-11-15, late evening America/New_York
Assistant / task owner: Claude
Task and agreed scope: (1) stop visitor traffic from spending The Odds API credits by serving a saved copy from Supabase; (2) keep suggested insights listed all day instead of replacing them on each update.
Base commit: df76d4a893bbe71dbd62c084111712f84c7a81cd
Branch and final commit: claude/saved-lines-persistent-insights (see branch head)
Changed files: api/insights.js, api/lines.js, api/odds.js, market-feed.js, player-feed.js, insights.js, lines-board.js, vercel.json, package.json, .env.example, README.md; new store.js, snapshot.js, insight-engine.js, supabase/odds_store.sql, tests/store.test.mjs.
User-visible behavior: Today's Lines and Today's Insights show the copy saved at about 11 AM ET with its save time. Insights stay listed all day, labelled Current, Earlier (a later update no longer supported it) or Started. Before 11 AM ET, or when the allowance cannot cover a refresh, the pages say so instead of showing an error.
Model/data assumptions and changes: Insight rules (candidates, screen, ranking, max eight per run, one per player per run) are unchanged and moved to insight-engine.js. Quote freshness (one hour) is now measured against the snapshot time, not the visit time. Default budget is one refresh per Eastern day because the provider plan is unknown; a refresh costs up to 3 credits per upcoming game.
Checks run and results: npm test 12/12 (8 new, all network mocked); npm run check now covers every JS file and passes; supabase/odds_store.sql executed twice on a local Postgres 16 with anon/authenticated roles (server-only access confirmed: no header or wrong header sees and writes nothing, correct header can select/insert/update, delete denied); Insights tab and lines board rendered in headless Chrome at phone width with sample data.
Checks not run / limitations: Not run against the real Supabase REST API, The Odds API or ESPN. Production is Postgres 17; local test was 16. Not yet deployed. If a refresh is claimed and the function is killed before finishing, that day's refresh stays counted.
Configuration or migration needed (names only; no secrets): run supabase/odds_store.sql; insert token hash into private.server_token; add NBA_EDGE_SERVER_TOKEN in Vercel (production). Optional: ODDS_REFRESHES_PER_DAY, ODDS_REFRESH_MINUTES, ODDS_FIRST_REFRESH_HOUR_ET, ODDS_SCANNER_DAILY_CREDITS.
Decisions: Fail closed when the store is not configured. Suggestions are never deleted by the site. Saved snapshots are kept as pregame history.
Outstanding issues: Confirm the Odds API plan and raise ODDS_REFRESHES_PER_DAY if it allows. No pruning of old snapshot rows yet. Analyzer estimate tests (P0) still open. Supabase leaked-password protection is off.
Next concrete action: with the owner's approval, apply the migration, set the token, merge to main, then verify /api/lines and /api/insights on production after 11 AM ET.
