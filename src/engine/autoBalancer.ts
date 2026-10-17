import { GameConfig, SimulationBatchSummary } from '../types/game';
import { runMonteCarloBatch } from './simulator';

export interface AutoTuneGoals {
  targetMinRounds: number;
  targetMaxRounds: number;
  maxSeatBiasDelta: number; // e.g. 0.05 for ±5% from fair baseline 1/N
  maxStalemateRate: number; // e.g. 0.02 for <2%
  gamesPerCandidate: number; // e.g. 250 or 500
  tuneWinThresholds: boolean;
  tuneCardCosts: boolean;
  tuneEconomyAndCatchup: boolean;
  tuneUnitStats: boolean;
  fixUncappedLoops: boolean;
}

export interface AutoTuneCandidateResult {
  id: string;
  rank: number;
  label: string;
  changes: string[];
  config: GameConfig;
  summary: SimulationBatchSummary;
  fitnessScore: number; // 0..100 composite score against user's target goals
}

function deepCloneConfig(config: GameConfig): GameConfig {
  return JSON.parse(JSON.stringify(config)) as GameConfig;
}

/**
 * Generates a diverse set of candidate GameConfig variations (grid sweep + targeted mutations)
 * based on the enabled levers and current game rules.
 */
function generateCandidates(
  baseConfig: GameConfig,
  goals: AutoTuneGoals
): { label: string; changes: string[]; config: GameConfig }[] {
  const candidates: { label: string; changes: string[]; config: GameConfig }[] = [];

  // Helper to apply common loop & unpayable card fixes if enabled
  const applySafetyFixes = (cfg: GameConfig, changes: string[]) => {
    if (goals.fixUncappedLoops) {
      for (const r of cfg.rules) {
        if (r.enabled && r.maxTriggersPerTurn === 0) {
          r.maxTriggersPerTurn = 1;
          changes.push(`Capped rule "${r.name}" at 1 trigger/turn (prevents infinite loops)`);
        }
      }
    }
    if (goals.tuneCardCosts) {
      const statMap = new Map(cfg.playerStats.map((s) => [s.id, s]));
      for (const c of cfg.cards) {
        const st = statMap.get(c.costStatId);
        if (st && c.costAmount > st.maxValue) {
          const oldCost = c.costAmount;
          c.costAmount = Math.max(1, st.maxValue - 1);
          changes.push(
            `Lowered unpayable "${c.name}" cost: ${oldCost} → ${c.costAmount} ${st.name}`
          );
        }
      }
    }
  };

  // Candidate 1: Safety & Fair Turn-Order Baseline
  {
    const cfg = deepCloneConfig(baseConfig);
    const changes: string[] = [];
    applySafetyFixes(cfg, changes);
    if (goals.tuneEconomyAndCatchup && !cfg.turnConfig.firstPlayerAdvantageMitigation) {
      cfg.turnConfig.firstPlayerAdvantageMitigation = true;
      changes.push('Enabled First-Player Advantage Catch-Up Rule (+1 starting resource for P2+)');
    }
    if (changes.length > 0) {
      candidates.push({
        label: 'Safety & Seat Fairness Patch',
        changes,
        config: cfg,
      });
    }
  }

  // Candidate 2: Faster Pacing (Lower Victory Thresholds / +Unit Attack)
  if (goals.tuneWinThresholds || goals.tuneUnitStats) {
    const cfg = deepCloneConfig(baseConfig);
    const changes: string[] = [];
    applySafetyFixes(cfg, changes);

    if (goals.tuneWinThresholds) {
      for (const wc of cfg.winConditions) {
        if (
          wc.enabled &&
          !wc.isLossCondition &&
          wc.type === 'stat_threshold' &&
          wc.targetValue !== undefined &&
          wc.targetValue > 5
        ) {
          const prev = wc.targetValue;
          wc.targetValue = Math.max(4, Math.round(prev * 0.8));
          changes.push(`Lowered "${wc.name}" threshold: ${prev} → ${wc.targetValue}`);
        }
      }
    }
    if (goals.tuneUnitStats) {
      for (const p of cfg.pieces) {
        const prevAtk = p.attack;
        p.attack = prevAtk + 1;
        changes.push(`Increased ${p.name} Attack: ${prevAtk} → ${p.attack}`);
      }
    }
    if (changes.length > 0) {
      candidates.push({
        label: 'Accelerated Pacing & Anti-Stalemate',
        changes,
        config: cfg,
      });
    }
  }

  // Candidate 3: Longer Tactical Pacing (Higher Victory Thresholds / +Unit HP)
  if (goals.tuneWinThresholds || goals.tuneUnitStats) {
    const cfg = deepCloneConfig(baseConfig);
    const changes: string[] = [];
    applySafetyFixes(cfg, changes);

    if (goals.tuneWinThresholds) {
      for (const wc of cfg.winConditions) {
        if (
          wc.enabled &&
          !wc.isLossCondition &&
          wc.type === 'stat_threshold' &&
          wc.targetValue !== undefined
        ) {
          const prev = wc.targetValue;
          wc.targetValue = Math.round(prev * 1.25) + 1;
          changes.push(`Raised "${wc.name}" threshold: ${prev} → ${wc.targetValue}`);
        }
      }
    }
    if (goals.tuneUnitStats) {
      for (const p of cfg.pieces) {
        const prevHp = p.maxHp;
        p.maxHp = Math.round(prevHp * 1.2) + 2;
        changes.push(`Increased ${p.name} Max HP: ${prevHp} → ${p.maxHp}`);
      }
    }
    if (changes.length > 0) {
      candidates.push({
        label: 'Extended Tactical Pacing (+Threshold & +HP)',
        changes,
        config: cfg,
      });
    }
  }

  // Candidate 4: Card Cost & Power Rebalance
  if (goals.tuneCardCosts) {
    const cfg = deepCloneConfig(baseConfig);
    const changes: string[] = [];
    applySafetyFixes(cfg, changes);

    for (const c of cfg.cards) {
      // Check if a low-cost card has very high effect values
      const totalPositiveEffect = c.effects.reduce(
        (acc, e) => acc + Math.abs(e.value),
        0
      );
      if (c.costAmount <= 1 && totalPositiveEffect >= 4) {
        const prevCost = c.costAmount;
        c.costAmount = prevCost + 2;
        changes.push(
          `Balanced high-impact card "${c.name}" cost: ${prevCost} → ${c.costAmount}`
        );
      } else if (c.costAmount >= 5 && totalPositiveEffect <= 3) {
        const prevCost = c.costAmount;
        c.costAmount = Math.max(1, prevCost - 1);
        changes.push(
          `Reduced expensive card "${c.name}" cost: ${prevCost} → ${c.costAmount}`
        );
      }
    }
    if (goals.tuneEconomyAndCatchup && !cfg.turnConfig.firstPlayerAdvantageMitigation) {
      cfg.turnConfig.firstPlayerAdvantageMitigation = true;
      changes.push('Enabled First-Player Catch-Up Rule');
    }
    if (changes.length > 0) {
      candidates.push({
        label: 'Card Economy & Cost Curve Rebalance',
        changes,
        config: cfg,
      });
    }
  }

  // Candidate 5: Boosted Economy & Tiebreaker Insurance
  if (goals.tuneEconomyAndCatchup || goals.tuneWinThresholds) {
    const cfg = deepCloneConfig(baseConfig);
    const changes: string[] = [];
    applySafetyFixes(cfg, changes);

    if (goals.tuneEconomyAndCatchup) {
      cfg.turnConfig.firstPlayerAdvantageMitigation = true;
      for (const s of cfg.playerStats) {
        if (s.regenPerTurn > 0 && s.id !== 'hp') {
          const prev = s.regenPerTurn;
          s.regenPerTurn = prev + 1;
          changes.push(`Boosted ${s.name} Regen/Turn: +${prev} → +${s.regenPerTurn}`);
        }
      }
    }

    const hasTiebreaker = cfg.winConditions.some(
      (wc) => wc.enabled && wc.type === 'highest_stat_at_max_turns'
    );
    if (!hasTiebreaker && cfg.playerStats.length > 0) {
      const primaryStat =
        cfg.playerStats.find((s) => s.id === 'vp') || cfg.playerStats[0];
      cfg.winConditions.push({
        id: `wc_autotune_tb_${Date.now()}`,
        name: `Most ${primaryStat.name} at Max Turns`,
        enabled: true,
        type: 'highest_stat_at_max_turns',
        statId: primaryStat.id,
        description: `Awards win to highest ${primaryStat.name} if Max Turns is reached.`,
      });
      changes.push(`Added Max-Turns Tiebreaker on ${primaryStat.name}`);
    }

    if (changes.length > 0) {
      candidates.push({
        label: 'High-Flow Economy + Tiebreaker Protection',
        changes,
        config: cfg,
      });
    }
  }

  // Candidate 6: Comprehensive Combined Balance Sweep (Combines Card Curve + Target Pacing + Catch-Up + Tiebreaker)
  {
    const cfg = deepCloneConfig(baseConfig);
    const changes: string[] = [];
    applySafetyFixes(cfg, changes);

    if (goals.tuneEconomyAndCatchup && !cfg.turnConfig.firstPlayerAdvantageMitigation) {
      cfg.turnConfig.firstPlayerAdvantageMitigation = true;
      changes.push('Enabled First-Player Catch-Up Rule');
    }

    if (goals.tuneCardCosts) {
      for (const c of cfg.cards) {
        const totalImpact = c.effects.reduce((s, e) => s + Math.abs(e.value), 0);
        if (c.costAmount <= 1 && totalImpact >= 4) {
          const oldCost = c.costAmount;
          c.costAmount = 3;
          for (const e of c.effects) {
            if (Math.abs(e.value) >= 5) {
              e.value = e.value > 0 ? 3 : -3;
            }
          }
          changes.push(
            `Tuned dominant card "${c.name}" (Cost ${oldCost}→3, capped extreme effect to 3)`
          );
        }
      }
    }

    const hasTiebreaker = cfg.winConditions.some(
      (wc) => wc.enabled && wc.type === 'highest_stat_at_max_turns'
    );
    if (!hasTiebreaker && cfg.playerStats.length > 0) {
      const primaryStat =
        cfg.playerStats.find((s) => s.id === 'vp') || cfg.playerStats[0];
      cfg.winConditions.push({
        id: `wc_autotune_full_${Date.now()}`,
        name: `Most ${primaryStat.name} Tiebreaker`,
        enabled: true,
        type: 'highest_stat_at_max_turns',
        statId: primaryStat.id,
        description: `Prevents stalemates at max turns.`,
      });
      changes.push(`Added "${primaryStat.name}" Max-Turns Tiebreaker`);
    }

    if (changes.length > 0) {
      candidates.push({
        label: 'Full Holistic Balance Tuning',
        changes,
        config: cfg,
      });
    }
  }

  return candidates;
}

/**
 * Computes a 0..100 fitness score for a simulation batch against the user's target goals.
 */
function scoreCandidateAgainstGoals(
  summary: SimulationBatchSummary,
  playerCount: number,
  goals: AutoTuneGoals
): number {
  let score = summary.healthScore;

  // 1. Pacing goal penalty/bonus
  if (
    summary.avgRounds >= goals.targetMinRounds &&
    summary.avgRounds <= goals.targetMaxRounds
  ) {
    score += 10;
  } else {
    const dist =
      summary.avgRounds < goals.targetMinRounds
        ? goals.targetMinRounds - summary.avgRounds
        : summary.avgRounds - goals.targetMaxRounds;
    score -= Math.min(25, dist * 2.5);
  }

  // 2. Seat 1 fairness penalty/bonus
  const fairShare = 1 / Math.max(1, playerCount);
  const p1Delta = Math.abs((summary.winRatesBySeat[0] ?? fairShare) - fairShare);
  if (p1Delta <= goals.maxSeatBiasDelta) {
    score += 8;
  } else {
    score -= Math.min(25, (p1Delta - goals.maxSeatBiasDelta) * 120);
  }

  // 3. Stalemate + Loop rate penalty/bonus
  const badEndRate =
    (summary.outcomeCounts.infinite_loop +
      summary.outcomeCounts.stalemate_timeout +
      summary.outcomeCounts.deadlock_no_moves) /
    Math.max(1, summary.totalGames);

  if (badEndRate <= goals.maxStalemateRate) {
    score += 8;
  } else {
    score -= Math.min(40, (badEndRate - goals.maxStalemateRate) * 140);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function runParameterSweepAutoBalancer(
  baseConfig: GameConfig,
  goals: AutoTuneGoals,
  onProgress?: (currentCandidate: number, totalCandidates: number, label: string) => void
): Promise<AutoTuneCandidateResult[]> {
  const rawCandidates = generateCandidates(baseConfig, goals);
  const results: AutoTuneCandidateResult[] = [];

  for (let i = 0; i < rawCandidates.length; i++) {
    const cand = rawCandidates[i];
    onProgress?.(i + 1, rawCandidates.length, cand.label);
    const summary = await runMonteCarloBatch(
      cand.config,
      goals.gamesPerCandidate,
      true
    );
    const fitness = scoreCandidateAgainstGoals(
      summary,
      cand.config.turnConfig.playerCount,
      goals
    );
    results.push({
      id: `cand_${i}_${Date.now()}`,
      rank: 0,
      label: cand.label,
      changes: cand.changes,
      config: cand.config,
      summary,
      fitnessScore: fitness,
    });
  }

  // Sort by fitnessScore descending, then healthScore descending
  results.sort(
    (a, b) =>
      b.fitnessScore - a.fitnessScore ||
      b.summary.healthScore - a.summary.healthScore
  );

  return results.slice(0, 3).map((r, idx) => ({
    ...r,
    rank: idx + 1,
  }));
}
