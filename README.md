# FairGame Studio — Tabletop Game Architect & Monte Carlo Balance Simulator

**FairGame Studio** is an interactive web application for tabletop game designers to recreate self-made board and card games—complete with custom board topologies, pieces, player/global stats, card decks, turn phases, and event-driven rules—and run **thousands of automated Monte Carlo simulations** to uncover game-breaking holes, infinite loops, dead cards, stalemates, and turn-order biases.

---

## What Is Working So Far

### 1. Interactive Board Creator (`src/components/BoardCreatorTab.tsx` & `src/components/BoardVisualizer.tsx`)
- **4 Board Topologies**:
  - **Square Grid** (`square_grid`): Configurable rows $\times$ columns (up to $12 \times 12$) with orthogonal, diagonal, omni, or knight movement.
  - **Hexagonal Grid** (`hex_grid`): Offset hex coordinates with 6-neighbor axial adjacency.
  - **Linear / Looping Track** (`linear_track`): Winding race/economy track with optional looping from the final space back to space `#0`.
  - **Node / Graph Territory Map** (`node_graph`): Point-to-point interconnected territory nodes with custom directed or bidirectional edges.
- **8 Paintable Space / Tile Types**:
  - `normal` (Standard Space)
  - `spawn_p1`, `spawn_p2`, `spawn_p3`, `spawn_p4` (Player Starting Spawns)
  - `goal` (Victory / Objective Space)
  - `hazard` (Trap / Hazard Space — applies configurable HP damage on land)
  - `boost` (Shrine / Boost Space — grants configurable stat bonus on land)
  - `shop` (Market / Resource Space)
  - `obstacle` (Impassable Wall)
  - `checkpoint` (Progression Waypoint)
- **Tile Inspector & Custom Graph Edge Editor**:
  - Click any space to edit its label, movement AP cost, numeric effect value, target stat, and custom node-to-node connections.
- **Blueprint Image Overlay**:
  - Upload a custom `.png`, `.jpg`, or `.svg` gameboard artwork file to render directly underneath the interactive simulation grid/nodes.
- **ASCII / Text Matrix Importer**:
  - Paste a text grid (`.` = normal, `1`/`2` = spawns, `G` = goal, `#` = obstacle, `X` = hazard, `+` = boost, `$` = shop) to generate a complete playable board in one click.

---

### 2. Pieces & Stats Configurator (`src/components/PiecesAndStatsTab.tsx`)
- **Player Stat Definitions**:
  - Create and edit any number of per-player stats (e.g., Victory Points, Gold, Mana, Commander HP).
  - Configure `initialValue`, `minValue`, `maxValue`, `regenPerTurn` (automatic upkeep gain/decay), and display color.
  - Bulk import stats via CSV or download the sample CSV template.
- **Global / Shared Environment Variables**:
  - Track board-wide stats (e.g., Chaos Escalation, Market Inflation, Shared Pool) with automatic per-round change (`changePerRound`).
- **Piece / Unit Archetype Builder**:
  - Configure custom game pieces with symbols/icons, `startingCountPerPlayer`, `maxHp`, `attack`, `defense`, `moveRange`, `attackRange`, `apCost`, and `respawnTurns` (`0` = permanent elimination).
  - **8 Movement Patterns**: `orthogonal`, `omni`, `diagonal`, `knight`, `linear_track`, `graph`, `jump`, and `stationary`.
  - **On-Kill Bounty**: Automatically reward a player stat (e.g., `+1 VP` or `+2 Gold`) whenever a unit defeats an enemy piece.
  - Bulk import piece archetypes via CSV or download the sample CSV template.

---

### 3. Cards & Decks Architect (`src/components/CardsAndDecksTab.tsx`)
- **Multi-Deck Management**:
  - Create multiple decks, set cards drawn per turn (`drawPerTurn`), toggle automatic discard pile reshuffling, and view total physical cards in the pool.
- **Visual Card Gallery & Static Cost Validation**:
  - Displays all cards with cost pills, copy counts, effect summaries, and an automatic **Warning Badge** if a card's `costAmount` exceeds its cost stat's `maxValue` cap (flagging unplayable "dead cards" immediately).
- **Detailed Card Effect & Scripting Inspector**:
  - Edit card copies, resource cost stat & amount, and **5 Target Types** (`self`, `enemy_player`, `friendly_piece`, `enemy_piece`, `any_tile`).
  - Combine multiple structured effects per card across **9 Effect Types**:
    - `modify_player_stat` (Modify Self Player Stat)
    - `modify_enemy_stat` (Modify Enemy Player Stat)
    - `steal_stat` (Steal Stat from Enemy)
    - `damage_piece` (Deal Damage to Enemy Unit)
    - `heal_piece` (Heal Friendly Unit)
    - `boost_piece_attack` (Boost Friendly Unit Attack)
    - `push_move_piece` (Move Friendly Unit Forward)
    - `teleport_to_goal_step` (Advance Unit Toward Goal)
    - `draw_cards` (Draw Extra Cards)
  - **Play Condition & Formula Scripting**: Add optional boolean play conditions (e.g., `player.gold >= 3 && turn >= 2`) and custom stat formulas (`player.vp += 1; enemy.hp -= 3`).
  - Bulk import cards via CSV or download the sample CSV template.

---

### 4. Rules & Turn Structure Engine (`src/components/RulesAndTurnsTab.tsx`)
- **Turn Parameters & Table Setup**:
  - Configure player count (`1–6`), max rounds cap (`maxTurns`), Action Points per turn (`actionPointsPerTurn`), starting hand size, max hand limit, dice configuration (`1–5` dice with `d4`, `d6`, `d8`, `d10`, `d12`, or `d20`), and a **First-Player Advantage Catch-Up Rule** toggle.
- **AI Playtester Personalities by Seat**:
  - Assign each player seat one of **6 AI Strategy Archetypes**:
    - `balanced` (Balanced / Smart)
    - `rusher` (Objective / Goal Rusher)
    - `aggressive` (Combat Hunter)
    - `economic` (Greedy Resource Builder)
    - `defensive` (Defensive / Turtle)
    - `random` (Random Fuzzing)
- **Turn Phase Sequencer**:
  - Enable, disable, reorder, add, or remove turn phases:
    - `upkeep` (Upkeep & Stat Regen)
    - `draw` (Draw Cards)
    - `roll_and_move` (Roll Dice & Advance)
    - `play_cards` (Play Cards from Hand with configurable `maxCardsToPlay`)
    - `action_points` (Command Units / Spend AP to Move & Attack)
    - `combat` (Mandatory Close-Range Combat)
    - `end_turn` (End of Turn Scoring & Hand Limit Check)
- **Victory & Player Elimination Conditions**:
  - Configure multiple win or elimination conditions:
    - `stat_threshold` (e.g., `VP >= 12` to win, or `HP <= 0` to be eliminated)
    - `reach_goal_tile` (First unit on a Goal space wins)
    - `control_goal_tiles` (Control $N$ Goal spaces)
    - `eliminate_all_enemies` (Total unit wipeout)
    - `last_player_standing` (Survival victory)
    - `highest_stat_at_max_turns` (Tiebreaker when `maxTurns` is reached)
- **Event-Driven Rule Triggers (`WHEN ... IF ... THEN ...`)**:
  - Hook custom rules into **9 Game Events**: `ON_GAME_START`, `ON_TURN_START`, `ON_MOVE`, `ON_LAND_TILE`, `ON_COMBAT`, `ON_CARD_PLAY`, `ON_PIECE_DEATH`, `ON_TURN_END`, `ON_ROUND_END`.
  - Filter by space type (`tile_type`), player stat comparison (`stat_compare`), round number (`turn_compare`), or custom expressions (`custom_expr`).
  - Execute actions (`modify_stat`, `move_forward`, `damage_active_piece`, `heal_active_piece`, `draw_card`, `custom_formula`).
  - Set `maxTriggersPerTurn` (`0` = uncapped, highlighted with a loop-risk warning badge).
- **FairGame Script DSL Compiler**:
  - Write or upload plain-text rules and compile them directly into active engine triggers and win conditions:
    ```text
    WHEN ON_LAND_TILE IF tile.type == "boost" THEN player.mana += 2
    WHEN ON_COMBAT THEN player.gold += 1
    WIN WHEN player.vp >= 15
    LOSE WHEN player.hp <= 0
    ```

---

### 5. Monte Carlo Simulation & Flaw Detection Studio (`src/components/SimulationStudioTab.tsx` & `src/engine/simulator.ts`)
- **High-Speed Monte Carlo Runner**:
  - Simulate **250**, **1,000**, **2,500**, **5,000**, or **10,000** complete playthroughs asynchronously in chunks with a real-time progress bar.
  - Option to randomize AI strategy archetypes across seats on every simulated game to test strategy dominance.
- **Automated Game-Breaking Hole Detector & One-Click Rule Fixes**:
  - Automatically diagnoses structural flaws and generates **one-click rule patches** (`Apply Fix & Re-Simulate`):
    1. **Infinite Rule Trigger Loops (`critical`)**: Detects runaway recursive triggers (e.g., `ON_LAND_TILE` moving a piece onto another tile with `maxTriggersPerTurn = 0`) and offers a one-click fix to cap the offending rule at `1/turn` or disable it.
    2. **Unplayable / Dead Cards (`critical`)**: Detects cards drawn frequently but played $<3\%$ of the time (such as cards whose cost exceeds the stat's `maxValue` cap) and offers one-click fixes to lower the card cost or raise the stat cap.
    3. **Overpowered / Dominant Cards (`warning`)**: Flags cards that skew win rate by $>15\%$ above baseline when played and offers one-click cost/effect nerfs.
    4. **High Stalemate / Timeout Rate (`critical` / `warning`)**: Detects when $>15\%$ of matches hit `maxTurns` without a winner and offers one-click patches to add a tiebreaker, lower victory thresholds, or increase max turns.
    5. **First-Player / Seat Bias (`warning`)**: Detects when Seat 1 wins $>12\%$ above fair share ($1/N$) and offers a one-click fix to enable the First-Player Catch-Up Rule.
    6. **Early Blowout / Snowball Pacing (`warning`)**: Detects games ending in $\le 3.5$ rounds on average and offers a one-click target increase.
    7. **Unreachable Goal Spaces (`critical`)**: Runs Breadth-First Search (BFS) from player spawn spaces to verify path connectivity to Goal tiles when `reach_goal_tile` is enabled.
- **Before vs. After Rule Adjustment Banner**:
  - Whenever you tweak a rule or click an automated fix, FairGame Studio compares the previous simulation batch against the new batch (Health Score delta, Loop/Stalemate rate delta, P1 Win Rate delta, and Average Length delta).
- **Comprehensive Telemetry & Balance Analytics**:
  - **KPI Summary Strip**: Overall Game Health Score (`0–100`), games/sec throughput, Decisive Win Rate, Infinite Loop rate, Stalemate rate, and Average/Median/Min/Max rounds.
  - **Win Rate by Player Seat**: Visual bar chart with fair-share baseline markers.
  - **Win Condition Breakdown**: Percentage of matches ended by each victory/tiebreaker rule.
  - **Strategy Archetype Dominance**: Win rates for `rusher`, `aggressive`, `economic`, `balanced`, `defensive`, and `random` AI bots.
  - **Match Duration Histogram & Resource Economy Curve**: Round distribution buckets plus Round 1 vs. Mid-Game average stat trajectories.
  - **Card Balance & Win-Rate Correlation Matrix**: Tracks times drawn, play rate when drawn, win rate when played, win rate lift ($\Delta$), and status (`DEAD CARD`, `OVERPOWERED`, `BALANCED`).
  - **Piece / Unit Combat Telemetry**: Kills, deaths, K/D ratio, goal captures, and total damage dealt per unit archetype.
- **Visual Playtest Replay & Board Heatmap Debugger**:
  - **Turn-by-Turn Match Replay**: Select notable recorded games (Quickest Win, Longest Grinder, Infinite Loop Trace, Median Game) and step through or auto-play every turn while inspecting live board unit positions, player stats, hand sizes, and the exact rule trigger log.
  - **Space Visitation Heatmap**: Overlays tile traffic intensity across all simulated games.
  - **Unit Death Heatmap**: Highlights choke-points where units are most frequently defeated.
  - **JSON Telemetry Export**: Export full simulation reports as `.json`.
- **Optional Auto-Balancer / Parameter Sweep (`src/engine/autoBalancer.ts`)**:
  - Collapsed by default so it stays out of the way until needed (`Auto-Balancer (Optional)` button in the Simulation Studio bar).
  - Set target game length (min/max rounds), Seat 1 win-rate tolerance ($\pm 3\%$, $\pm 5\%$, $\pm 8\%$), and allowed tuning levers (Victory Thresholds, Card Costs, Economy Regen/Catch-Up, Unit HP/Attack, Loop Caps), then sweep candidate rule configurations (250–1,000 games each) to surface and apply the **Top 3 Most Balanced Rule Configurations**.

---

### 6. Interactive Human Playtest & Single-Game Slow Log Streamer (`src/components/PlaytestTableTab.tsx` & `src/engine/liveMatchEngine.ts`)
- **Play Every Turn Yourself or Mix Human & AI Seats**:
  - **All Human (Hotseat Mode)**: Every seat (`Player 1` .. `Player N`) is controlled by a person so you can play out each turn and phase manually.
  - **Human vs. AI Bots**: Play as `Player 1` while AI seats execute their turns step-by-step at your selected log speed.
  - **Watch Single Game (Slow-Mo AI Logs)**: Watch AI bots play a single game from Round 1 to completion while printing out every action slowly.
  - **Per-Seat Toggle**: Click any player's seat badge (`👤 Human` / `🤖 AI`) at any moment mid-game to take over or hand off control.
- **Interactive Turn & Board Controls**:
  - Click any friendly unit on the board (outlined in gold) to highlight **valid move spaces in glowing green** and **attackable enemy spaces in glowing red**.
  - Click a highlighted space to move or attack on the board, roll dice (`NdS`) in `roll_and_move` phases, play cards directly from the active player's hand, and advance through each turn phase (`Upkeep` → `Draw` → `Play Cards` → `Action Points` → `End Turn`).
- **Full Single-Game Play-by-Play Slow-Log Console**:
  - Prints every single action, dice roll, card draw, card play, movement path, combat damage formula (`ATK - ⌊DEF × 0.5⌋`), space effect, and `WHEN ... IF ... THEN ...` rule trigger with before/after stat deltas.
  - Adjustable streaming speeds: **Very Slow (`1.8s / action`)**, **Slow Logs (`1.0s / action`)**, **Normal (`0.55s / action`)**, **Fast (`0.22s / action`)**, or **Manual Step (`Step 1 Action`)**.
  - Filter logs by category (`All`, `⚡ Rules & Spaces`, `🃏 Cards & Draws`, `⚔️ Moves & Combat`, `🕒 Turns & Phases`), copy the full single-game transcript to the clipboard, or download it as a `.txt` file.

---

### 7. Built-In Presets & Universal Import / Export (`src/data/presets.ts` & `src/utils/importers.ts`)
- **3 Built-In Game Presets** accessible from the top header bar:
  1. **Relic Conquest (Balanced Tactical Arena)** — $6 \times 6$ Square Grid tactical skirmish & relic race (Health Score ~92–100).
  2. **Broken Loop Lab ( Intentional Flaws Demo)** — $7 \times 5$ Square Grid with 3 intentional game-breaking flaws (an infinite `ON_LAND_TILE` warp loop, an unpayable 9-Mana *Forbidden Cataclysm* card when Max Mana is 6, and an overpowered 1-Mana *Sovereign Decree* card) so you can watch the simulator catch all 3 issues and fix them in one click.
  3. **Chrono Circuit (Looping Board Race)** — 16-space looping track dice-and-card race game.
- **Universal File Upload & Export**:
  - Import/export complete game configurations as `.json`.
  - Import plain-text `.txt` / `.rules` scripts directly from the top bar.

---

## Project Structure

```text
fairgame/
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx                           # Top-level studio shell, preset switcher, import/export, tab router
│   ├── index.css                         # Tailwind CSS v4 + dark studio theme
│   ├── types/
│   │   └── game.ts                       # Core TypeScript interfaces for boards, pieces, cards, rules, & telemetry
│   ├── data/
│   │   └── presets.ts                    # 3 built-in tabletop game presets + board topology generators
│   ├── engine/
│   │   ├── simulator.ts                  # Monte Carlo simulation engine, AI decision scorer, flaw detector, & patcher
│   │   └── liveMatchEngine.ts            # Interactive turn-by-turn Human/AI match engine & atomic slow-log streamer
│   ├── utils/
│   │   └── importers.ts                  # Parsers for CSV cards/pieces/stats, ASCII boards, JSON packs, & Rule DSL
│   └── components/
│       ├── BoardVisualizer.tsx           # Interactive SVG renderer for Square, Hex, Track, & Graph boards + highlights
│       ├── BoardCreatorTab.tsx           # Tab 1: Board topology, tile brush, tile inspector, & blueprint upload
│       ├── PiecesAndStatsTab.tsx         # Tab 2: Player stats, global stats, & unit archetype editor + CSV import
│       ├── CardsAndDecksTab.tsx          # Tab 3: Deck settings, card gallery, effect builder, & CSV import
│       ├── RulesAndTurnsTab.tsx          # Tab 4: Turn phases, win/loss conditions, rule triggers, & DSL compiler
│       ├── SimulationStudioTab.tsx       # Tab 5: Monte Carlo runner, flaw diagnostics, charts, & turn-by-turn replay
│       └── PlaytestTableTab.tsx          # Tab 6: Interactive Human playtest mode & single-game slow-log console
```

---

## Getting Started

### Prerequisites
- Node.js 18+ and `npm`

### Installation & Local Development

```bash
# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### Production Build

```bash
npm run build
npm run preview
```
