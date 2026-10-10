# Balance notes

Balance is data-driven (`src/sim/data/*.ts`) and verified with automated AI-vs-AI matches
(`BALANCE=1 npx vitest run tests/sim/balance.test.ts`, results in `/tmp/balance.log`).

## Method
* Red Mesa (point-symmetric terrain), 1v1, Hard AI, "balanced" personality, random generals, 14 minutes, 4 seeds × every ordered faction pair (24 games).
* A game that is still undecided after 14 minutes is scored by remaining army + structure value (±15 % = win, otherwise draw = ½ point each).

## Latest result (v1.0)

| Faction | Score | 
|---|---|
| United States | 7.5 / 16 (47 %) |
| China | 8.0 / 16 (50 %) |
| Iran | 8.5 / 16 (53 %) |

## What was tuned (and why)
* **Maps made symmetric** — raw terrain is n-fold rotationally symmetrised so every spawn is equivalent (a 4/4 spawn bias was found and removed).
* **AI economy** — supply piles were exhausted at ~5 min and AIs starved: piles are now 20–30k and the AI saves money for the unit it wants instead of spamming whatever is cheapest.
* **United States** — gets the *Battle Network* bonus (+18 % damage, +10 % rate of fire near a Network Node / Command Center / recon unit), cheaper Abrams / Stryker / Bradley / F-35.
* **China** — swarm bonus reduced (+8 % damage / −10 % damage taken), batch discount 10 %, militia batches of 2, higher cost for ZTZ-96B / ZTZ-99A / Type 15 / PLZ-05 / Wing Loong, weaker artillery damage.
* **Iran** — gained the Misagh MANPADS team (the roster had almost no anti-air), tougher T-72S / Zulfiqar, cheaper Fateh TEL, slightly stronger economy.

Draws are common because the AI is cautious with its waves; humans will break the stalemates faster.
