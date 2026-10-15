import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  Upload,
  Shield,
  Swords,
  Footprints,
  Activity,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  GameConfig,
  GlobalVarDefinition,
  MovementPattern,
  PieceArchetype,
  StatDefinition,
} from '../types/game';
import { importPiecesFromCSV, importStatsFromCSV } from '../utils/importers';

interface PiecesAndStatsTabProps {
  config: GameConfig;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
}

const PIECE_SYMBOLS = [
  '🛡️',
  '⚔️',
  '🏹',
  '🧙',
  '🏎️',
  '🚀',
  '🐉',
  '🤖',
  '👑',
  '🐺',
  '🏰',
  '♟️',
  '⚡',
  '💀',
];

export const PiecesAndStatsTab: React.FC<PiecesAndStatsTabProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [selectedPieceId, setSelectedPieceId] = useState<string>(
    config.pieces[0]?.id || ''
  );
  const [csvFeedback, setCsvFeedback] = useState<string | null>(null);

  const selectedPiece =
    config.pieces.find((p) => p.id === selectedPieceId) || config.pieces[0] || null;

  const handleAddStat = () => {
    const newId = `stat_${Date.now().toString().slice(-4)}`;
    const newStat: StatDefinition = {
      id: newId,
      name: 'New Resource',
      icon: 'Sparkles',
      color: '#10b981',
      initialValue: 3,
      minValue: 0,
      maxValue: 15,
      regenPerTurn: 1,
      description: 'Custom player stat or resource.',
    };
    onUpdateConfig({ playerStats: [...config.playerStats, newStat] });
  };

  const handleUpdateStat = (id: string, patch: Partial<StatDefinition>) => {
    onUpdateConfig({
      playerStats: config.playerStats.map((s) =>
        s.id === id ? { ...s, ...patch } : s
      ),
    });
  };

  const handleDeleteStat = (id: string) => {
    if (config.playerStats.length <= 1) return;
    onUpdateConfig({
      playerStats: config.playerStats.filter((s) => s.id !== id),
    });
  };

  const handleAddGlobalVar = () => {
    const newGlobal: GlobalVarDefinition = {
      id: `global_${Date.now().toString().slice(-4)}`,
      name: 'Round Counter',
      initialValue: 1,
      changePerRound: 1,
      minValue: 0,
      maxValue: 100,
      description: 'Global game state tracker.',
    };
    onUpdateConfig({ globalVars: [...config.globalVars, newGlobal] });
  };

  const handleAddPiece = () => {
    const newId = `piece_${Date.now().toString().slice(-4)}`;
    const newPiece: PieceArchetype = {
      id: newId,
      name: `Unit ${config.pieces.length + 1}`,
      symbol: PIECE_SYMBOLS[config.pieces.length % PIECE_SYMBOLS.length],
      color: '#6366f1',
      ownerType: 'all_players',
      spawnCountPerPlayer: 1,
      maxHp: 10,
      attack: 4,
      defense: 1,
      moveRange: 2,
      attackRange: 1,
      apCost: 1,
      movementType:
        config.board.topology === 'track'
          ? 'track_forward'
          : config.board.topology === 'graph'
          ? 'graph_adjacent'
          : 'orthogonal',
      canCaptureGoal: true,
      respawnOnDeath: true,
      respawnDelayTurns: 2,
      onAttackEffects: [],
      onKillEffects: [
        {
          id: `kill_${Date.now()}`,
          target: 'player',
          statId: 'vp',
          operation: 'add',
          value: 1,
        },
      ],
      description: 'Custom piece archetype.',
    };
    onUpdateConfig({ pieces: [...config.pieces, newPiece] });
    setSelectedPieceId(newId);
  };

  const handleUpdatePiece = (id: string, patch: Partial<PieceArchetype>) => {
    onUpdateConfig({
      pieces: config.pieces.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  };

  const handleDeletePiece = (id: string) => {
    if (config.pieces.length <= 1) return;
    const next = config.pieces.filter((p) => p.id !== id);
    onUpdateConfig({ pieces: next });
    setSelectedPieceId(next[0]?.id || '');
  };

  const handleUploadPiecesCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const imported = importPiecesFromCSV(reader.result);
        if (imported.length > 0) {
          onUpdateConfig({ pieces: [...config.pieces, ...imported] });
          setSelectedPieceId(imported[0].id);
          setCsvFeedback(`Imported ${imported.length} piece(s) from ${file.name}`);
          setTimeout(() => setCsvFeedback(null), 4000);
        }
      }
    };
    reader.readAsText(file);
  };

  const handleUploadStatsCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const imported = importStatsFromCSV(reader.result);
        if (imported.length > 0) {
          onUpdateConfig({ playerStats: [...config.playerStats, ...imported] });
          setCsvFeedback(`Imported ${imported.length} stat(s) from ${file.name}`);
          setTimeout(() => setCsvFeedback(null), 4000);
        }
      }
    };
    reader.readAsText(file);
  };

  const downloadSamplePiecesCSV = () => {
    const sample = `name,symbol,count,hp,attack,defense,move_range,attack_range,ap_cost,movement_type,respawn_turns,description\nPaladin,🛡️,2,14,4,3,2,1,1,orthogonal,2,Heavy holy defender\nWarlock,🧙,1,7,6,0,2,2,1,omni,3,Glass cannon spellcaster`;
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_pieces.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {csvFeedback && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-medium">
          ✓ {csvFeedback}
        </div>
      )}

      {/* SECTION 1: Player Stats & Resource Economy */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
              <Activity className="w-4 h-4 text-indigo-400" />
              Player Stats & Resource Attributes
            </h3>
            <p className="text-xs text-slate-400">
              Define health, victory points, currencies, and action pools tracked per player.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium cursor-pointer border border-slate-700">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>Upload Stats CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUploadStatsCSV}
              />
            </label>
            <button
              onClick={handleAddStat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> Add Player Stat
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {config.playerStats.map((stat) => (
            <div
              key={stat.id}
              className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 relative"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={stat.color}
                    onChange={(e) =>
                      handleUpdateStat(stat.id, { color: e.target.value })
                    }
                    className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={stat.name}
                    onChange={(e) =>
                      handleUpdateStat(stat.id, { name: e.target.value })
                    }
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs font-semibold text-slate-100 w-36"
                  />
                </div>
                <button
                  onClick={() => handleDeleteStat(stat.id)}
                  className="text-slate-500 hover:text-rose-400"
                  title="Delete Stat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[11px] font-mono text-slate-400">
                Formula ID:{' '}
                <code className="text-indigo-300 bg-slate-900 px-1.5 py-0.5 rounded">
                  player.{stat.id}
                </code>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-0.5">
                    Initial Value
                  </label>
                  <input
                    type="number"
                    value={stat.initialValue}
                    onChange={(e) =>
                      handleUpdateStat(stat.id, {
                        initialValue: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-0.5">
                    Regen / Turn
                  </label>
                  <input
                    type="number"
                    value={stat.regenPerTurn}
                    onChange={(e) =>
                      handleUpdateStat(stat.id, {
                        regenPerTurn: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-0.5">
                    Min Cap
                  </label>
                  <input
                    type="number"
                    value={stat.minValue}
                    onChange={(e) =>
                      handleUpdateStat(stat.id, {
                        minValue: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-0.5">
                    Max Cap
                  </label>
                  <input
                    type="number"
                    value={stat.maxValue}
                    onChange={(e) =>
                      handleUpdateStat(stat.id, {
                        maxValue: parseFloat(e.target.value) || 10,
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-100"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Global Variables Row */}
        <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Global Environment Variables:
            </span>
            {config.globalVars.map((gv, idx) => (
              <div
                key={gv.id}
                className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs"
              >
                <input
                  type="text"
                  value={gv.name}
                  onChange={(e) => {
                    const next = [...config.globalVars];
                    next[idx] = { ...gv, name: e.target.value };
                    onUpdateConfig({ globalVars: next });
                  }}
                  className="bg-transparent text-slate-200 font-medium w-28 focus:outline-none"
                />
                <span className="text-slate-500">Start:</span>
                <input
                  type="number"
                  value={gv.initialValue}
                  onChange={(e) => {
                    const next = [...config.globalVars];
                    next[idx] = {
                      ...gv,
                      initialValue: parseFloat(e.target.value) || 0,
                    };
                    onUpdateConfig({ globalVars: next });
                  }}
                  className="w-12 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-100"
                />
                <span className="text-slate-500">/Rnd:</span>
                <input
                  type="number"
                  value={gv.changePerRound}
                  onChange={(e) => {
                    const next = [...config.globalVars];
                    next[idx] = {
                      ...gv,
                      changePerRound: parseFloat(e.target.value) || 0,
                    };
                    onUpdateConfig({ globalVars: next });
                  }}
                  className="w-12 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-100"
                />
                <button
                  onClick={() =>
                    onUpdateConfig({
                      globalVars: config.globalVars.filter((_, i) => i !== idx),
                    })
                  }
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={handleAddGlobalVar}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add Global Variable
          </button>
        </div>
      </div>

      {/* SECTION 2: Piece / Unit Archetype Configurator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Piece List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Game Pieces & Units ({config.pieces.length})
              </h3>
              <p className="text-xs text-slate-400">
                Configure board tokens, meeples & combat squads
              </p>
            </div>
            <button
              onClick={handleAddPiece}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> New Piece
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium cursor-pointer border border-slate-700">
              <Upload className="w-3.5 h-3.5 text-indigo-400" />
              <span>Import Pieces CSV</span>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleUploadPiecesCSV}
              />
            </label>
            <button
              onClick={downloadSamplePiecesCSV}
              className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs border border-slate-800 flex items-center gap-1"
              title="Download CSV Template"
            >
              <Download className="w-3.5 h-3.5" /> CSV Template
            </button>
          </div>

          <div className="space-y-2">
            {config.pieces.map((p) => {
              const active = selectedPiece?.id === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPieceId(p.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                    active
                      ? 'bg-indigo-950/40 border-indigo-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-xl">
                      {p.symbol}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-100">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {p.spawnCountPerPlayer}x/Player • {p.maxHp} HP • {p.attack} ATK •{' '}
                        {p.moveRange} Move
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePiece(p.id);
                    }}
                    className="text-slate-500 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Piece Detail Editor */}
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl p-5">
          {selectedPiece ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-700 flex items-center justify-center text-2xl">
                    {selectedPiece.symbol}
                  </div>
                  <div>
                    <input
                      type="text"
                      value={selectedPiece.name}
                      onChange={(e) =>
                        handleUpdatePiece(selectedPiece.id, {
                          name: e.target.value,
                        })
                      }
                      className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-bold text-slate-100"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Archetype ID: <code>{selectedPiece.id}</code>
                    </p>
                  </div>
                </div>

                {/* Symbol Picker */}
                <div className="flex flex-wrap gap-1">
                  {PIECE_SYMBOLS.map((sym) => (
                    <button
                      key={sym}
                      onClick={() =>
                        handleUpdatePiece(selectedPiece.id, { symbol: sym })
                      }
                      className={`w-7 h-7 rounded flex items-center justify-center text-sm border ${
                        selectedPiece.symbol === sym
                          ? 'bg-indigo-600 border-indigo-400'
                          : 'bg-slate-950 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Combat & Mobility Attributes */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <label className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" /> Max HP
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={selectedPiece.maxHp}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        maxHp: Math.max(1, parseFloat(e.target.value) || 1),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <label className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Swords className="w-3.5 h-3.5 text-rose-400" /> Attack Power
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedPiece.attack}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        attack: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <label className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Shield className="w-3.5 h-3.5 text-sky-400" /> Armor / Defense
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={selectedPiece.defense}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        defense: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <label className="flex items-center gap-1.5 text-slate-400 mb-1">
                    <Footprints className="w-3.5 h-3.5 text-amber-400" /> Move Range (Spaces)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={selectedPiece.moveRange}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        moveRange: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <label className="block text-slate-400 mb-1">
                    Attack Range (Spaces)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={selectedPiece.attackRange}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        attackRange: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <label className="block text-slate-400 mb-1">
                    Starting Count / Player
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={selectedPiece.spawnCountPerPlayer}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        spawnCountPerPlayer: Math.max(
                          1,
                          parseInt(e.target.value, 10) || 1
                        ),
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>
              </div>

              {/* Movement Type & Respawn Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Movement Pattern
                  </label>
                  <select
                    value={selectedPiece.movementType}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        movementType: e.target.value as MovementPattern,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    <option value="orthogonal">Orthogonal Grid (4-Dir)</option>
                    <option value="omni">Omni / Hex / Diagonal</option>
                    <option value="track_forward">Track Forward Path</option>
                    <option value="graph_adjacent">Graph Connected Nodes</option>
                    <option value="jump">Jump / Flying (Ignores Walls)</option>
                    <option value="stationary">Stationary Structure / Tower</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Action Point (AP) Cost
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={selectedPiece.apCost}
                    onChange={(e) =>
                      handleUpdatePiece(selectedPiece.id, {
                        apCost: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
                  />
                </div>

                <div className="flex flex-col justify-center gap-2 pt-3">
                  <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedPiece.respawnOnDeath}
                      onChange={(e) =>
                        handleUpdatePiece(selectedPiece.id, {
                          respawnOnDeath: e.target.checked,
                        })
                      }
                      className="rounded border-slate-700"
                    />
                    Respawn at Spawn when defeated ({selectedPiece.respawnDelayTurns}t)
                  </label>
                </div>
              </div>

              {/* On-Kill Bounty Effects */}
              <div className="space-y-2 pt-3 border-t border-slate-800 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    On-Kill Bounty Effects (When this unit defeats an enemy piece)
                  </span>
                  <button
                    onClick={() =>
                      handleUpdatePiece(selectedPiece.id, {
                        onKillEffects: [
                          ...selectedPiece.onKillEffects,
                          {
                            id: `kill_eff_${Date.now()}`,
                            target: 'player',
                            statId: 'vp',
                            operation: 'add',
                            value: 1,
                          },
                        ],
                      })
                    }
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Bounty Effect
                  </button>
                </div>

                {selectedPiece.onKillEffects.map((eff, idx) => (
                  <div
                    key={eff.id}
                    className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800"
                  >
                    <span className="text-slate-400">Award Owner:</span>
                    <select
                      value={eff.statId}
                      onChange={(e) => {
                        const next = [...selectedPiece.onKillEffects];
                        next[idx] = { ...eff, statId: e.target.value };
                        handleUpdatePiece(selectedPiece.id, { onKillEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    >
                      {config.playerStats.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={eff.operation}
                      onChange={(e) => {
                        const next = [...selectedPiece.onKillEffects];
                        next[idx] = {
                          ...eff,
                          operation: e.target.value as 'add' | 'subtract',
                        };
                        handleUpdatePiece(selectedPiece.id, { onKillEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    >
                      <option value="add">+ Add</option>
                      <option value="subtract">- Subtract</option>
                    </select>
                    <input
                      type="number"
                      value={eff.value}
                      onChange={(e) => {
                        const next = [...selectedPiece.onKillEffects];
                        next[idx] = {
                          ...eff,
                          value: parseFloat(e.target.value) || 0,
                        };
                        handleUpdatePiece(selectedPiece.id, { onKillEffects: next });
                      }}
                      className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100"
                    />
                    <button
                      onClick={() =>
                        handleUpdatePiece(selectedPiece.id, {
                          onKillEffects: selectedPiece.onKillEffects.filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      className="text-slate-500 hover:text-rose-400 ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Select or create a piece archetype to configure its combat and movement behavior.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
