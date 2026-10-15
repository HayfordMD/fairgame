# FairGame Studio — Tabletop Game Architect & Monte Carlo Simulator

FairGame Studio is an interactive tabletop game creator and Monte Carlo simulation studio for designing, recreating, and stress-testing board and card games across thousands of simulated playthroughs.

## Features

- **Interactive Board Creator**: Supports **Square Grid**, **Hex Grid**, **Linear / Looping Track**, and **Node / Graph Territory Map** topologies, plus custom blueprint image overlays and ASCII/CSV matrix import.
- **Pieces & Stats Configurator**: Define custom player stats, global environment variables, and unit archetypes with movement patterns, combat attributes, respawn rules, and on-kill bounty effects.
- **Cards & Decks Architect**: Configure multiple decks, card copy counts, resource costs, play conditions, structured effects, custom formula scripts, and bulk CSV imports.
- **Rules & Turn Phase Sequencer**: Customize turn phase ordering, player counts (1–6), dice configurations, AI player strategies, victory/elimination conditions, and event-driven rule triggers (`WHEN ... IF ... THEN ...`).
- **Monte Carlo Simulation & Diagnostic Suite**: Run 250 to 10,000+ simulations to automatically detect infinite rule loops, stalemates, dead/unplayable cards, overpowered cards, and first-player bias — complete with one-click rule patches and a turn-by-turn visual match replay debugger.

## Getting Started

```bash
npm install
npm run dev
```
