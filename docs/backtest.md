# Prop analyzer projection: backtest

Date: 2026-11-18. Code: `projection.js` (the model), `backtest/engine.js` (the backtest). Data: ESPN regular-season game logs for all 578 players who appeared in 2025-26 (26,775 player-games) and 327 players in 2026-27 through Nov 17, 2026 (4,061 player-games).

## Method

- **Walk-forward, no look-ahead.** Every player-game was projected using only that player's earlier games with his current team and each opponent's points, rebounds and assists allowed in games before that date.
- **Teammates out** was approximated as a regular teammate (5+ games, 15+ minutes) who played for the team before and after the game but not in it. This stands in for the injury report.
- **Sample:** rotation players, meaning 20+ minutes on average over their last five games, with at least five earlier games. The same games are scored for every setting.
- **Lines:** each player-game-stat was scored at two lines, one just above and one just below his last-10 average (for example 18.5 and 17.5 for an 18.3 average). That way neither Over nor Under is favored by construction.
- **Scores** (lower is better unless noted):
  - **Brier score** of the Over chance; a coin flip scores 0.25.
  - **Log loss** of the Over chance.
  - **Average miss** of the projected stat.
  - **Likelihood of the actual result** under the projected distribution. This needs no line; higher is better.
- **Tuning:** settings were chosen on 2025-26 games before Jan 15, 2026, only. The rest of 2025-26 and all of 2026-27 so far were held out and used only to check the result.

## Results on held-out games

2025-26, Jan 15 to Apr 12 (49,529 line checks):

| Method | Brier | Log loss | Avg miss | Likelihood |
|---|---|---|---|---|
| **Tuned projection (live)** | **0.2329** | **0.657** | **2.93** | **−2.528** |
| Projection before tuning | 0.2356 | 0.664 | 2.96 | −2.544 |
| Old weighted hit rate | 0.2383 | 0.669 | n/a | n/a |
| Season average | n/a | n/a | 3.00 | −2.561 |
| Last-10 average | n/a | n/a | 3.01 | −2.557 |
| Coin flip | 0.2500 | 0.693 | n/a | n/a |

2026-27, Oct 20 to Nov 17 (9,781 line checks, never used for tuning):

| Method | Brier | Log loss | Avg miss | Likelihood |
|---|---|---|---|---|
| **Tuned projection (live)** | **0.2386** | **0.670** | **2.950** | **−2.570** |
| Projection before tuning | 0.2398 | 0.672 | 2.963 | −2.587 |
| Old weighted hit rate | 0.2444 | 0.682 | n/a | n/a |
| Season average | n/a | n/a | 2.951 | −2.574 |
| Last-10 average | n/a | n/a | 2.955 | −2.575 |

By stat, 2025-26 held-out Brier (tuned vs old weighted hit rate):

| Stat | Tuned | Old |
|---|---|---|
| Points | 0.2434 | 0.2473 |
| Rebounds | 0.2294 | 0.2356 |
| Assists | 0.2256 | 0.2319 |

**Calibration** on the 2025-26 held-out half: when the projection said 40–50%, the Over hit 47.5%. When it said 70–80%, the Over hit 75.1%.

## What each adjustment did

| Adjustment | Effect | Decision |
|---|---|---|
| Opponent defense (allowed per game vs league, shrunk by games played, capped ±12%) | Helped on both held-out sets (2026-27 Brier 0.2386 with it, 0.2388 without) | **On** |
| Teammates out, blended with games without them | Hurt at every strength tried (held-out 2025-26 Brier 0.2356 on, 0.2337 off) | **Off.** Shown as a note instead |
| Teammates out, ratio version applied only beyond what recent games show | Also hurt (first-half Brier 0.2355 vs 0.2350 off) | **Off** |
| Home or away | Hurt slightly (0.2356 on, 0.2350 off) | **Off** |
| Per-minute rate memory: 10 vs 20 vs 40 games | 20 best on the tuning half | **20** |
| Minutes memory: 3 vs 5 vs 8 games | 3 best | **3** |
| Minimum spread (variance ÷ mean): 1.05 / 1.15 / 1.25 / 1.4 | 1.25 best balance of Brier and likelihood | **1.25** |
| Uniform upward correction of 1.5–6% | Worse at every size on the tuning half | **Not used** |

## Limits

- **These are not betting results.** Lines were set near each player's recent average, not taken from sportsbooks. Real prices also account for injuries, matchups and money flow, so beating these lines is much easier than beating a book. No historical sportsbook prop prices were available for this test.
- **The teammates-out test uses hindsight.** A teammate counts as out if he didn't play, which also captures rest days and in-game injuries. A version built on actual injury reports might behave differently.
- **Small gains on the stat itself.** The improvement in average miss over simple averages is small, about 2% in 2025-26 and less in early 2026-27. Most of the gain is in how well the chances are calibrated.
- **Players who don't play are left out**, matching the analyzer's "if the player appears."

## Re-running

The backtest runs on a preview deployment of the `claude/backtest` branch at `/api/backtest` (`mode=evaluate` or `mode=grid`, `season=2026`, `cutoff=2026-01-15`, `settings={...}`). ESPN is not reachable from every environment, which is why it runs there.
