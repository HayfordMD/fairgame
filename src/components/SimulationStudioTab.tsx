import React, { useEffect, useState } from 'react';
import {
  Play,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  Wrench,
  Flame,
  Eye,
  SkipBack,
  SkipForward,
  Pause,
  Download,
  TrendingUp,
  Award,
  Layers,
  Shield,
  RefreshCw,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import {
  DiagnosticPatch,
  GameConfig,
  SimulationBatchSummary,
} from '../types/game';
import {
  AutoTuneCandidateResult,
  AutoTuneGoals,
  runParameterSweepAutoBalancer,
} from '../engine/autoBalancer';
import { BoardVisualizer } from './BoardVisualizer';

interface SimulationStudioTabProps {
  config: GameConfig;
  simResult: SimulationBatchSummary | null;
  prevSimResult: SimulationBatchSummary | null;
  isRunning: boolean;
  progress: { completed: number; total: number };
  onRunSimulation: (count: number, randomizeStrategies: boolean) => void;
  onApplyPatchAndSimulate: (
    patch: DiagnosticPatch,
    count: number,
    randomizeStrategies: boolean
  ) => void;
}

export const SimulationStudioTab: React.FC<SimulationStudioTabProps> = ({
  config,
  simResult,
  prevSimResult,
  isRunning,
  progress,
  onRunSimulation,
  onApplyPatchAndSimulate,
}) => {
  const [simCount, setSimCount] = useState<number>(1000);
  const [randomizeStrategies, setRandomizeStrategies] = useState<boolean>(true);
  const [boardViewMode, setBoardViewMode] = useState<
    'replay' | 'visits' | 'deaths'
  >('replay');
  const [selectedReplayIdx, setSelectedReplayIdx] = useState<number>(0);
  const [replayStepIdx, setReplayStepIdx] = useState<number>(0);
  const [isAutoPlayingReplay, setIsAutoPlayingReplay] = useState<boolean>(false);
  const [replaySpeedMs, setReplaySpeedMs] = useState<number>(1200);
  const [showFullGameLog, setShowFullGameLog] = useState<boolean>(true);

  // Optional Auto-Balancer / Parameter Sweep state (collapsed by default)
  const [showAutoTuner, setShowAutoTuner] = useState<boolean>(false);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);
  const [sweepProgressText, setSweepProgressText] = useState<string>('');
  const [sweepResults, setSweepResults] = useState<AutoTuneCandidateResult[]>(
    []
  );
  const [autoTuneGoals, setAutoTuneGoals] = useState<AutoTuneGoals>({
    targetMinRounds: 8,
    targetMaxRounds: 15,
    maxSeatBiasDelta: 0.05,
    maxStalemateRate: 0.02,
    gamesPerCandidate: 500,
    tuneWinThresholds: true,
    tuneCardCosts: true,
    tuneEconomyAndCatchup: true,
    tuneUnitStats: true,
    fixUncappedLoops: true,
  });

  const activeReplay =
    simResult?.notableGames[selectedReplayIdx] ||
    simResult?.notableGames[0] ||
    null;

  const activeSnapshot =
    activeReplay?.snapshots[
      Math.min(replayStepIdx, Math.max(0, (activeReplay?.snapshots.length || 1) - 1))
    ] || null;

  useEffect(() => {
    setSelectedReplayIdx(0);
    setReplayStepIdx(0);
    setIsAutoPlayingReplay(false);
  }, [simResult?.id]);

  useEffect(() => {
    if (!isAutoPlayingReplay || !activeReplay) return;
    const timer = setInterval(() => {
      setReplayStepIdx((prev) => {
        if (prev + 1 >= activeReplay.snapshots.length) {
          setIsAutoPlayingReplay(false);
          return prev;
        }
        return prev + 1;
      });
    }, replaySpeedMs);
    return () => clearInterval(timer);
  }, [isAutoPlayingReplay, activeReplay, replaySpeedMs]);

  const handleExportReport = () => {
    if (!simResult) return;
    const blob = new Blob([JSON.stringify(simResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.toLowerCase().replace(/\s+/g, '_')}_sim_report.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunAutoSweep = async () => {
    if (isSweeping || isRunning) return;
    setIsSweeping(true);
    setSweepResults([]);
    try {
      const top3 = await runParameterSweepAutoBalancer(
        config,
        autoTuneGoals,
        (curr, total, label) => {
          setSweepProgressText(
            `Sweeping candidate ${curr}/${total}: ${label} (${autoTuneGoals.gamesPerCandidate} games)...`
          );
        }
      );
      setSweepResults(top3);
    } finally {
      setIsSweeping(false);
      setSweepProgressText('');
    }
  };

  const expectedSeatWinRate = 1 / Math.max(1, config.turnConfig.playerCount);

  return (
    <div className="space-y-6">
      {/* Top Control Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-indigo-400" />
            Monte Carlo Simulation & Game-Breaking Flaw Detector
          </h2>
          <p className="text-xs text-slate-400">
            Simulate thousands of complete playthroughs to expose infinite loops, deadlocks,
            overpowered cards, and first-player bias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs">
            <span className="text-slate-400">Simulations:</span>
            <select
              value={simCount}
              onChange={(e) => setSimCount(parseInt(e.target.value, 10))}
              disabled={isRunning}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
            >
              <option value={250}>250 Matches (Fast)</option>
              <option value={1000}>1,000 Matches (Standard)</option>
              <option value={2500}>2,500 Matches (Deep)</option>
              <option value={5000}>5,000 Matches (Stress Test)</option>
              <option value={10000}>10,000 Matches (Exhaustive)</option>
            </select>
          </div>

          <label className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeStrategies}
              onChange={(e) => setRandomizeStrategies(e.target.checked)}
              disabled={isRunning}
              className="rounded border-slate-700"
            />
            <span>Randomize AI Strategies per Seat</span>
          </label>

          <button
            onClick={() => onRunSimulation(simCount, randomizeStrategies)}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/25 transition-all cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  Simulating {progress.completed.toLocaleString()} /{' '}
                  {progress.total.toLocaleString()}...
                </span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run {simCount.toLocaleString()} Simulations</span>
              </>
            )}
          </button>

          {/* Optional Auto-Balancer Toggle Button */}
          <button
            onClick={() => setShowAutoTuner((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              showAutoTuner
                ? 'bg-purple-950/70 border-purple-500/50 text-purple-200'
                : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
            title="Optional Tool: Sweep parameters to find the Top 3 Most Balanced Rule Configurations"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-400" />
            <span>Auto-Balancer (Optional)</span>
            {showAutoTuner ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {simResult && (
            <button
              onClick={handleExportReport}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700 cursor-pointer"
              title="Export Full Simulation Telemetry JSON"
            >
              <Download className="w-3.5 h-3.5" /> Export Report
            </button>
          )}
        </div>
      </div>

      {/* Optional Collapsible Auto-Balancer / Parameter Sweep Drawer */}
      {showAutoTuner && (
        <div className="bg-slate-900/95 border border-purple-500/40 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Optional Auto-Tune Optimizer & Parameter Sweep
              </h3>
              <p className="text-xs text-slate-400">
                Set your target game pacing and fairness goals — sweeps across candidate rule adjustments and surfaces the Top 3 Most Balanced Configurations.
              </p>
            </div>
            <button
              onClick={handleRunAutoSweep}
              disabled={isSweeping || isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow cursor-pointer"
            >
              {isSweeping ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{sweepProgressText || 'Running Parameter Sweep...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    Sweep & Find Top 3 Configurations ({autoTuneGoals.gamesPerCandidate} games/ea)
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Target Goals & Tunable Levers */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
            <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
              <div>
                <label className="block text-slate-400 mb-1">
                  Min Target Rounds
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={autoTuneGoals.targetMinRounds}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      targetMinRounds: Math.max(1, parseInt(e.target.value, 10) || 8),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Max Target Rounds
                </label>
                <input
                  type="number"
                  min={3}
                  max={100}
                  value={autoTuneGoals.targetMaxRounds}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      targetMaxRounds: Math.max(2, parseInt(e.target.value, 10) || 15),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Seat 1 Bias Tol.
                </label>
                <select
                  value={autoTuneGoals.maxSeatBiasDelta}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      maxSeatBiasDelta: parseFloat(e.target.value),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                >
                  <option value={0.03}>±3% (Strict)</option>
                  <option value={0.05}>±5% (Standard)</option>
                  <option value={0.08}>±8% (Relaxed)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Games / Candidate
                </label>
                <select
                  value={autoTuneGoals.gamesPerCandidate}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      gamesPerCandidate: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                >
                  <option value={250}>250 Games (Fast)</option>
                  <option value={500}>500 Games (Standard)</option>
                  <option value={1000}>1,000 Games (Deep)</option>
                </select>
              </div>
            </div>

            <div className="lg:col-span-6 bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center gap-3">
              <span className="text-slate-400 font-semibold w-full">
                Allowed Parameters to Sweep:
              </span>
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTuneGoals.tuneWinThresholds}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      tuneWinThresholds: e.target.checked,
                    })
                  }
                />
                <span>Victory Thresholds & Tiebreakers</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTuneGoals.tuneCardCosts}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      tuneCardCosts: e.target.checked,
                    })
                  }
                />
                <span>Card Costs & Effects</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTuneGoals.tuneEconomyAndCatchup}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      tuneEconomyAndCatchup: e.target.checked,
                    })
                  }
                />
                <span>Economy Regen & P2 Catch-Up</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTuneGoals.tuneUnitStats}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      tuneUnitStats: e.target.checked,
                    })
                  }
                />
                <span>Unit HP & Attack</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTuneGoals.fixUncappedLoops}
                  onChange={(e) =>
                    setAutoTuneGoals({
                      ...autoTuneGoals,
                      fixUncappedLoops: e.target.checked,
                    })
                  }
                />
                <span>Cap Infinite Trigger Loops</span>
              </label>
            </div>
          </div>

          {/* Top 3 Candidate Results */}
          {sweepResults.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {sweepResults.map((cand) => {
                const p1WinPct = (
                  (cand.summary.winRatesBySeat[0] || 0) * 100
                ).toFixed(1);
                const stalePct = (
                  ((cand.summary.outcomeCounts.infinite_loop +
                    cand.summary.outcomeCounts.stalemate_timeout) /
                    Math.max(1, cand.summary.totalGames)) *
                  100
                ).toFixed(1);

                return (
                  <div
                    key={cand.id}
                    className="bg-slate-950 border border-purple-500/30 rounded-xl p-4 flex flex-col justify-between space-y-3 text-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold text-[11px]">
                          #{cand.rank} Recommended Config
                        </span>
                        <span className="font-mono font-bold text-emerald-400">
                          Fitness: {cand.fitnessScore}/100 (Health{' '}
                          {cand.summary.healthScore})
                        </span>
                      </div>

                      <h4 className="font-bold text-slate-100 text-sm">
                        {cand.label}
                      </h4>

                      <div className="grid grid-cols-3 gap-1.5 bg-slate-900 p-2 rounded-lg border border-slate-800 text-[11px] font-mono">
                        <div>
                          <div className="text-slate-400">Avg Length</div>
                          <div className="text-slate-100 font-bold">
                            {cand.summary.avgRounds}r
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">P1 Win%</div>
                          <div className="text-indigo-300 font-bold">
                            {p1WinPct}%
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-400">Stale/Loop</div>
                          <div className="text-emerald-400 font-bold">
                            {stalePct}%
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1 text-[11px] text-slate-300">
                        <div className="font-semibold text-slate-400">
                          Swept Parameter Changes:
                        </div>
                        {cand.changes.map((ch, idx) => (
                          <div key={idx} className="leading-snug">
                            • {ch}
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        onApplyPatchAndSimulate(
                          {
                            id: cand.id,
                            label: `Auto-Tune #${cand.rank}: ${cand.label}`,
                            description: cand.changes.join('; '),
                            category: 'rule',
                            apply: () => cand.config,
                          },
                          simCount,
                          randomizeStrategies
                        )
                      }
                      className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Apply Config #{cand.rank} & Simulate</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Progress Bar when running */}
      {isRunning && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-xs text-indigo-300 font-medium">
            <span>Executing Monte Carlo Playthroughs & Rule Trigger Checks...</span>
            <span>
              {Math.round(
                (progress.completed / Math.max(1, progress.total)) * 100
              )}
              %
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-150"
              style={{
                width: `${Math.round(
                  (progress.completed / Math.max(1, progress.total)) * 100
                )}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Before vs. After Rule Adjustment Comparison Banner */}
      {simResult && prevSimResult && prevSimResult.id !== simResult.id && (
        <div className="bg-gradient-to-r from-indigo-950/60 via-slate-900 to-emerald-950/50 border border-indigo-500/40 rounded-xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300 uppercase tracking-wider">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Rule Adjustment Impact (Previous Run vs. Current Run)
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <span className="text-slate-400">Balance Health Score: </span>
                <span className="text-slate-300 font-mono">
                  {prevSimResult.healthScore}
                </span>
                <span className="text-slate-500 mx-1">→</span>
                <span
                  className={`font-bold font-mono ${
                    simResult.healthScore >= prevSimResult.healthScore
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {simResult.healthScore}/100
                </span>
              </div>
              <div>
                <span className="text-slate-400">Loop/Stalemate Rate: </span>
                <span className="text-slate-300 font-mono">
                  {(
                    ((prevSimResult.outcomeCounts.infinite_loop +
                      prevSimResult.outcomeCounts.stalemate_timeout) /
                      prevSimResult.totalGames) *
                    100
                  ).toFixed(1)}
                  %
                </span>
                <span className="text-slate-500 mx-1">→</span>
                <span className="font-bold font-mono text-emerald-400">
                  {(
                    ((simResult.outcomeCounts.infinite_loop +
                      simResult.outcomeCounts.stalemate_timeout) /
                      simResult.totalGames) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>
              <div>
                <span className="text-slate-400">P1 Win Rate: </span>
                <span className="text-slate-300 font-mono">
                  {((prevSimResult.winRatesBySeat[0] || 0) * 100).toFixed(1)}%
                </span>
                <span className="text-slate-500 mx-1">→</span>
                <span className="font-bold font-mono text-indigo-300">
                  {((simResult.winRatesBySeat[0] || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-slate-400">Avg Length: </span>
                <span className="text-slate-300 font-mono">
                  {prevSimResult.avgRounds}r
                </span>
                <span className="text-slate-500 mx-1">→</span>
                <span className="font-bold font-mono text-slate-100">
                  {simResult.avgRounds}r
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {simResult ? (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Game Health Score</div>
              <div
                className={`text-2xl font-extrabold mt-1 ${
                  simResult.healthScore >= 80
                    ? 'text-emerald-400'
                    : simResult.healthScore >= 55
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {simResult.healthScore}
                <span className="text-xs font-normal text-slate-500"> / 100</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {simResult.issues.length} diagnostic finding(s)
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Simulated Matches</div>
              <div className="text-2xl font-extrabold text-slate-100 mt-1">
                {simResult.totalGames.toLocaleString()}
              </div>
              <div className="text-[11px] text-emerald-400 mt-1">
                Completed in {simResult.durationMs} ms (
                {Math.round(
                  (simResult.totalGames / Math.max(1, simResult.durationMs)) *
                    1000
                ).toLocaleString()}{' '}
                games/s)
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Decisive Win Rate</div>
              <div className="text-2xl font-extrabold text-indigo-400 mt-1">
                {(
                  (simResult.outcomeCounts.win / simResult.totalGames) *
                  100
                ).toFixed(1)}
                %
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {simResult.outcomeCounts.win.toLocaleString()} finished cleanly
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">
                Infinite Loops / Crashes
              </div>
              <div
                className={`text-2xl font-extrabold mt-1 ${
                  simResult.outcomeCounts.infinite_loop > 0
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {(
                  (simResult.outcomeCounts.infinite_loop /
                    simResult.totalGames) *
                  100
                ).toFixed(1)}
                %
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {simResult.outcomeCounts.infinite_loop} loop aborts
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Stalemates / Timeouts</div>
              <div
                className={`text-2xl font-extrabold mt-1 ${
                  simResult.outcomeCounts.stalemate_timeout +
                    simResult.outcomeCounts.deadlock_no_moves >
                  simResult.totalGames * 0.15
                    ? 'text-amber-400'
                    : 'text-slate-100'
                }`}
              >
                {(
                  ((simResult.outcomeCounts.stalemate_timeout +
                    simResult.outcomeCounts.deadlock_no_moves) /
                    simResult.totalGames) *
                  100
                ).toFixed(1)}
                %
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Cap: {config.turnConfig.maxTurns} rounds
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Average Game Length</div>
              <div className="text-2xl font-extrabold text-slate-100 mt-1">
                {simResult.avgRounds}{' '}
                <span className="text-xs font-normal text-slate-400">
                  rounds
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Range: {simResult.minRounds} – {simResult.maxRounds} (Med{' '}
                {simResult.medianRounds})
              </div>
            </div>
          </div>

          {/* Automated Game-Breaking Holes & Balance Diagnostics */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  Automated Rule Hole & Balance Diagnostic Report (
                  {simResult.issues.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Detected rule exploits, unplayable cards, infinite loops, and seat
                  biases — click any suggested patch to auto-adjust your rules and
                  re-verify!
                </p>
              </div>
            </div>

            {simResult.issues.length === 0 ? (
              <div className="flex items-center gap-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 text-xs text-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="font-bold text-sm">
                    Zero Game-Breaking Holes or Severe Imbalances Detected!
                  </div>
                  <div className="text-emerald-300/80">
                    All cards are playable, no infinite trigger loops occurred, and
                    player seat win rates are within balanced tolerances.
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {simResult.issues.map((issue) => {
                  const isCrit = issue.severity === 'critical';
                  const isWarn = issue.severity === 'warning';
                  return (
                    <div
                      key={issue.id}
                      className={`rounded-xl p-4 border flex flex-col justify-between space-y-3 ${
                        isCrit
                          ? 'bg-rose-950/25 border-rose-500/40'
                          : isWarn
                          ? 'bg-amber-950/20 border-amber-500/40'
                          : 'bg-sky-950/20 border-sky-500/30'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                              isCrit
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : isWarn
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                            }`}
                          >
                            {isCrit ? (
                              <AlertOctagon className="w-3.5 h-3.5" />
                            ) : isWarn ? (
                              <AlertTriangle className="w-3.5 h-3.5" />
                            ) : (
                              <Info className="w-3.5 h-3.5" />
                            )}
                            {issue.severity}
                          </span>
                          <span className="text-xs font-mono font-semibold text-slate-300 bg-slate-950/80 px-2.5 py-0.5 rounded border border-slate-800">
                            {issue.metricBadge}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-slate-100">
                          {issue.title}
                        </h4>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {issue.summary}
                        </p>
                        <p className="text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
                          <strong className="text-slate-300">Root Cause: </strong>
                          {issue.technicalDetail}
                        </p>
                      </div>

                      {issue.fixes.length > 0 && (
                        <div className="pt-2 border-t border-slate-800/80 space-y-2">
                          <div className="text-[11px] font-semibold text-indigo-300">
                            Recommended Rule Adjustments:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {issue.fixes.map((fix) => (
                              <button
                                key={fix.id}
                                onClick={() =>
                                  onApplyPatchAndSimulate(
                                    fix,
                                    simCount,
                                    randomizeStrategies
                                  )
                                }
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow transition-colors cursor-pointer"
                                title={fix.description}
                              >
                                <Wrench className="w-3.5 h-3.5" />
                                <span>{fix.label} & Re-Simulate</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Row: Seat Balance, Strategy Win Rates, and Turn Pacing */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Win Rate by Player Seat */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-indigo-400" />
                  Win Rate by Player Turn Order (Seat)
                </h3>
                <p className="text-xs text-slate-400">
                  Fair baseline for {config.turnConfig.playerCount} players:{' '}
                  <strong className="text-indigo-300">
                    {(expectedSeatWinRate * 100).toFixed(1)}%
                  </strong>
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {simResult.winRatesBySeat.map((rate, sIdx) => {
                  const pct = (rate * 100).toFixed(1);
                  const diff = rate - expectedSeatWinRate;
                  return (
                    <div key={sIdx} className="space-y-1">
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-200">
                          Seat {sIdx + 1} (Player {sIdx + 1})
                        </span>
                        <span className="font-mono text-slate-300">
                          {pct}% ({simResult.winsBySeat[sIdx]} wins)
                          {Math.abs(diff) > 0.08 && (
                            <span
                              className={`ml-1.5 ${
                                diff > 0 ? 'text-amber-400' : 'text-rose-400'
                              }`}
                            >
                              ({diff > 0 ? '+' : ''}
                              {(diff * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden relative border border-slate-800">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${Math.min(100, rate * 100)}%` }}
                        />
                        {/* Fair baseline marker */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-amber-400"
                          style={{ left: `${expectedSeatWinRate * 100}%` }}
                          title={`Fair Baseline: ${(
                            expectedSeatWinRate * 100
                          ).toFixed(1)}%`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Victory Condition Breakdown */}
              <div className="pt-3 border-t border-slate-800 space-y-2 text-xs">
                <div className="font-semibold text-slate-200">
                  How Matches Ended (Win / End Conditions)
                </div>
                {Object.entries(simResult.winsByCondition).map(([condName, cnt]) => (
                  <div
                    key={condName}
                    className="flex items-center justify-between text-slate-300 bg-slate-950 px-2.5 py-1.5 rounded border border-slate-800"
                  >
                    <span className="truncate pr-2">{condName}</span>
                    <span className="font-mono text-indigo-300 shrink-0">
                      {cnt} ({((cnt / simResult.totalGames) * 100).toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Win Rate by AI Strategy Archetype */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Strategy Archetype Dominance
                </h3>
                <p className="text-xs text-slate-400">
                  Tests whether one playstyle exploits your game rules
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {Object.entries(simResult.winsByStrategy)
                  .filter(([, data]) => data.games > 0)
                  .sort((a, b) => b[1].winRate - a[1].winRate)
                  .map(([stratName, data]) => {
                    const pct = (data.winRate * 100).toFixed(1);
                    return (
                      <div key={stratName} className="space-y-1">
                        <div className="flex justify-between">
                          <span className="capitalize font-semibold text-slate-200">
                            {stratName} AI
                          </span>
                          <span className="font-mono text-slate-300">
                            {pct}% ({data.wins}/{data.games})
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{
                              width: `${Math.min(100, data.winRate * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Game Length Histogram & Economy Trajectory */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Match Duration Distribution (Rounds)
                </h3>
                <p className="text-xs text-slate-400">
                  Min: {simResult.minRounds} • Median: {simResult.medianRounds} • P90:{' '}
                  {simResult.p90Rounds} • Max: {simResult.maxRounds}
                </p>
              </div>

              {/* Bar Histogram */}
              <div className="flex items-end gap-2 h-32 pt-4 px-2 bg-slate-950 rounded-xl border border-slate-800">
                {simResult.roundHistogram.map((b) => {
                  const maxBucket = Math.max(
                    1,
                    ...simResult.roundHistogram.map((x) => x.count)
                  );
                  const heightPct = Math.round((b.count / maxBucket) * 100);
                  return (
                    <div
                      key={b.bucketLabel}
                      className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
                    >
                      <span className="text-[10px] font-mono text-slate-400">
                        {b.count}
                      </span>
                      <div
                        className="w-full bg-indigo-500/80 rounded-t transition-all"
                        style={{ height: `${Math.max(4, heightPct * 0.75)}%` }}
                      />
                      <span className="text-[10px] text-slate-400 pb-1">
                        {b.bucketLabel}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Resource Economy Snapshot */}
              <div className="space-y-1.5 text-xs pt-2 border-t border-slate-800">
                <div className="font-semibold text-slate-200">
                  Resource Economy Curve (Round 1 vs Mid-Game)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {config.playerStats.map((s) => {
                    const r1 = simResult.economyCurves[0]?.stats[s.id] ?? s.initialValue;
                    const rMid =
                      simResult.economyCurves[
                        Math.min(
                          simResult.economyCurves.length - 1,
                          Math.floor(simResult.economyCurves.length / 2)
                        )
                      ]?.stats[s.id] ?? r1;
                    return (
                      <div
                        key={s.id}
                        className="bg-slate-950 border border-slate-800 rounded p-2 flex items-center justify-between"
                      >
                        <span className="text-slate-300 font-medium">{s.name}</span>
                        <span className="font-mono text-indigo-300">
                          {r1} → {rMid}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Card & Piece Telemetry Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Card Balance Matrix */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 overflow-x-auto">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400" />
                    Card Balance & Win-Rate Correlation Matrix
                  </h3>
                  <p className="text-xs text-slate-400">
                    Spots overpowered cards (high Win Rate Lift) and unplayable dead cards
                  </p>
                </div>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-3">Card Name</th>
                    <th className="py-2 px-2">Cost</th>
                    <th className="py-2 px-2">Drawn</th>
                    <th className="py-2 px-2">Played (%)</th>
                    <th className="py-2 px-2">Win Rate When Played</th>
                    <th className="py-2 pl-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {simResult.cardTelemetry.map((ct) => {
                    const isDead = ct.timesDrawn >= 20 && ct.playRateWhenDrawn < 0.05;
                    const isOP = ct.gamesWherePlayed >= 15 && ct.winRateDelta > 0.14;
                    return (
                      <tr key={ct.cardId} className="hover:bg-slate-950/60">
                        <td className="py-2.5 pr-3 font-semibold text-slate-100">
                          {ct.cardName}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-slate-300">
                          {ct.costSummary}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-slate-400">
                          {ct.timesDrawn}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-slate-200">
                          {ct.timesPlayed} ({(ct.playRateWhenDrawn * 100).toFixed(0)}%)
                        </td>
                        <td className="py-2.5 px-2 font-mono">
                          <span className="text-slate-100 font-semibold">
                            {(ct.winRateWhenPlayed * 100).toFixed(1)}%
                          </span>{' '}
                          <span
                            className={
                              ct.winRateDelta > 0.05
                                ? 'text-emerald-400'
                                : ct.winRateDelta < -0.05
                                ? 'text-rose-400'
                                : 'text-slate-500'
                            }
                          >
                            ({ct.winRateDelta >= 0 ? '+' : ''}
                            {(ct.winRateDelta * 100).toFixed(1)}%)
                          </span>
                        </td>
                        <td className="py-2.5 pl-2">
                          {isDead ? (
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold text-[10px]">
                              DEAD CARD
                            </span>
                          ) : isOP ? (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">
                              OVERPOWERED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px]">
                              BALANCED
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Piece / Unit Combat Telemetry */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 overflow-x-auto">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Piece / Unit Archetype Performance
                </h3>
                <p className="text-xs text-slate-400">
                  Combat K/D ratio, objective captures, and total damage dealt
                </p>
              </div>

              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-2">Piece</th>
                    <th className="py-2 px-2">Kills / Deaths</th>
                    <th className="py-2 px-2">K/D</th>
                    <th className="py-2 px-2">Goal Captures</th>
                    <th className="py-2 pl-2">Dmg Dealt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {simResult.pieceTelemetry.map((pt) => (
                    <tr key={pt.archetypeId} className="hover:bg-slate-950/60">
                      <td className="py-2.5 pr-2 font-semibold text-slate-100">
                        {pt.symbol} {pt.pieceName}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-300">
                        {pt.kills} / {pt.deaths}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-indigo-300 font-semibold">
                        {pt.kdRatio.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-amber-300">
                        {pt.goalCaptures}
                      </td>
                      <td className="py-2.5 pl-2 font-mono text-slate-200">
                        {pt.damageDealt.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Interactive Board Heatmap & Match Replay Debugger */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-400" />
                  Visual Playtest Replay & Board Heatmap Debugger
                </h3>
                <p className="text-xs text-slate-400">
                  Step through notable simulated games turn-by-turn or inspect tile
                  traffic & death choke-points
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                <button
                  onClick={() => setBoardViewMode('replay')}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    boardViewMode === 'replay'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Turn-by-Turn Replay
                </button>
                <button
                  onClick={() => setBoardViewMode('visits')}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    boardViewMode === 'visits'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Space Visitation Heatmap
                </button>
                <button
                  onClick={() => setBoardViewMode('deaths')}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    boardViewMode === 'deaths'
                      ? 'bg-rose-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Unit Death Heatmap
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Board Canvas */}
              <div className="lg:col-span-7">
                <BoardVisualizer
                  board={config.board}
                  pieces={
                    boardViewMode === 'replay' ? activeSnapshot?.pieces || [] : []
                  }
                  heatmapMode={boardViewMode === 'replay' ? 'none' : boardViewMode}
                  heatmapValues={
                    boardViewMode === 'visits'
                      ? simResult.tileVisits
                      : boardViewMode === 'deaths'
                      ? simResult.tileDeaths
                      : undefined
                  }
                />
              </div>

              {/* Right Column: Replay Controls, Live Player Stats & Action Log */}
              <div className="lg:col-span-5 space-y-4 text-xs">
                {/* Match Selector */}
                <div>
                  <label className="block text-slate-400 mb-1">
                    Select Recorded Simulation Match to Inspect:
                  </label>
                  <select
                    value={selectedReplayIdx}
                    onChange={(e) => {
                      setSelectedReplayIdx(parseInt(e.target.value, 10) || 0);
                      setReplayStepIdx(0);
                      setIsAutoPlayingReplay(false);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-semibold"
                  >
                    {simResult.notableGames.map((g, idx) => (
                      <option key={g.gameIndex} value={idx}>
                        {g.label} — {g.winConditionName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Timeline Scrubber */}
                {activeReplay && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsAutoPlayingReplay(false);
                            setReplayStepIdx((p) => Math.max(0, p - 1));
                          }}
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
                        >
                          <SkipBack className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setIsAutoPlayingReplay(!isAutoPlayingReplay)
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer"
                        >
                          {isAutoPlayingReplay ? (
                            <>
                              <Pause className="w-3.5 h-3.5" /> Pause
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" /> Auto-Play Logs
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setIsAutoPlayingReplay(false);
                            setReplayStepIdx((p) =>
                              Math.min(activeReplay.snapshots.length - 1, p + 1)
                            );
                          }}
                          className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
                        >
                          <SkipForward className="w-4 h-4" />
                        </button>

                        <select
                          value={replaySpeedMs}
                          onChange={(e) =>
                            setReplaySpeedMs(parseInt(e.target.value, 10))
                          }
                          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 font-semibold"
                          title="Replay & Log Printing Speed"
                        >
                          <option value={1500}>🐢 Slow (1.5s)</option>
                          <option value={800}>🚶 Normal (0.8s)</option>
                          <option value={300}>⚡ Fast (0.3s)</option>
                        </select>
                      </div>

                      <span className="font-mono text-slate-300">
                        Step {replayStepIdx + 1} / {activeReplay.snapshots.length}{' '}
                        (Round {activeSnapshot?.round || 1})
                      </span>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, activeReplay.snapshots.length - 1)}
                      value={replayStepIdx}
                      onChange={(e) => {
                        setIsAutoPlayingReplay(false);
                        setReplayStepIdx(parseInt(e.target.value, 10) || 0);
                      }}
                      className="w-full"
                    />
                  </div>
                )}

                {/* Player State Cards at Current Turn Snapshot */}
                {activeSnapshot && (
                  <div className="space-y-2">
                    <div className="font-semibold text-slate-200">
                      Player States at Round {activeSnapshot.round} (Active: P
                      {activeSnapshot.activePlayerIndex + 1})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeSnapshot.players.map((p) => (
                        <div
                          key={p.playerIndex}
                          className={`p-3 rounded-lg border ${
                            p.playerIndex === activeSnapshot.activePlayerIndex
                              ? 'bg-indigo-950/40 border-indigo-500/50'
                              : 'bg-slate-950 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-slate-100">
                              {p.name} ({p.strategy})
                            </span>
                            <span className="text-[11px] text-slate-400">
                              Hand: {p.hand.length} cards
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(p.stats).map(([stKey, stVal]) => (
                              <span
                                key={stKey}
                                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-200"
                              >
                                {stKey.toUpperCase()}:{' '}
                                <strong className="text-indigo-300">{stVal}</strong>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Turn Action & Trigger Log (Full Single-Game Transcript or Current Step) */}
                {activeReplay && activeSnapshot && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-200">
                        Single-Game Action & Rule Trigger Log
                      </div>
                      <div className="flex items-center gap-1 text-[11px]">
                        <button
                          onClick={() => setShowFullGameLog(true)}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                            showFullGameLog
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Full Game ({activeReplay.snapshots.length} Turns)
                        </button>
                        <button
                          onClick={() => setShowFullGameLog(false)}
                          className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                            !showFullGameLog
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Step {replayStepIdx + 1} Only
                        </button>
                      </div>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1.5 font-mono text-[11px]">
                      {showFullGameLog ? (
                        activeReplay.snapshots.map((snap, sIdx) => {
                          const isCurrentStep = sIdx === replayStepIdx;
                          return (
                            <div
                              key={sIdx}
                              onClick={() => {
                                setIsAutoPlayingReplay(false);
                                setReplayStepIdx(sIdx);
                              }}
                              className={`p-2 rounded-lg border cursor-pointer transition-colors ${
                                isCurrentStep
                                  ? 'bg-indigo-950/60 border-indigo-400'
                                  : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center justify-between text-[10px] text-indigo-300 font-bold mb-1">
                                <span>
                                  [Step {sIdx + 1}] Round {snap.round} • Player{' '}
                                  {snap.activePlayerIndex + 1}'s Turn
                                </span>
                                {isCurrentStep && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200">
                                    VIEWING
                                  </span>
                                )}
                              </div>
                              {snap.events.length === 0 ? (
                                <div className="text-slate-500 italic">
                                  • Upkeep / Draw (No unit or card actions)
                                </div>
                              ) : (
                                snap.events.map((ev, eIdx) => (
                                  <div
                                    key={eIdx}
                                    className={`py-0.5 ${
                                      ev.includes('CRITICAL LOOP')
                                        ? 'text-rose-300 font-bold'
                                        : ev.includes('Rule Triggered')
                                        ? 'text-amber-300'
                                        : 'text-slate-200'
                                    }`}
                                  >
                                    • {ev}
                                  </div>
                                ))
                              )}
                            </div>
                          );
                        })
                      ) : activeSnapshot.events.length === 0 ? (
                        <div className="text-slate-500 italic">
                          No special events logged on this step.
                        </div>
                      ) : (
                        activeSnapshot.events.map((ev, idx) => (
                          <div
                            key={idx}
                            className={`px-2 py-1 rounded ${
                              ev.includes('CRITICAL LOOP')
                                ? 'bg-rose-950 text-rose-300 border border-rose-500/40 font-bold'
                                : ev.includes('Rule Triggered')
                                ? 'bg-amber-950/40 text-amber-300'
                                : 'bg-slate-900 text-slate-300'
                            }`}
                          >
                            • {ev}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
