import React, { useState } from 'react';
import {
  Clock,
  Trophy,
  Zap,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Code2,
  Users,
  Dices,
} from 'lucide-react';
import {
  AIArchetype,
  ComparisonOperator,
  GameConfig,
  RuleAction,
  RuleTrigger,
  RuleTriggerEvent,
  TileType,
  TurnConfig,
  TurnPhaseType,
  WinCondition,
  WinConditionType,
} from '../types/game';
import { parseRulesScript } from '../utils/importers';

interface RulesAndTurnsTabProps {
  config: GameConfig;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
}

const TRIGGER_EVENTS: { id: RuleTriggerEvent; label: string }[] = [
  { id: 'ON_GAME_START', label: 'When Game Starts' },
  { id: 'ON_TURN_START', label: 'At Start of Player Turn' },
  { id: 'ON_MOVE', label: 'Whenever a Unit Moves' },
  { id: 'ON_LAND_TILE', label: 'When a Unit Lands on a Space' },
  { id: 'ON_COMBAT', label: 'When Combat / Attack Occurs' },
  { id: 'ON_CARD_PLAY', label: 'When a Card is Played' },
  { id: 'ON_PIECE_DEATH', label: 'When a Unit is Defeated' },
  { id: 'ON_TURN_END', label: 'At End of Player Turn' },
  { id: 'ON_ROUND_END', label: 'At End of Full Round' },
];

export const RulesAndTurnsTab: React.FC<RulesAndTurnsTabProps> = ({
  config,
  onUpdateConfig,
}) => {
  const { turnConfig, winConditions, rules } = config;
  const [scriptText, setScriptText] = useState(
    `# Write or paste rules in FairGame Script DSL:\nWHEN ON_LAND_TILE IF tile.type == "boost" THEN player.mana += 2\nWHEN ON_COMBAT THEN player.gold += 1\nWIN WHEN player.vp >= 15\nLOSE WHEN player.hp <= 0`
  );
  const [scriptMsg, setScriptMsg] = useState<string | null>(null);

  const updateTurnConfig = (patch: Partial<TurnConfig>) => {
    const next = { ...turnConfig, ...patch };
    if (patch.playerCount !== undefined) {
      const strategies = [...next.playerStrategies];
      while (strategies.length < patch.playerCount) {
        strategies.push('balanced');
      }
      next.playerStrategies = strategies.slice(0, patch.playerCount);
    }
    onUpdateConfig({ turnConfig: next });
  };

  const handleMovePhase = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= turnConfig.phases.length) return;
    const copy = [...turnConfig.phases];
    const tmp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = tmp;
    updateTurnConfig({ phases: copy });
  };

  const handleAddPhase = (type: TurnPhaseType) => {
    const labels: Record<TurnPhaseType, string> = {
      upkeep: 'Upkeep & Regen Phase',
      draw: 'Draw Cards Phase',
      roll_and_move: 'Roll Dice & Move Phase',
      play_cards: 'Play Cards Phase',
      action_points: 'Command Units (AP) Phase',
      combat: 'Mandatory Combat Phase',
      end_turn: 'End of Turn Scoring Phase',
    };
    updateTurnConfig({
      phases: [
        ...turnConfig.phases,
        {
          id: `ph_${Date.now().toString().slice(-4)}`,
          name: labels[type],
          type,
          enabled: true,
          maxCardsToPlay: 2,
          description: `Custom ${labels[type]}`,
        },
      ],
    });
  };

  const handleAddWinCondition = (isLoss = false) => {
    const newWc: WinCondition = {
      id: `wc_${Date.now().toString().slice(-4)}`,
      name: isLoss ? 'Player Eliminated Condition' : 'New Victory Condition',
      enabled: true,
      type: 'stat_threshold',
      statId: isLoss ? 'hp' : 'vp',
      operator: isLoss ? '<=' : '>=',
      targetValue: isLoss ? 0 : 12,
      isLossCondition: isLoss,
      description: isLoss
        ? 'Player is eliminated when condition is met.'
        : 'Player wins the game when condition is met.',
    };
    onUpdateConfig({ winConditions: [...winConditions, newWc] });
  };

  const handleAddRule = () => {
    const newRule: RuleTrigger = {
      id: `rule_${Date.now().toString().slice(-4)}`,
      name: `Custom Rule #${rules.length + 1}`,
      enabled: true,
      trigger: 'ON_LAND_TILE',
      conditionType: 'tile_type',
      conditionTileType: 'boost',
      actions: [
        {
          id: `act_${Date.now()}`,
          type: 'modify_stat',
          statId: 'vp',
          operation: 'add',
          value: 1,
        },
      ],
      maxTriggersPerTurn: 2,
      description: 'Grants +1 VP when landing on a Boost space.',
    };
    onUpdateConfig({ rules: [...rules, newRule] });
  };

  const handleCompileScript = () => {
    const parsed = parseRulesScript(scriptText);
    if (parsed.rules.length === 0 && parsed.winConditions.length === 0) {
      setScriptMsg('No valid WHEN or WIN/LOSE statements found in script.');
      return;
    }
    onUpdateConfig({
      rules: [...rules, ...parsed.rules],
      winConditions: [...winConditions, ...parsed.winConditions],
    });
    setScriptMsg(
      `Compiled & added ${parsed.rules.length} rule trigger(s) and ${parsed.winConditions.length} win/loss condition(s)!`
    );
    setTimeout(() => setScriptMsg(null), 4500);
  };

  return (
    <div className="space-y-8">
      {/* SECTION 1: Turn Information, Player Setup & Phase Sequencer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Turn Parameters & Player AI Seats */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-400" />
                Turn Parameters & Table Setup
              </h3>
              <p className="text-xs text-slate-400">
                Configure players, hand limits, dice, AP, and turn caps
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <label className="flex items-center gap-1 text-slate-400 mb-1">
                <Users className="w-3.5 h-3.5 text-indigo-400" /> Players (1-6)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={turnConfig.playerCount}
                onChange={(e) =>
                  updateTurnConfig({
                    playerCount: Math.max(
                      1,
                      Math.min(6, parseInt(e.target.value, 10) || 2)
                    ),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-semibold"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <label className="block text-slate-400 mb-1">
                Max Rounds Cap
              </label>
              <input
                type="number"
                min={5}
                max={200}
                value={turnConfig.maxTurns}
                onChange={(e) =>
                  updateTurnConfig({
                    maxTurns: Math.max(5, parseInt(e.target.value, 10) || 30),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-semibold"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <label className="block text-slate-400 mb-1">
                Action Points / Turn
              </label>
              <input
                type="number"
                min={1}
                max={15}
                value={turnConfig.actionPointsPerTurn}
                onChange={(e) =>
                  updateTurnConfig({
                    actionPointsPerTurn: Math.max(
                      1,
                      parseInt(e.target.value, 10) || 1
                    ),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-semibold"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <label className="block text-slate-400 mb-1">
                Starting Hand Size
              </label>
              <input
                type="number"
                min={0}
                max={12}
                value={turnConfig.startingHandSize}
                onChange={(e) =>
                  updateTurnConfig({
                    startingHandSize: Math.max(
                      0,
                      parseInt(e.target.value, 10) || 0
                    ),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-semibold"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <label className="block text-slate-400 mb-1">Max Hand Limit</label>
              <input
                type="number"
                min={1}
                max={20}
                value={turnConfig.maxHandSize}
                onChange={(e) =>
                  updateTurnConfig({
                    maxHandSize: Math.max(1, parseInt(e.target.value, 10) || 5),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-slate-100 font-semibold"
              />
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
              <label className="flex items-center gap-1 text-slate-400 mb-1">
                <Dices className="w-3.5 h-3.5 text-amber-400" /> Dice Roll
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={turnConfig.diceCount}
                  onChange={(e) =>
                    updateTurnConfig({
                      diceCount: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                  className="w-10 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
                />
                <span className="text-slate-400 font-bold">d</span>
                <select
                  value={turnConfig.diceSides}
                  onChange={(e) =>
                    updateTurnConfig({
                      diceSides: parseInt(e.target.value, 10) || 6,
                    })
                  }
                  className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-100 flex-1"
                >
                  <option value={4}>4</option>
                  <option value={6}>6</option>
                  <option value={8}>8</option>
                  <option value={10}>10</option>
                  <option value={12}>12</option>
                  <option value={20}>20</option>
                </select>
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2.5 bg-indigo-950/30 border border-indigo-500/30 rounded-lg p-3 text-xs text-indigo-200 cursor-pointer">
            <input
              type="checkbox"
              checked={turnConfig.firstPlayerAdvantageMitigation}
              onChange={(e) =>
                updateTurnConfig({
                  firstPlayerAdvantageMitigation: e.target.checked,
                })
              }
              className="rounded border-slate-700"
            />
            <div>
              <div className="font-semibold">
                First-Player Advantage Catch-Up Rule
              </div>
              <div className="text-[11px] text-slate-400">
                Players going 2nd or later start Turn 1 with +1 bonus resource (Mana/Gold).
              </div>
            </div>
          </label>

          {/* Default AI Strategy per Seat */}
          <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
            <div className="font-semibold text-slate-200">
              Default AI Playtester Personalities by Seat
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: turnConfig.playerCount }, (_, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5"
                >
                  <span className="text-slate-400 font-medium">P{idx + 1}:</span>
                  <select
                    value={turnConfig.playerStrategies[idx] || 'balanced'}
                    onChange={(e) => {
                      const next = [...turnConfig.playerStrategies];
                      next[idx] = e.target.value as AIArchetype;
                      updateTurnConfig({ playerStrategies: next });
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                  >
                    <option value="balanced">Balanced / Smart</option>
                    <option value="rusher">Objective Rusher</option>
                    <option value="aggressive">Aggressive Combat</option>
                    <option value="economic">Greedy / Economic</option>
                    <option value="defensive">Defensive / Turtle</option>
                    <option value="random">Random Fuzzing</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Turn Phase Sequence Builder */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Turn Phase Sequence ({turnConfig.phases.filter((p) => p.enabled).length}{' '}
                Active Phases)
              </h3>
              <p className="text-xs text-slate-400">
                Order the exact phases executed during each player's turn
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddPhase(e.target.value as TurnPhaseType);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-3 py-1.5 font-medium cursor-pointer"
              >
                <option value="" disabled>
                  + Add Turn Phase...
                </option>
                <option value="upkeep">Upkeep & Regen</option>
                <option value="draw">Draw Cards</option>
                <option value="roll_and_move">Roll Dice & Move</option>
                <option value="play_cards">Play Cards from Hand</option>
                <option value="action_points">Command Units (Spend AP)</option>
                <option value="combat">Mandatory Combat</option>
                <option value="end_turn">End of Turn Scoring</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            {turnConfig.phases.map((phase, idx) => (
              <div
                key={phase.id}
                className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border text-xs transition-all ${
                  phase.enabled
                    ? 'bg-slate-950 border-slate-800 text-slate-100'
                    : 'bg-slate-950/40 border-slate-900 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <input
                    type="checkbox"
                    checked={phase.enabled}
                    onChange={(e) => {
                      const next = [...turnConfig.phases];
                      next[idx] = { ...phase, enabled: e.target.checked };
                      updateTurnConfig({ phases: next });
                    }}
                    className="rounded border-slate-700"
                  />
                  <div>
                    <input
                      type="text"
                      value={phase.name}
                      onChange={(e) => {
                        const next = [...turnConfig.phases];
                        next[idx] = { ...phase, name: e.target.value };
                        updateTurnConfig({ phases: next });
                      }}
                      className="bg-transparent font-semibold text-slate-100 focus:outline-none"
                    />
                    <div className="text-[11px] text-slate-400">
                      Type:{' '}
                      <code className="text-indigo-300">{phase.type}</code> —{' '}
                      {phase.description}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {phase.type === 'play_cards' && (
                    <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded border border-slate-800">
                      <span className="text-slate-400">Max Cards:</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={phase.maxCardsToPlay ?? 2}
                        onChange={(e) => {
                          const next = [...turnConfig.phases];
                          next[idx] = {
                            ...phase,
                            maxCardsToPlay: Math.max(
                              1,
                              parseInt(e.target.value, 10) || 1
                            ),
                          };
                          updateTurnConfig({ phases: next });
                        }}
                        className="w-10 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-slate-100"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => handleMovePhase(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30"
                    title="Move Phase Up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleMovePhase(idx, 1)}
                    disabled={idx === turnConfig.phases.length - 1}
                    className="p-1 text-slate-400 hover:text-slate-200 disabled:opacity-30"
                    title="Move Phase Down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      updateTurnConfig({
                        phases: turnConfig.phases.filter((_, i) => i !== idx),
                      })
                    }
                    className="p-1 text-slate-500 hover:text-rose-400"
                    title="Remove Phase"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SECTION 2: Victory & Elimination Conditions */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Victory & Player Elimination Conditions ({winConditions.length})
            </h3>
            <p className="text-xs text-slate-400">
              Define how players win the game or get knocked out
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddWinCondition(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-500/30 rounded-lg text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Loss / Elimination Rule
            </button>
            <button
              onClick={() => handleAddWinCondition(false)}
              className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Victory Condition
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {winConditions.map((wc, idx) => (
            <div
              key={wc.id}
              className={`p-4 rounded-xl border text-xs space-y-3 ${
                wc.isLossCondition
                  ? 'bg-rose-950/15 border-rose-500/30'
                  : 'bg-slate-950 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={wc.enabled}
                    onChange={(e) => {
                      const next = [...winConditions];
                      next[idx] = { ...wc, enabled: e.target.checked };
                      onUpdateConfig({ winConditions: next });
                    }}
                    className="rounded border-slate-700"
                  />
                  <span
                    className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                      wc.isLossCondition
                        ? 'bg-rose-500/20 text-rose-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {wc.isLossCondition ? 'ELIMINATION' : 'VICTORY'}
                  </span>
                  <input
                    type="text"
                    value={wc.name}
                    onChange={(e) => {
                      const next = [...winConditions];
                      next[idx] = { ...wc, name: e.target.value };
                      onUpdateConfig({ winConditions: next });
                    }}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 font-semibold text-slate-100"
                  />
                </div>
                <button
                  onClick={() =>
                    onUpdateConfig({
                      winConditions: winConditions.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={wc.type}
                  onChange={(e) => {
                    const next = [...winConditions];
                    next[idx] = {
                      ...wc,
                      type: e.target.value as WinConditionType,
                    };
                    onUpdateConfig({ winConditions: next });
                  }}
                  className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                >
                  <option value="stat_threshold">Player Stat Threshold</option>
                  <option value="reach_goal_tile">Unit Reaches Goal Space</option>
                  <option value="control_goal_tiles">Control N Goal Spaces</option>
                  <option value="eliminate_all_enemies">
                    Eliminate All Enemy Units
                  </option>
                  <option value="last_player_standing">
                    Last Player Standing
                  </option>
                  <option value="highest_stat_at_max_turns">
                    Highest Stat at Max Turns (Tiebreaker)
                  </option>
                </select>

                {(wc.type === 'stat_threshold' ||
                  wc.type === 'highest_stat_at_max_turns') && (
                  <select
                    value={wc.statId || 'vp'}
                    onChange={(e) => {
                      const next = [...winConditions];
                      next[idx] = { ...wc, statId: e.target.value };
                      onUpdateConfig({ winConditions: next });
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                  >
                    {config.playerStats.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}

                {wc.type === 'stat_threshold' && (
                  <>
                    <select
                      value={wc.operator || '>='}
                      onChange={(e) => {
                        const next = [...winConditions];
                        next[idx] = {
                          ...wc,
                          operator: e.target.value as ComparisonOperator,
                        };
                        onUpdateConfig({ winConditions: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    >
                      <option value=">=">&gt;=</option>
                      <option value="<=">&lt;=</option>
                      <option value="==">==</option>
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                    </select>
                    <input
                      type="number"
                      value={wc.targetValue ?? 10}
                      onChange={(e) => {
                        const next = [...winConditions];
                        next[idx] = {
                          ...wc,
                          targetValue: parseFloat(e.target.value) || 0,
                        };
                        onUpdateConfig({ winConditions: next });
                      }}
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: Event-Driven Rule Triggers + DSL Script Compiler */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                Event-Driven Rule Triggers ({rules.length})
              </h3>
              <p className="text-xs text-slate-400">
                WHEN [Event] IF [Condition] THEN [Execute Game Actions]
              </p>
            </div>
            <button
              onClick={handleAddRule}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Rule Trigger
            </button>
          </div>

          <div className="space-y-3">
            {rules.map((rule, rIdx) => {
              const isUncapped = rule.maxTriggersPerTurn === 0;
              return (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border text-xs space-y-3 ${
                    isUncapped
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => {
                          const next = [...rules];
                          next[rIdx] = { ...rule, enabled: e.target.checked };
                          onUpdateConfig({ rules: next });
                        }}
                        className="rounded border-slate-700"
                      />
                      <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => {
                          const next = [...rules];
                          next[rIdx] = { ...rule, name: e.target.value };
                          onUpdateConfig({ rules: next });
                        }}
                        className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 font-semibold text-slate-100 w-56"
                      />
                      {isUncapped && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] font-medium">
                          <AlertTriangle className="w-3 h-3" /> Uncapped (Loop Risk!)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Max/Turn (0=∞):</span>
                      <input
                        type="number"
                        min={0}
                        max={25}
                        value={rule.maxTriggersPerTurn}
                        onChange={(e) => {
                          const next = [...rules];
                          next[rIdx] = {
                            ...rule,
                            maxTriggersPerTurn: Math.max(
                              0,
                              parseInt(e.target.value, 10) || 0
                            ),
                          };
                          onUpdateConfig({ rules: next });
                        }}
                        className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
                      />
                      <button
                        onClick={() =>
                          onUpdateConfig({
                            rules: rules.filter((_, i) => i !== rIdx),
                          })
                        }
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Trigger & Condition Row */}
                  <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="font-bold text-indigo-400">WHEN</span>
                    <select
                      value={rule.trigger}
                      onChange={(e) => {
                        const next = [...rules];
                        next[rIdx] = {
                          ...rule,
                          trigger: e.target.value as RuleTriggerEvent,
                        };
                        onUpdateConfig({ rules: next });
                      }}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                    >
                      {TRIGGER_EVENTS.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.label} ({ev.id})
                        </option>
                      ))}
                    </select>

                    <span className="font-bold text-amber-400">IF</span>
                    <select
                      value={rule.conditionType}
                      onChange={(e) => {
                        const next = [...rules];
                        next[rIdx] = {
                          ...rule,
                          conditionType: e.target
                            .value as RuleTrigger['conditionType'],
                        };
                        onUpdateConfig({ rules: next });
                      }}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                    >
                      <option value="always">Always</option>
                      <option value="tile_type">Space Type Equals</option>
                      <option value="stat_compare">Player Stat Comparison</option>
                      <option value="turn_compare">Round Number Comparison</option>
                      <option value="custom_expr">Custom Expression</option>
                    </select>

                    {rule.conditionType === 'tile_type' && (
                      <select
                        value={rule.conditionTileType || 'boost'}
                        onChange={(e) => {
                          const next = [...rules];
                          next[rIdx] = {
                            ...rule,
                            conditionTileType: e.target.value as TileType,
                          };
                          onUpdateConfig({ rules: next });
                        }}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                      >
                        <option value="goal">Goal Space</option>
                        <option value="boost">Boost Space</option>
                        <option value="hazard">Hazard Space</option>
                        <option value="shop">Shop Space</option>
                        <option value="checkpoint">Checkpoint Space</option>
                        <option value="normal">Normal Space</option>
                      </select>
                    )}

                    {rule.conditionType === 'stat_compare' && (
                      <>
                        <select
                          value={rule.conditionStatId || 'gold'}
                          onChange={(e) => {
                            const next = [...rules];
                            next[rIdx] = {
                              ...rule,
                              conditionStatId: e.target.value,
                            };
                            onUpdateConfig({ rules: next });
                          }}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        >
                          {config.playerStats.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={rule.conditionOperator || '>='}
                          onChange={(e) => {
                            const next = [...rules];
                            next[rIdx] = {
                              ...rule,
                              conditionOperator: e.target
                                .value as ComparisonOperator,
                            };
                            onUpdateConfig({ rules: next });
                          }}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                        >
                          <option value=">=">&gt;=</option>
                          <option value="<=">&lt;=</option>
                          <option value="==">==</option>
                        </select>
                        <input
                          type="number"
                          value={rule.conditionValue ?? 5}
                          onChange={(e) => {
                            const next = [...rules];
                            next[rIdx] = {
                              ...rule,
                              conditionValue: parseFloat(e.target.value) || 0,
                            };
                            onUpdateConfig({ rules: next });
                          }}
                          className="w-14 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
                        />
                      </>
                    )}

                    {rule.conditionType === 'custom_expr' && (
                      <input
                        type="text"
                        placeholder="player.gold >= 5 && turn >= 2"
                        value={rule.customConditionExpr || ''}
                        onChange={(e) => {
                          const next = [...rules];
                          next[rIdx] = {
                            ...rule,
                            customConditionExpr: e.target.value,
                          };
                          onUpdateConfig({ rules: next });
                        }}
                        className="font-mono bg-slate-950 border border-slate-700 rounded px-2 py-1 text-indigo-200 flex-1"
                      />
                    )}
                  </div>

                  {/* Rule Actions */}
                  <div className="space-y-1.5">
                    {rule.actions.map((act, aIdx) => (
                      <div
                        key={act.id}
                        className="flex flex-wrap items-center gap-2 bg-slate-900/50 px-2.5 py-1.5 rounded border border-slate-800/80"
                      >
                        <span className="font-bold text-emerald-400">THEN</span>
                        <select
                          value={act.type}
                          onChange={(e) => {
                            const nextRules = [...rules];
                            const nextActs = [...rule.actions];
                            nextActs[aIdx] = {
                              ...act,
                              type: e.target.value as RuleAction['type'],
                            };
                            nextRules[rIdx] = { ...rule, actions: nextActs };
                            onUpdateConfig({ rules: nextRules });
                          }}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                        >
                          <option value="modify_stat">Modify Player Stat</option>
                          <option value="move_forward">
                            Advance Unit Forward (+Spaces)
                          </option>
                          <option value="damage_active_piece">
                            Damage Active Unit
                          </option>
                          <option value="heal_active_piece">
                            Heal Active Unit
                          </option>
                          <option value="draw_card">Draw Extra Card(s)</option>
                          <option value="custom_formula">
                            Execute Custom Formula
                          </option>
                        </select>

                        {act.type === 'modify_stat' && (
                          <>
                            <select
                              value={act.statId || 'vp'}
                              onChange={(e) => {
                                const nextRules = [...rules];
                                const nextActs = [...rule.actions];
                                nextActs[aIdx] = {
                                  ...act,
                                  statId: e.target.value,
                                };
                                nextRules[rIdx] = { ...rule, actions: nextActs };
                                onUpdateConfig({ rules: nextRules });
                              }}
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                            >
                              {config.playerStats.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                            <select
                              value={act.operation || 'add'}
                              onChange={(e) => {
                                const nextRules = [...rules];
                                const nextActs = [...rule.actions];
                                nextActs[aIdx] = {
                                  ...act,
                                  operation: e.target.value as
                                    | 'add'
                                    | 'subtract'
                                    | 'set',
                                };
                                nextRules[rIdx] = { ...rule, actions: nextActs };
                                onUpdateConfig({ rules: nextRules });
                              }}
                              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
                            >
                              <option value="add">+</option>
                              <option value="subtract">-</option>
                              <option value="set">=</option>
                            </select>
                          </>
                        )}

                        {act.type === 'custom_formula' ? (
                          <input
                            type="text"
                            placeholder="player.vp += 1; player.gold -= 2"
                            value={act.formula || ''}
                            onChange={(e) => {
                              const nextRules = [...rules];
                              const nextActs = [...rule.actions];
                              nextActs[aIdx] = {
                                ...act,
                                formula: e.target.value,
                              };
                              nextRules[rIdx] = { ...rule, actions: nextActs };
                              onUpdateConfig({ rules: nextRules });
                            }}
                            className="font-mono bg-slate-950 border border-slate-700 rounded px-2 py-1 text-emerald-200 flex-1"
                          />
                        ) : (
                          <input
                            type="number"
                            value={act.value}
                            onChange={(e) => {
                              const nextRules = [...rules];
                              const nextActs = [...rule.actions];
                              nextActs[aIdx] = {
                                ...act,
                                value: parseFloat(e.target.value) || 0,
                              };
                              nextRules[rIdx] = { ...rule, actions: nextActs };
                              onUpdateConfig({ rules: nextRules });
                            }}
                            className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Rule Script DSL Compiler & Quick Upload */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-400" />
              Rule Script Compiler & Text Upload
            </h3>
            <p className="text-xs text-slate-400">
              Type or paste plain-text game rules to compile them into active triggers
            </p>
          </div>

          {scriptMsg && (
            <div className="bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 px-3 py-2 rounded-lg text-xs">
              {scriptMsg}
            </div>
          )}

          <div className="text-xs text-slate-400 space-y-1 bg-slate-950 p-3 rounded-lg border border-slate-800">
            <div className="font-semibold text-slate-200">
              Supported Rule Syntax:
            </div>
            <div>
              • <code>WHEN ON_LAND_TILE IF tile.type == "boost" THEN player.vp += 2</code>
            </div>
            <div>
              • <code>WHEN ON_TURN_START IF player.gold &gt;= 8 THEN draw 1</code>
            </div>
            <div>
              • <code>WHEN ON_COMBAT THEN player.gold += 2</code>
            </div>
            <div>
              • <code>WIN WHEN player.vp &gt;= 15</code>
            </div>
            <div>
              • <code>LOSE WHEN player.hp &lt;= 0</code>
            </div>
          </div>

          <textarea
            rows={8}
            value={scriptText}
            onChange={(e) => setScriptText(e.target.value)}
            className="w-full font-mono text-xs bg-slate-950 border border-slate-800 rounded-xl p-3 text-emerald-200 focus:border-indigo-500 focus:outline-none"
          />

          <button
            onClick={handleCompileScript}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow transition-colors"
          >
            Compile & Append Rules to Game
          </button>
        </div>
      </div>
    </div>
  );
};
