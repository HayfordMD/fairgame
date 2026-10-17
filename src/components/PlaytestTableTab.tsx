import React, { useEffect, useRef, useState } from 'react';
import {
  User,
  Bot,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Dices,
  Swords,
  Footprints,
  Layers,
  ScrollText,
  Download,
  Copy,
  Check,
  Sparkles,
  Trophy,
  AlertOctagon,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { BoardTile, GameConfig, RuntimePieceState } from '../types/game';
import {
  advancePhaseOrTurnInLiveMatch,
  attackEnemyPieceInLiveMatch,
  canPlayCardNow,
  createInitialLiveMatch,
  getAttackableEnemiesForPiece,
  getEnabledPhases,
  getReachableMoveTiles,
  LiveMatchState,
  LogCategory,
  movePieceInLiveMatch,
  playCardInLiveMatch,
  rollDiceForTurn,
  SeatControlMode,
  stepSingleAtomicAction,
} from '../engine/liveMatchEngine';
import { BoardVisualizer } from './BoardVisualizer';

interface PlaytestTableTabProps {
  config: GameConfig;
}

const PLAYER_BADGE_COLORS = [
  'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'bg-rose-500/20 text-rose-300 border-rose-500/40',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'bg-amber-500/20 text-amber-300 border-amber-500/40',
  'bg-purple-500/20 text-purple-300 border-purple-500/40',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
];

const LOG_CATEGORY_STYLE: Record<
  LogCategory,
  { badge: string; classes: string }
> = {
  GAME: {
    badge: 'MATCH',
    classes: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
  },
  TURN: {
    badge: 'TURN',
    classes: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  PHASE: {
    badge: 'PHASE',
    classes: 'bg-slate-800 text-slate-300 border-slate-700',
  },
  DICE: {
    badge: 'DICE',
    classes: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  DRAW: {
    badge: 'DRAW',
    classes: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
  },
  CARD: {
    badge: 'CARD',
    classes: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  },
  MOVE: {
    badge: 'MOVE',
    classes: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  COMBAT: {
    badge: 'COMBAT',
    classes: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  RULE_TRIGGER: {
    badge: 'RULE ⚡',
    classes: 'bg-amber-500/25 text-amber-200 border-amber-400/50',
  },
  TILE_EFFECT: {
    badge: 'SPACE',
    classes: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
  WIN_LOSS: {
    badge: 'OUTCOME',
    classes: 'bg-yellow-500/25 text-yellow-200 border-yellow-400/60',
  },
};

export const PlaytestTableTab: React.FC<PlaytestTableTabProps> = ({
  config,
}) => {
  // Default all seats to 'human' so a person can immediately play every turn (with 1-click switch to Human vs AI or Slow-Log AI Watch)
  const [match, setMatch] = useState<LiveMatchState>(() =>
    createInitialLiveMatch(
      config,
      Array.from({ length: config.turnConfig.playerCount }, () => 'human')
    )
  );
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [targetEnemyPlayerIdx, setTargetEnemyPlayerIdx] = useState<number>(1);
  const [isAutoStreaming, setIsAutoStreaming] = useState<boolean>(false);
  const [logSpeedMs, setLogSpeedMs] = useState<number>(1000); // default 1.0s slow logs
  const [logFilter, setLogFilter] = useState<
    'ALL' | 'RULES' | 'CARDS' | 'COMBAT_MOVE' | 'TURNS'
  >('ALL');
  const [copiedLogs, setCopiedLogs] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset match if config ID or playerCount changes
  useEffect(() => {
    setIsAutoStreaming(false);
    setMatch((prev) =>
      createInitialLiveMatch(config, prev.seatControllers)
    );
  }, [config.id, config.turnConfig.playerCount]);

  // Automatically select active player's first living piece when activePlayerIndex changes
  useEffect(() => {
    const myUnits = match.pieces.filter(
      (u) => u.ownerPlayerIndex === match.activePlayerIndex && u.alive
    );
    if (
      myUnits.length > 0 &&
      !myUnits.some((u) => u.instanceId === selectedPieceId)
    ) {
      setSelectedPieceId(myUnits[0].instanceId);
    } else if (myUnits.length === 0) {
      setSelectedPieceId(null);
    }

    // Default enemy target to another alive player
    const otherPlayer = match.players.find(
      (p) => p.playerIndex !== match.activePlayerIndex && !p.eliminated
    );
    if (otherPlayer) {
      setTargetEnemyPlayerIdx(otherPlayer.playerIndex);
    }
  }, [match.activePlayerIndex, match.round, match.pieces, selectedPieceId, match.players]);

  // Auto-scroll log feed to bottom when new log entries arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [match.logs.length]);

  const activePlayer = match.players[match.activePlayerIndex];
  const activeSeatMode =
    match.seatControllers[match.activePlayerIndex] || 'human';
  const enabledPhases = getEnabledPhases(config);
  const currentPhase = enabledPhases[match.activePhaseIndex];

  // Timer for AI turns or Slow-Log Auto-Stream mode
  useEffect(() => {
    if (match.gameOver) {
      setIsAutoStreaming(false);
      return;
    }
    const shouldStepAutomatically =
      isAutoStreaming || activeSeatMode === 'ai';
    if (!shouldStepAutomatically) return;

    const timer = setTimeout(() => {
      setMatch((prev) => stepSingleAtomicAction(prev, config));
    }, logSpeedMs);

    return () => clearTimeout(timer);
  }, [
    isAutoStreaming,
    activeSeatMode,
    match,
    config,
    logSpeedMs,
  ]);

  // Compute legal moves & attacks for the selected friendly piece
  const reachableMovesMap = getReachableMoveTiles(
    match,
    config,
    selectedPieceId
  );
  const highlightedMoveTileIds = Array.from(reachableMovesMap.keys());

  const attackableEnemies = getAttackableEnemiesForPiece(
    match,
    config,
    selectedPieceId
  );
  const highlightedAttackTileIds = Array.from(
    new Set(attackableEnemies.map((e) => e.tileId))
  );

  const handleRestartMatch = (modes?: SeatControlMode[]) => {
    setIsAutoStreaming(false);
    const nextModes = modes || match.seatControllers;
    setMatch(createInitialLiveMatch(config, nextModes));
  };

  const handleToggleSeatMode = (seatIndex: number) => {
    setMatch((prev) => {
      const nextControllers = [...prev.seatControllers];
      nextControllers[seatIndex] =
        nextControllers[seatIndex] === 'human' ? 'ai' : 'human';
      return {
        ...prev,
        seatControllers: nextControllers,
      };
    });
  };

  const handleBoardTileClick = (tile: BoardTile) => {
    setSelectedTileId(tile.id);
    if (match.gameOver) return;

    // 1. If the clicked tile has an attackable enemy for our selected piece, attack it!
    const enemyOnTile = attackableEnemies.find((e) => e.tileId === tile.id);
    if (selectedPieceId && enemyOnTile) {
      setMatch((prev) =>
        attackEnemyPieceInLiveMatch(
          prev,
          config,
          selectedPieceId,
          enemyOnTile.instanceId
        )
      );
      return;
    }

    // 2. If the clicked tile is a valid move destination for our selected piece, move there!
    if (selectedPieceId && reachableMovesMap.has(tile.id)) {
      setMatch((prev) =>
        movePieceInLiveMatch(prev, config, selectedPieceId, tile.id)
      );
      return;
    }

    // 3. Otherwise, if there is a friendly piece owned by the active player on this tile, select it
    const friendlyOnTile = match.pieces.find(
      (u) =>
        u.tileId === tile.id &&
        u.alive &&
        u.ownerPlayerIndex === match.activePlayerIndex
    );
    if (friendlyOnTile) {
      setSelectedPieceId(friendlyOnTile.instanceId);
    }
  };

  const handleSelectPieceOnBoard = (piece: RuntimePieceState) => {
    if (piece.ownerPlayerIndex === match.activePlayerIndex && piece.alive) {
      setSelectedPieceId(piece.instanceId);
    } else if (
      selectedPieceId &&
      attackableEnemies.some((e) => e.instanceId === piece.instanceId)
    ) {
      setMatch((prev) =>
        attackEnemyPieceInLiveMatch(
          prev,
          config,
          selectedPieceId,
          piece.instanceId
        )
      );
    }
  };

  const filteredLogs = match.logs.filter((entry) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'RULES') {
      return (
        entry.category === 'RULE_TRIGGER' ||
        entry.category === 'TILE_EFFECT' ||
        entry.category === 'WIN_LOSS'
      );
    }
    if (logFilter === 'CARDS') {
      return entry.category === 'CARD' || entry.category === 'DRAW';
    }
    if (logFilter === 'COMBAT_MOVE') {
      return (
        entry.category === 'MOVE' ||
        entry.category === 'COMBAT' ||
        entry.category === 'DICE'
      );
    }
    if (logFilter === 'TURNS') {
      return (
        entry.category === 'TURN' ||
        entry.category === 'PHASE' ||
        entry.category === 'WIN_LOSS'
      );
    }
    return true;
  });

  const formatFullTranscriptText = () => {
    return match.logs
      .map(
        (l) =>
          `[#${l.stepNumber} | R${l.round} | P${l.playerIndex + 1} | ${l.phaseName} | ${
            l.category
          }] ${l.headline}${l.details ? `\n    ↳ ${l.details}` : ''}`
      )
      .join('\n');
  };

  const handleCopyTranscript = () => {
    navigator.clipboard.writeText(formatFullTranscriptText());
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2500);
  };

  const handleDownloadTranscript = () => {
    const text = formatFullTranscriptText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${config.name.toLowerCase().replace(/\s+/g, '_')}_single_game_log.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activePlayerUnits = match.pieces.filter(
    (u) => u.ownerPlayerIndex === match.activePlayerIndex && u.alive
  );
  const selectedUnit =
    match.pieces.find((u) => u.instanceId === selectedPieceId) || null;

  return (
    <div className="space-y-6">
      {/* Top Mode & Slow-Log Stream Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <User className="w-5 h-5 text-emerald-400" />
              Interactive Human Playtest & Single-Game Slow Log Streamer
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              Live Rules Engine
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Play every turn yourself (Hotseat), play against AI bots, or stream a
            single game with slow step-by-step logs to inspect every rule trigger and
            stat change.
          </p>
        </div>

        {/* Mode Presets & Speed Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() =>
              handleRestartMatch(
                Array.from(
                  { length: config.turnConfig.playerCount },
                  () => 'human'
                )
              )
            }
            className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              match.seatControllers.every((m) => m === 'human') && !isAutoStreaming
                ? 'bg-emerald-600 text-white border-emerald-400'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            All Human (Play Every Turn)
          </button>

          <button
            onClick={() =>
              handleRestartMatch(
                Array.from({ length: config.turnConfig.playerCount }, (_, i) =>
                  i === 0 ? 'human' : 'ai'
                )
              )
            }
            className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              match.seatControllers[0] === 'human' &&
              match.seatControllers.slice(1).some((m) => m === 'ai')
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Swords className="w-3.5 h-3.5" />
            Human (P1) vs. AI
          </button>

          <button
            onClick={() => {
              const allAi: SeatControlMode[] = Array.from(
                { length: config.turnConfig.playerCount },
                () => 'ai'
              );
              setMatch(createInitialLiveMatch(config, allAi));
              setIsAutoStreaming(true);
            }}
            className={`px-3 py-1.5 rounded-lg font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
              match.seatControllers.every((m) => m === 'ai')
                ? 'bg-amber-600 text-white border-amber-400'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Watch Single Game (Slow Logs)
          </button>

          {/* Slow Log Speed Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">Log Speed:</span>
            <select
              value={logSpeedMs}
              onChange={(e) => setLogSpeedMs(parseInt(e.target.value, 10))}
              className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-slate-100 font-semibold"
            >
              <option value={1800}>🐢 Very Slow (1.8s / action)</option>
              <option value={1000}>🚶 Slow Logs (1.0s / action)</option>
              <option value={550}>🏃 Normal (0.55s / action)</option>
              <option value={220}>⚡ Fast (0.22s / action)</option>
            </select>
          </div>

          <button
            onClick={() => setIsAutoStreaming((prev) => !prev)}
            disabled={match.gameOver}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
              isAutoStreaming
                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
            title="Stream actions automatically at the selected Log Speed"
          >
            {isAutoStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" /> Pause Stream
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Auto-Stream Logs
              </>
            )}
          </button>

          <button
            onClick={() => {
              setIsAutoStreaming(false);
              setMatch((prev) => stepSingleAtomicAction(prev, config));
            }}
            disabled={match.gameOver}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold cursor-pointer"
            title="Execute 1 single action and print its log entry"
          >
            <SkipForward className="w-3.5 h-3.5" /> Step 1 Action
          </button>

          <button
            onClick={() => handleRestartMatch()}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Restart
          </button>
        </div>
      </div>

      {/* Player Seats Strip (Click any seat to toggle Human <-> AI) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {match.players.map((p, idx) => {
          const isTurn = match.activePlayerIndex === idx && !match.gameOver;
          const isWinner = match.winnerPlayerIndex === idx;
          const mode = match.seatControllers[idx] || 'human';
          const badgeClass =
            PLAYER_BADGE_COLORS[idx % PLAYER_BADGE_COLORS.length];

          return (
            <div
              key={p.playerIndex}
              className={`rounded-xl p-3.5 border transition-all ${
                isWinner
                  ? 'bg-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/10'
                  : isTurn
                  ? 'bg-indigo-950/50 border-indigo-400 shadow-md shadow-indigo-500/10'
                  : p.eliminated
                  ? 'bg-slate-950/40 border-slate-900 opacity-50'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs font-bold border ${badgeClass}`}
                  >
                    {p.name}
                  </span>
                  {isTurn && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Active Turn
                    </span>
                  )}
                  {isWinner && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-amber-500/30 text-amber-200">
                      🏆 Winner
                    </span>
                  )}
                </div>

                {/* Toggle Human / AI Seat Button */}
                <button
                  onClick={() => handleToggleSeatMode(idx)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                    mode === 'human'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/70'
                      : 'bg-slate-950 text-indigo-300 border-slate-700 hover:bg-slate-800'
                  }`}
                  title="Click to switch this seat between Human and AI Bot"
                >
                  {mode === 'human' ? (
                    <>
                      <User className="w-3 h-3" /> Human
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3" /> AI ({p.strategy})
                    </>
                  )}
                </button>
              </div>

              {/* Player Live Stats */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {config.playerStats.map((st) => (
                  <div
                    key={st.id}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs flex items-center gap-1.5"
                  >
                    <span className="text-slate-400">{st.name}:</span>
                    <span
                      className="font-mono font-bold"
                      style={{ color: st.color }}
                    >
                      {p.stats[st.id] ?? 0}
                    </span>
                    <span className="text-[10px] text-slate-600">
                      /{st.maxValue}
                    </span>
                  </div>
                ))}
                <div className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-400">
                  Hand: <strong className="text-slate-200">{p.hand.length}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Match Over Banner */}
      {match.gameOver && (
        <div
          className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
            match.outcomeType === 'infinite_loop'
              ? 'bg-rose-950/50 border-rose-500/50 text-rose-100'
              : match.outcomeType === 'win'
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-100'
              : 'bg-slate-900 border-slate-700 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {match.outcomeType === 'infinite_loop' ? (
              <AlertOctagon className="w-6 h-6 text-rose-400 shrink-0" />
            ) : (
              <Trophy className="w-6 h-6 text-amber-400 shrink-0" />
            )}
            <div>
              <div className="text-sm font-extrabold">
                {match.winnerPlayerIndex !== null
                  ? `🏆 ${match.players[match.winnerPlayerIndex]?.name} Wins the Match!`
                  : `Match Ended: ${match.winConditionName}`}
              </div>
              <div className="text-xs opacity-80">
                Condition: <strong>{match.winConditionName}</strong> • Finished in{' '}
                {match.round} Round(s) and {match.stepCounter} logged events.
              </div>
            </div>
          </div>
          <button
            onClick={() => handleRestartMatch()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
          >
            Play Again
          </button>
        </div>
      )}

      {/* Main 3-Column Workspace: Board (Left) | Human Turn Controls & Hand (Middle) | Live Slow-Log Console (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT: Interactive Board Canvas */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-slate-200 flex items-center gap-2">
                <span>
                  Round {match.round}/{config.turnConfig.maxTurns}
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-indigo-300">
                  {activePlayer?.name}'s Turn
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                  Valid Move ({highlightedMoveTileIds.length})
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                  Attack Target ({highlightedAttackTileIds.length})
                </span>
              </div>
            </div>

            <BoardVisualizer
              board={config.board}
              pieces={match.pieces}
              selectedTileId={selectedTileId}
              selectedPieceId={selectedPieceId}
              onSelectTile={handleBoardTileClick}
              onSelectPiece={handleSelectPieceOnBoard}
              highlightedMoveTileIds={highlightedMoveTileIds}
              highlightedAttackTileIds={highlightedAttackTileIds}
            />

            <div className="text-[11px] text-slate-400 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2">
              💡 <strong>How to Move & Attack on the Board:</strong> Click any of{' '}
              <strong className="text-slate-200">{activePlayer?.name}</strong>'s
              units (outlined in gold), then click a{' '}
              <strong className="text-emerald-400">green highlighted space</strong>{' '}
              to move there or a{' '}
              <strong className="text-rose-400">red highlighted space</strong> to
              attack an enemy!
            </div>
          </div>
        </div>

        {/* MIDDLE: Active Turn Phase Sequencer, Unit Controls, Dice & Player Hand */}
        <div className="lg:col-span-3 space-y-4">
          {/* Phase Stepper & Next Phase / End Turn Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                Turn Phase Control
              </span>
              <span className="text-xs font-mono text-slate-400">
                AP Left: <strong className="text-emerald-400">{match.remainingAp}</strong>
              </span>
            </div>

            {/* Phase Pills */}
            <div className="flex flex-wrap gap-1.5">
              {enabledPhases.map((ph, idx) => {
                const isCurrent = idx === match.activePhaseIndex;
                const isPast = idx < match.activePhaseIndex;
                return (
                  <div
                    key={ph.id}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 border ${
                      isCurrent
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                        : isPast
                        ? 'bg-slate-950/60 text-slate-500 border-slate-800 line-through'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    <span>
                      {idx + 1}. {ph.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Primary Turn Advancement Buttons */}
            <div className="pt-2 flex flex-col gap-2">
              {currentPhase?.type === 'roll_and_move' && !match.diceRolledInPhase && (
                <button
                  onClick={() =>
                    setMatch((prev) => rollDiceForTurn(prev, config))
                  }
                  disabled={match.gameOver}
                  className="w-full py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow cursor-pointer"
                >
                  <Dices className="w-4 h-4" />
                  Roll Dice ({config.turnConfig.diceCount}d
                  {config.turnConfig.diceSides})
                </button>
              )}

              {match.lastDiceRolls.length > 0 && (
                <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg px-3 py-2 text-xs text-amber-200 flex items-center justify-between">
                  <span>
                    🎲 Rolled: [{match.lastDiceRolls.join(', ')}]
                  </span>
                  <span className="font-bold">
                    Move Steps: {match.pendingMoveSteps}
                  </span>
                </div>
              )}

              <button
                onClick={() =>
                  setMatch((prev) => advancePhaseOrTurnInLiveMatch(prev, config))
                }
                disabled={match.gameOver}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow cursor-pointer"
              >
                <span>
                  {match.activePhaseIndex + 1 < enabledPhases.length
                    ? `Complete "${currentPhase?.name}" → Next Phase`
                    : `End ${activePlayer?.name}'s Turn → Next Player`}
                </span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Player's Units & Direct Move/Attack Actions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <Footprints className="w-4 h-4 text-emerald-400" />
                {activePlayer?.name}'s Units ({activePlayerUnits.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Click to select
              </span>
            </div>

            {activePlayerUnits.length === 0 ? (
              <div className="text-slate-500 italic bg-slate-950 p-3 rounded-lg border border-slate-800">
                No living units on the board for {activePlayer?.name}.
              </div>
            ) : (
              <div className="space-y-2">
                {activePlayerUnits.map((u) => {
                  const isSel = u.instanceId === selectedPieceId;
                  const tile = config.board.tiles.find((t) => t.id === u.tileId);
                  return (
                    <div
                      key={u.instanceId}
                      onClick={() => setSelectedPieceId(u.instanceId)}
                      className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                        isSel
                          ? 'bg-indigo-950/60 border-amber-400'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-100">
                          {u.symbol} {u.name}
                        </span>
                        <span className="font-mono text-[11px] text-emerald-400">
                          HP {u.hp}/{u.maxHp} • ATK {u.attack}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                        <span>At: {tile?.label || u.tileId}</span>
                        {isSel && (
                          <span className="text-amber-300 font-semibold">
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Move & Attack Buttons for Selected Unit */}
            {selectedUnit && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                {attackableEnemies.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-rose-300">
                      Enemies in Attack Range:
                    </div>
                    {attackableEnemies.map((enemy) => (
                      <button
                        key={enemy.instanceId}
                        onClick={() =>
                          setMatch((prev) =>
                            attackEnemyPieceInLiveMatch(
                              prev,
                              config,
                              selectedUnit.instanceId,
                              enemy.instanceId
                            )
                          )
                        }
                        className="w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center justify-between cursor-pointer"
                      >
                        <span>
                          ⚔️ Attack {enemy.symbol} {enemy.name} (P
                          {enemy.ownerPlayerIndex + 1})
                        </span>
                        <span className="font-mono text-[11px]">
                          HP {enemy.hp}/{enemy.maxHp}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {highlightedMoveTileIds.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-emerald-300">
                      Legal Move Spaces (or click on board):
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {highlightedMoveTileIds.map((tid) => {
                        const t = config.board.tiles.find((x) => x.id === tid);
                        return (
                          <button
                            key={tid}
                            onClick={() =>
                              setMatch((prev) =>
                                movePieceInLiveMatch(
                                  prev,
                                  config,
                                  selectedUnit.instanceId,
                                  tid
                                )
                              )
                            }
                            className="px-2 py-1 rounded bg-emerald-950/80 hover:bg-emerald-800 border border-emerald-500/40 text-emerald-200 text-[11px] font-medium cursor-pointer"
                          >
                            → {t?.label || tid}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active Player's Hand of Cards */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-400" />
                {activePlayer?.name}'s Hand ({activePlayer?.hand.length || 0}/
                {config.turnConfig.maxHandSize})
              </span>
              {match.players.length > 2 && (
                <select
                  value={targetEnemyPlayerIdx}
                  onChange={(e) =>
                    setTargetEnemyPlayerIdx(parseInt(e.target.value, 10))
                  }
                  className="bg-slate-950 border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-200"
                >
                  {match.players
                    .filter(
                      (p) =>
                        p.playerIndex !== match.activePlayerIndex &&
                        !p.eliminated
                    )
                    .map((p) => (
                      <option key={p.playerIndex} value={p.playerIndex}>
                        Target: {p.name}
                      </option>
                    ))}
                </select>
              )}
            </div>

            {!activePlayer || activePlayer.hand.length === 0 ? (
              <div className="text-slate-500 italic bg-slate-950 p-3 rounded-lg border border-slate-800">
                No cards currently in {activePlayer?.name}'s hand.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activePlayer.hand.map((cid, hIdx) => {
                  const card = config.cards.find((c) => c.id === cid);
                  if (!card) return null;
                  const status = canPlayCardNow(match, config, card);
                  return (
                    <div
                      key={`${cid}_${hIdx}`}
                      className={`p-3 rounded-xl border space-y-2 ${
                        status.allowed
                          ? 'bg-slate-950 border-slate-800'
                          : 'bg-slate-950/50 border-slate-900 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-100">
                          {card.name}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[11px] font-bold">
                          {card.costAmount} {card.costStatId.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {card.description}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        {status.allowed ? (
                          <button
                            onClick={() =>
                              setMatch((prev) =>
                                playCardInLiveMatch(
                                  prev,
                                  config,
                                  hIdx,
                                  targetEnemyPlayerIdx,
                                  selectedPieceId || undefined
                                )
                              )
                            }
                            className="w-full py-1.5 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Play Card Now
                          </button>
                        ) : (
                          <span className="text-[11px] text-rose-400 font-medium">
                            🔒 {status.reason}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Full Single-Game Play-by-Play Slow-Log Console */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[700px]">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-amber-400" />
                Single-Game Play-by-Play Log ({filteredLogs.length})
              </h3>
              <p className="text-[11px] text-slate-400">
                Complete chronological transcript of every turn, card, move, combat,
                and rule trigger
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopyTranscript}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs flex items-center gap-1 cursor-pointer"
                title="Copy Full Single-Game Log Transcript"
              >
                {copiedLogs ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={handleDownloadTranscript}
                className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs flex items-center gap-1 cursor-pointer"
                title="Download Single-Game Log (.txt)"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Log Category Filter Pills */}
          <div className="flex flex-wrap gap-1.5 py-2.5 border-b border-slate-800/80 text-[11px]">
            {(
              [
                { id: 'ALL', label: `All (${match.logs.length})` },
                { id: 'RULES', label: '⚡ Rules & Spaces' },
                { id: 'CARDS', label: '🃏 Cards & Draws' },
                { id: 'COMBAT_MOVE', label: '⚔️ Moves & Combat' },
                { id: 'TURNS', label: '🕒 Turns & Phases' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setLogFilter(f.id)}
                className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                  logFilter === f.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Scrollable Log Entries */}
          <div
            ref={logContainerRef}
            className="flex-1 overflow-y-auto space-y-2 py-3 pr-1 font-mono text-xs"
          >
            {filteredLogs.map((entry) => {
              const catMeta = LOG_CATEGORY_STYLE[entry.category];
              return (
                <div
                  key={entry.id}
                  className={`p-2.5 rounded-lg border transition-all ${
                    entry.severity === 'critical'
                      ? 'bg-rose-950/60 border-rose-500/60 text-rose-100'
                      : entry.severity === 'warning'
                      ? 'bg-amber-950/35 border-amber-500/40 text-amber-100'
                      : entry.severity === 'highlight'
                      ? 'bg-indigo-950/35 border-indigo-500/30 text-slate-100'
                      : 'bg-slate-950/80 border-slate-800/90 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1 text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded font-bold border ${catMeta.classes}`}
                      >
                        {catMeta.badge}
                      </span>
                      <span className="text-slate-400">
                        R{entry.round} • P{entry.playerIndex + 1} •{' '}
                        {entry.phaseName}
                      </span>
                    </div>
                    <span className="text-slate-500">#{entry.stepNumber}</span>
                  </div>
                  <div className="font-semibold leading-snug">
                    {entry.headline}
                  </div>
                  {entry.details && (
                    <div className="text-[11px] text-slate-400 mt-1 pl-2 border-l-2 border-slate-700">
                      {entry.details}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
