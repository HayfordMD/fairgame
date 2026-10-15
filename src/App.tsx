import React, { useEffect, useState } from 'react';
import {
  Map as MapIcon,
  Shield,
  Layers,
  ScrollText,
  Flame,
  Upload,
  Download,
  Undo2,
  Play,
  Sparkles,
  AlertOctagon,
} from 'lucide-react';
import {
  DiagnosticPatch,
  GameConfig,
  SimulationBatchSummary,
} from './types/game';
import { PRESET_GAMES } from './data/presets';
import { runMonteCarloBatch } from './engine/simulator';
import { validateAndNormalizeGameJSON } from './utils/importers';
import { BoardCreatorTab } from './components/BoardCreatorTab';
import { PiecesAndStatsTab } from './components/PiecesAndStatsTab';
import { CardsAndDecksTab } from './components/CardsAndDecksTab';
import { RulesAndTurnsTab } from './components/RulesAndTurnsTab';
import { SimulationStudioTab } from './components/SimulationStudioTab';

type StudioTab = 'board' | 'pieces_stats' | 'cards' | 'rules_turns' | 'simulation';

export function App() {
  const [config, setConfig] = useState<GameConfig>(() => {
    const saved = localStorage.getItem('fairgame_active_config_v1');
    if (saved) {
      try {
        return validateAndNormalizeGameJSON(JSON.parse(saved), PRESET_GAMES[0]);
      } catch {
        return PRESET_GAMES[0];
      }
    }
    return PRESET_GAMES[0];
  });

  const [history, setHistory] = useState<GameConfig[]>([]);
  const [activeTab, setActiveTab] = useState<StudioTab>('simulation');
  const [simResult, setSimResult] = useState<SimulationBatchSummary | null>(null);
  const [prevSimResult, setPrevSimResult] = useState<SimulationBatchSummary | null>(
    null
  );
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [simProgress, setSimProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 1000 });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    try {
      localStorage.setItem('fairgame_active_config_v1', JSON.stringify(config));
    } catch {
      // Ignore storage quota if large background image is embedded
    }
  }, [config]);

  // Run an initial 1,000-game simulation on load so the user immediately sees live diagnostics
  useEffect(() => {
    handleRunSimulation(1000, true, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateConfigWithHistory = (patchOrFull: Partial<GameConfig> | GameConfig) => {
    setHistory((prev) => [...prev.slice(-14), config]);
    const nextConfig: GameConfig =
      'id' in patchOrFull && 'board' in patchOrFull && 'turnConfig' in patchOrFull
        ? (patchOrFull as GameConfig)
        : { ...config, ...patchOrFull };
    setConfig(nextConfig);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setConfig(previous);
    showToast('Reverted to previous game configuration');
  };

  const handleSelectPreset = (presetId: string) => {
    const found = PRESET_GAMES.find((p) => p.id === presetId);
    if (!found) return;
    const cloned = JSON.parse(JSON.stringify(found)) as GameConfig;
    updateConfigWithHistory(cloned);
    setPrevSimResult(null);
    handleRunSimulation(1000, true, cloned);
    showToast(`Loaded template "${cloned.name}" & ran 1,000 simulations`);
  };

  const handleRunSimulation = async (
    count: number,
    randomizeStrategies: boolean,
    targetConfig: GameConfig = config
  ) => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimProgress({ completed: 0, total: count });

    try {
      const summary = await runMonteCarloBatch(
        targetConfig,
        count,
        randomizeStrategies,
        (completed, total) => {
          setSimProgress({ completed, total });
        }
      );
      setSimResult((current) => {
        if (current) setPrevSimResult(current);
        return summary;
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const handleApplyPatchAndSimulate = async (
    patch: DiagnosticPatch,
    count: number,
    randomizeStrategies: boolean
  ) => {
    const patchedConfig = patch.apply(config);
    updateConfigWithHistory(patchedConfig);
    showToast(`Applied Rule Fix: "${patch.label}" — Re-running simulations...`);
    await handleRunSimulation(count, randomizeStrategies, patchedConfig);
  };

  const handleUploadFullGameJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        try {
          const parsed = JSON.parse(reader.result);
          const valid = validateAndNormalizeGameJSON(parsed, config);
          updateConfigWithHistory(valid);
          showToast(`Imported full game project "${valid.name}"`);
          handleRunSimulation(1000, true, valid);
        } catch (err) {
          showToast(
            `Failed to parse JSON: ${
              err instanceof Error ? err.message : 'Invalid format'
            }`
          );
        }
      }
    };
    reader.readAsText(file);
  };

  const handleExportFullGameJSON = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_game_plan.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const criticalIssuesCount =
    simResult?.issues.filter((i) => i.severity === 'critical').length || 0;
  const totalIssuesCount = simResult?.issues.length || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Studio Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          {/* Brand & Editable Game Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                  FairGame Studio
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-[11px] text-slate-400">
                  Tabletop Game Architect & Monte Carlo Simulator
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  type="text"
                  value={config.name}
                  onChange={(e) =>
                    updateConfigWithHistory({ name: e.target.value })
                  }
                  className="bg-transparent text-base font-extrabold text-white border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right Controls: Presets, JSON Upload/Download, Undo, Quick Sim */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Template Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
              <span className="text-slate-400">Template:</span>
              <select
                value={
                  PRESET_GAMES.some((p) => p.id === config.id)
                    ? config.id
                    : 'custom'
                }
                onChange={(e) => handleSelectPreset(e.target.value)}
                className="bg-transparent text-slate-100 font-semibold focus:outline-none cursor-pointer"
              >
                {PRESET_GAMES.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900">
                    {p.name}
                  </option>
                ))}
                {!PRESET_GAMES.some((p) => p.id === config.id) && (
                  <option value="custom" className="bg-slate-900">
                    Custom Uploaded Game
                  </option>
                )}
              </select>
            </div>

            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 cursor-pointer"
              title="Undo Last Configuration Edit"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo ({history.length})</span>
            </button>

            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium cursor-pointer border border-slate-700">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>Upload Game (.json)</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleUploadFullGameJSON}
              />
            </label>

            <button
              onClick={handleExportFullGameJSON}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium border border-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Save Game (.json)</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('simulation');
                handleRunSimulation(1000, true);
              }}
              disabled={isSimulating}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Simulate 1,000x</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 flex items-center gap-1 overflow-x-auto border-t border-slate-800/70 bg-slate-950/50">
          {(
            [
              {
                id: 'board',
                label: '1. Board Creator',
                sub: `${config.board.tiles.length} Spaces`,
                Icon: MapIcon,
              },
              {
                id: 'pieces_stats',
                label: '2. Pieces & Stats',
                sub: `${config.pieces.length} Units • ${config.playerStats.length} Stats`,
                Icon: Shield,
              },
              {
                id: 'cards',
                label: '3. Cards & Decks',
                sub: `${config.cards.length} Cards`,
                Icon: Layers,
              },
              {
                id: 'rules_turns',
                label: '4. Rules & Turn Order',
                sub: `${config.turnConfig.phases.filter((p) => p.enabled).length} Phases • ${config.rules.length} Triggers`,
                Icon: ScrollText,
              },
              {
                id: 'simulation',
                label: '5. Simulation & Diagnostics',
                sub: simResult
                  ? `Health ${simResult.healthScore}/100`
                  : 'Run Monte Carlo',
                Icon: Flame,
                badgeCount: totalIssuesCount,
                hasCritical: criticalIssuesCount > 0,
              },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.Icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-3 border-b-2 text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-indigo-500 text-white bg-indigo-950/30'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                <Icon
                  className={`w-4 h-4 ${
                    active ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                />
                <div className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span>{tab.label}</span>
                    {'badgeCount' in tab && tab.badgeCount ? (
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                          tab.hasCritical
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        }`}
                      >
                        {tab.hasCritical && <AlertOctagon className="w-2.5 h-2.5" />}
                        {tab.badgeCount}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[10px] font-normal text-slate-500">
                    {tab.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-indigo-950 border border-indigo-400 text-indigo-100 px-4 py-3 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'board' && (
          <BoardCreatorTab
            config={config}
            onChangeBoard={(newBoard) =>
              updateConfigWithHistory({ board: newBoard })
            }
          />
        )}

        {activeTab === 'pieces_stats' && (
          <PiecesAndStatsTab
            config={config}
            onUpdateConfig={updateConfigWithHistory}
          />
        )}

        {activeTab === 'cards' && (
          <CardsAndDecksTab
            config={config}
            onUpdateConfig={updateConfigWithHistory}
          />
        )}

        {activeTab === 'rules_turns' && (
          <RulesAndTurnsTab
            config={config}
            onUpdateConfig={updateConfigWithHistory}
          />
        )}

        {activeTab === 'simulation' && (
          <SimulationStudioTab
            config={config}
            simResult={simResult}
            prevSimResult={prevSimResult}
            isRunning={isSimulating}
            progress={simProgress}
            onRunSimulation={(count, rand) => handleRunSimulation(count, rand)}
            onApplyPatchAndSimulate={handleApplyPatchAndSimulate}
          />
        )}
      </main>
    </div>
  );
}

export default App;
