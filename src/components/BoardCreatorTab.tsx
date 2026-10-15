import React, { useState } from 'react';
import {
  Grid,
  Hexagon,
  GitBranch,
  Repeat,
  Paintbrush,
  MousePointer,
  Upload,
  Plus,
  Trash2,
  FileSpreadsheet,
  Image as ImageIcon,
  Link as LinkIcon,
} from 'lucide-react';
import {
  BoardConfig,
  BoardTile,
  BoardTopology,
  GameConfig,
  StatEffect,
  TileType,
} from '../types/game';
import {
  generateGraphBoard,
  generateHexGrid,
  generateSquareGrid,
  generateTrackBoard,
} from '../data/presets';
import { parseBoardMatrixText } from '../utils/importers';
import { BoardVisualizer, TILE_TYPE_META } from './BoardVisualizer';

interface BoardCreatorTabProps {
  config: GameConfig;
  onChangeBoard: (newBoard: BoardConfig) => void;
}

export const BoardCreatorTab: React.FC<BoardCreatorTabProps> = ({
  config,
  onChangeBoard,
}) => {
  const { board, playerStats } = config;
  const [editorMode, setEditorMode] = useState<'select' | 'paint'>('select');
  const [activeBrush, setActiveBrush] = useState<TileType>('goal');
  const [selectedTileId, setSelectedTileId] = useState<string | null>(
    board.tiles[0]?.id || null
  );
  const [gridW, setGridW] = useState<number>(board.topology === 'track' ? 20 : board.width || 7);
  const [gridH, setGridH] = useState<number>(board.height || 7);
  const [showMatrixModal, setShowMatrixModal] = useState(false);
  const [matrixInput, setMatrixInput] = useState(
    `S . . # . . .\n. + . . . X .\n. . . G . . .\n. X . . . + .\n. . . # . . S`
  );

  const selectedTile = board.tiles.find((t) => t.id === selectedTileId) || null;

  const handleSwitchTopology = (topology: BoardTopology) => {
    let nextBoard: BoardConfig;
    if (topology === 'square_grid') {
      const w = Math.max(3, Math.min(14, gridW > 14 ? 7 : gridW));
      const h = Math.max(3, Math.min(14, gridH > 14 ? 7 : gridH));
      setGridW(w);
      setGridH(h);
      nextBoard = generateSquareGrid(w, h);
    } else if (topology === 'hex_grid') {
      const w = Math.max(3, Math.min(14, gridW > 14 ? 7 : gridW));
      const h = Math.max(3, Math.min(14, gridH > 14 ? 7 : gridH));
      setGridW(w);
      setGridH(h);
      nextBoard = generateHexGrid(w, h);
    } else if (topology === 'track') {
      const len = Math.max(8, Math.min(40, gridW < 8 ? 20 : gridW));
      setGridW(len);
      nextBoard = generateTrackBoard(len, true);
    } else {
      nextBoard = generateGraphBoard();
    }
    nextBoard.backgroundImageUrl = board.backgroundImageUrl;
    nextBoard.backgroundOpacity = board.backgroundOpacity;
    onChangeBoard(nextBoard);
    setSelectedTileId(nextBoard.tiles[0]?.id || null);
  };

  const handleResizeBoard = () => {
    if (board.topology === 'square_grid') {
      const next = generateSquareGrid(
        Math.max(3, Math.min(14, gridW)),
        Math.max(3, Math.min(14, gridH))
      );
      next.backgroundImageUrl = board.backgroundImageUrl;
      onChangeBoard(next);
    } else if (board.topology === 'hex_grid') {
      const next = generateHexGrid(
        Math.max(3, Math.min(14, gridW)),
        Math.max(3, Math.min(14, gridH))
      );
      next.backgroundImageUrl = board.backgroundImageUrl;
      onChangeBoard(next);
    } else if (board.topology === 'track') {
      const next = generateTrackBoard(Math.max(6, Math.min(40, gridW)), board.loopTrack);
      next.backgroundImageUrl = board.backgroundImageUrl;
      onChangeBoard(next);
    }
  };

  const applyBrushToTile = (tile: BoardTile) => {
    const defaultEnter: StatEffect[] = [];
    const defaultTurnEnd: StatEffect[] = [];

    if (activeBrush === 'goal') {
      defaultTurnEnd.push({
        id: `eff_goal_${Date.now()}`,
        target: 'player',
        statId: 'vp',
        operation: 'add',
        value: 2,
      });
    } else if (activeBrush === 'hazard') {
      defaultEnter.push({
        id: `eff_haz_${Date.now()}`,
        target: 'piece',
        statId: 'hp',
        operation: 'subtract',
        value: 3,
      });
    } else if (activeBrush === 'boost') {
      const firstResource = playerStats.find((s) => s.id !== 'hp' && s.id !== 'vp')?.id || 'mana';
      defaultEnter.push({
        id: `eff_bst_${Date.now()}`,
        target: 'player',
        statId: firstResource,
        operation: 'add',
        value: 2,
      });
    } else if (activeBrush === 'shop') {
      defaultEnter.push({
        id: `eff_shp_${Date.now()}`,
        target: 'player',
        statId: 'gold',
        operation: 'add',
        value: 2,
      });
    }

    const updatedTiles = board.tiles.map((t) =>
      t.id === tile.id
        ? {
            ...t,
            type: activeBrush,
            onEnterEffects: defaultEnter,
            onTurnEndEffects: defaultTurnEnd,
          }
        : t
    );
    onChangeBoard({ ...board, tiles: updatedTiles });
  };

  const updateSelectedTile = (patch: Partial<BoardTile>) => {
    if (!selectedTile) return;
    onChangeBoard({
      ...board,
      tiles: board.tiles.map((t) => (t.id === selectedTile.id ? { ...t, ...patch } : t)),
    });
  };

  const handleMoveGraphNode = (tileId: string, newX: number, newY: number) => {
    onChangeBoard({
      ...board,
      tiles: board.tiles.map((t) => (t.id === tileId ? { ...t, x: newX, y: newY } : t)),
    });
  };

  const handleAddGraphNode = () => {
    const newId = `node_${Date.now().toString().slice(-4)}`;
    const newNode: BoardTile = {
      id: newId,
      label: `Node ${board.tiles.length + 1}`,
      x: 500 + Math.round((Math.random() - 0.5) * 220),
      y: 500 + Math.round((Math.random() - 0.5) * 220),
      type: 'normal',
      moveCost: 1,
      connections: selectedTile ? [selectedTile.id] : [],
      onEnterEffects: [],
      onTurnEndEffects: [],
    };
    const nextTiles = board.tiles.map((t) =>
      selectedTile && t.id === selectedTile.id
        ? { ...t, connections: [...t.connections, newId] }
        : t
    );
    onChangeBoard({
      ...board,
      tiles: [...nextTiles, newNode],
    });
    setSelectedTileId(newId);
  };

  const handleDeleteSelectedNode = () => {
    if (!selectedTile || board.tiles.length <= 2) return;
    const remaining = board.tiles
      .filter((t) => t.id !== selectedTile.id)
      .map((t) => ({
        ...t,
        connections: t.connections.filter((cid) => cid !== selectedTile.id),
      }));
    onChangeBoard({ ...board, tiles: remaining });
    setSelectedTileId(remaining[0]?.id || null);
  };

  const handleToggleConnection = (targetId: string) => {
    if (!selectedTile || selectedTile.id === targetId) return;
    const exists = selectedTile.connections.includes(targetId);
    const updatedTiles = board.tiles.map((t) => {
      if (t.id === selectedTile.id) {
        return {
          ...t,
          connections: exists
            ? t.connections.filter((id) => id !== targetId)
            : [...t.connections, targetId],
        };
      }
      if (board.topology === 'graph' && t.id === targetId) {
        // Make bidirectional in graph mode
        const revExists = t.connections.includes(selectedTile.id);
        return {
          ...t,
          connections: exists
            ? t.connections.filter((id) => id !== selectedTile.id)
            : revExists
            ? t.connections
            : [...t.connections, selectedTile.id],
        };
      }
      return t;
    });
    onChangeBoard({ ...board, tiles: updatedTiles });
  };

  const handleUploadBoardImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeBoard({
          ...board,
          backgroundImageUrl: reader.result,
          backgroundOpacity: board.backgroundOpacity || 0.45,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImportMatrixPlan = () => {
    const tiles = parseBoardMatrixText(matrixInput);
    if (tiles.length === 0) return;
    const maxRow = Math.max(...tiles.map((t) => t.row ?? 0)) + 1;
    const maxCol = Math.max(...tiles.map((t) => t.col ?? 0)) + 1;
    onChangeBoard({
      ...board,
      topology: 'square_grid',
      width: maxCol,
      height: maxRow,
      tiles,
    });
    setGridW(maxCol);
    setGridH(maxRow);
    setShowMatrixModal(false);
    setSelectedTileId(tiles[0]?.id || null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left / Center Column: Board Controls + Interactive Canvas */}
      <div className="lg:col-span-8 space-y-4">
        {/* Top Toolbar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Topology Selector */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'square_grid', label: 'Square Grid', Icon: Grid },
                  { id: 'hex_grid', label: 'Hex Grid', Icon: Hexagon },
                  { id: 'track', label: 'Track / Path', Icon: Repeat },
                  { id: 'graph', label: 'Node / Map', Icon: GitBranch },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => handleSwitchTopology(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    board.topology === id
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Upload Blueprint Image & Matrix Plan */}
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer border border-slate-700 transition-colors">
                <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Blueprint Image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadBoardImage}
                />
              </label>
              <button
                onClick={() => setShowMatrixModal(!showMatrixModal)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Upload Text/CSV Plan</span>
              </button>
            </div>
          </div>

          {/* Second Row: Dimensions / Graph Actions + Mode Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
            {board.topology === 'square_grid' || board.topology === 'hex_grid' ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">Dimensions:</span>
                <input
                  type="number"
                  min={3}
                  max={14}
                  value={gridW}
                  onChange={(e) => setGridW(parseInt(e.target.value, 10) || 7)}
                  className="w-14 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
                <span className="text-slate-500">×</span>
                <input
                  type="number"
                  min={3}
                  max={14}
                  value={gridH}
                  onChange={(e) => setGridH(parseInt(e.target.value, 10) || 7)}
                  className="w-14 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
                <button
                  onClick={handleResizeBoard}
                  className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded font-medium"
                >
                  Rebuild Grid
                </button>
              </div>
            ) : board.topology === 'track' ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-400">Track Spaces:</span>
                <input
                  type="number"
                  min={6}
                  max={40}
                  value={gridW}
                  onChange={(e) => setGridW(parseInt(e.target.value, 10) || 20)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-100"
                />
                <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={board.loopTrack}
                    onChange={(e) =>
                      onChangeBoard(generateTrackBoard(gridW, e.target.checked))
                    }
                    className="rounded border-slate-700"
                  />
                  Looping Circuit
                </label>
                <button
                  onClick={handleResizeBoard}
                  className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded font-medium"
                >
                  Apply Track
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={handleAddGraphNode}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded font-medium"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Map Node
                </button>
                <span className="text-slate-400">
                  Tip: Drag nodes directly on the canvas to position territories.
                </span>
              </div>
            )}

            {/* Interaction Mode Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setEditorMode('select')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium ${
                  editorMode === 'select'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MousePointer className="w-3.5 h-3.5" /> Inspect / Move
              </button>
              <button
                onClick={() => setEditorMode('paint')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium ${
                  editorMode === 'paint'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Paintbrush className="w-3.5 h-3.5" /> Paint Brush
              </button>
            </div>
          </div>

          {/* Paint Palette Bar */}
          {editorMode === 'paint' && (
            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-xs text-slate-400 mb-2">
                Select Tile Brush (Click or drag on board spaces to paint):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(TILE_TYPE_META) as TileType[]).map((tType) => {
                  const meta = TILE_TYPE_META[tType];
                  const active = activeBrush === tType;
                  return (
                    <button
                      key={tType}
                      onClick={() => setActiveBrush(tType)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        active
                          ? 'border-white bg-slate-800 text-white shadow-sm scale-105'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{meta.badge}</span>
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional Background Image Opacity Controls */}
          {board.backgroundImageUrl && (
            <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-slate-400">Blueprint Overlay Opacity:</span>
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={board.backgroundOpacity ?? 0.4}
                  onChange={(e) =>
                    onChangeBoard({
                      ...board,
                      backgroundOpacity: parseFloat(e.target.value),
                    })
                  }
                  className="w-32"
                />
              </div>
              <button
                onClick={() =>
                  onChangeBoard({ ...board, backgroundImageUrl: undefined })
                }
                className="text-rose-400 hover:text-rose-300"
              >
                Remove Blueprint Image
              </button>
            </div>
          )}
        </div>

        {/* Text/CSV Matrix Uploader Modal Drawer */}
        {showMatrixModal && (
          <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-100">
                Import ASCII / CSV Board Plan Matrix
              </h4>
              <button
                onClick={() => setShowMatrixModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Use symbols separated by spaces or commas:{' '}
              <code className="text-indigo-300">S</code>=Spawn,{' '}
              <code className="text-indigo-300">G</code>=Goal/Objective,{' '}
              <code className="text-indigo-300">#</code>=Obstacle/Wall,{' '}
              <code className="text-indigo-300">X</code>=Hazard,{' '}
              <code className="text-indigo-300">+</code>=Boost,{' '}
              <code className="text-indigo-300">$</code>=Market/Shop,{' '}
              <code className="text-indigo-300">.</code>=Normal.
            </p>
            <textarea
              rows={5}
              value={matrixInput}
              onChange={(e) => setMatrixInput(e.target.value)}
              className="w-full font-mono text-xs bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-200"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={handleImportMatrixPlan}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
              >
                <Upload className="w-3.5 h-3.5" /> Generate Board from Matrix
              </button>
            </div>
          </div>
        )}

        {/* Interactive SVG Board Canvas */}
        <BoardVisualizer
          board={board}
          selectedTileId={selectedTileId}
          onSelectTile={(t) => setSelectedTileId(t.id)}
          onPaintTile={applyBrushToTile}
          onMoveGraphNode={handleMoveGraphNode}
          interactivePaint={editorMode === 'paint'}
        />
      </div>

      {/* Right Column: Selected Space / Tile Inspector */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Space / Node Inspector
              </h3>
              <p className="text-xs text-slate-400">
                Click any tile on the board to configure its rules & effects
              </p>
            </div>
            {(board.topology === 'graph' || board.topology === 'track') &&
              selectedTile && (
                <button
                  onClick={handleDeleteSelectedNode}
                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20"
                  title="Delete Node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
          </div>

          {selectedTile ? (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Space Label</label>
                  <input
                    type="text"
                    value={selectedTile.label}
                    onChange={(e) => updateSelectedTile({ label: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Tile Type</label>
                  <select
                    value={selectedTile.type}
                    onChange={(e) =>
                      updateSelectedTile({ type: e.target.value as TileType })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    {(Object.keys(TILE_TYPE_META) as TileType[]).map((k) => (
                      <option key={k} value={k}>
                        {TILE_TYPE_META[k].badge} {TILE_TYPE_META[k].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedTile.type === 'spawn' && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    Assigned Spawn Player
                  </label>
                  <select
                    value={
                      selectedTile.spawnPlayerIndex !== undefined
                        ? String(selectedTile.spawnPlayerIndex)
                        : 'any'
                    }
                    onChange={(e) =>
                      updateSelectedTile({
                        spawnPlayerIndex:
                          e.target.value === 'any'
                            ? undefined
                            : parseInt(e.target.value, 10),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="any">Any Player (Shared Start)</option>
                    {Array.from({ length: 6 }, (_, i) => (
                      <option key={i} value={String(i)}>
                        Player {i + 1} Spawn Only
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Portal Target Selector */}
              {selectedTile.type === 'portal' && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    Portal Destination Tile
                  </label>
                  <select
                    value={selectedTile.portalTargetId || ''}
                    onChange={(e) =>
                      updateSelectedTile({
                        portalTargetId: e.target.value || undefined,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="">-- Select Linked Portal Space --</option>
                    {board.tiles
                      .filter((t) => t.id !== selectedTile.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} ({t.id})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* On-Enter Effects */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">
                    On-Land / Enter Effects
                  </span>
                  <button
                    onClick={() =>
                      updateSelectedTile({
                        onEnterEffects: [
                          ...selectedTile.onEnterEffects,
                          {
                            id: `eff_en_${Date.now()}`,
                            target: 'player',
                            statId: playerStats[0]?.id || 'vp',
                            operation: 'add',
                            value: 1,
                          },
                        ],
                      })
                    }
                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Effect
                  </button>
                </div>
                {selectedTile.onEnterEffects.length === 0 && (
                  <p className="text-slate-500 italic">No on-enter stat effects.</p>
                )}
                {selectedTile.onEnterEffects.map((eff, idx) => (
                  <div
                    key={eff.id}
                    className="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800"
                  >
                    <select
                      value={eff.target}
                      onChange={(e) => {
                        const next = [...selectedTile.onEnterEffects];
                        next[idx] = {
                          ...eff,
                          target: e.target.value as StatEffect['target'],
                        };
                        updateSelectedTile({ onEnterEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                    >
                      <option value="player">Player</option>
                      <option value="piece">Unit</option>
                    </select>
                    <select
                      value={eff.statId}
                      onChange={(e) => {
                        const next = [...selectedTile.onEnterEffects];
                        next[idx] = { ...eff, statId: e.target.value };
                        updateSelectedTile({ onEnterEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 flex-1"
                    >
                      {playerStats.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="hp">Unit HP</option>
                    </select>
                    <select
                      value={eff.operation}
                      onChange={(e) => {
                        const next = [...selectedTile.onEnterEffects];
                        next[idx] = {
                          ...eff,
                          operation: e.target.value as StatEffect['operation'],
                        };
                        updateSelectedTile({ onEnterEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                    >
                      <option value="add">+</option>
                      <option value="subtract">-</option>
                      <option value="set">=</option>
                    </select>
                    <input
                      type="number"
                      value={eff.value}
                      onChange={(e) => {
                        const next = [...selectedTile.onEnterEffects];
                        next[idx] = {
                          ...eff,
                          value: parseFloat(e.target.value) || 0,
                        };
                        updateSelectedTile({ onEnterEffects: next });
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
                    />
                    <button
                      onClick={() =>
                        updateSelectedTile({
                          onEnterEffects: selectedTile.onEnterEffects.filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* On-Turn-End Effects */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">
                    End-of-Turn Hold Effects
                  </span>
                  <button
                    onClick={() =>
                      updateSelectedTile({
                        onTurnEndEffects: [
                          ...selectedTile.onTurnEndEffects,
                          {
                            id: `eff_te_${Date.now()}`,
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
                    <Plus className="w-3.5 h-3.5" /> Add Hold Bonus
                  </button>
                </div>
                {selectedTile.onTurnEndEffects.length === 0 && (
                  <p className="text-slate-500 italic">
                    No end-of-turn holding effects.
                  </p>
                )}
                {selectedTile.onTurnEndEffects.map((eff, idx) => (
                  <div
                    key={eff.id}
                    className="flex items-center gap-1.5 bg-slate-950 p-2 rounded-lg border border-slate-800"
                  >
                    <select
                      value={eff.target}
                      onChange={(e) => {
                        const next = [...selectedTile.onTurnEndEffects];
                        next[idx] = {
                          ...eff,
                          target: e.target.value as StatEffect['target'],
                        };
                        updateSelectedTile({ onTurnEndEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                    >
                      <option value="player">Player</option>
                      <option value="piece">Unit</option>
                    </select>
                    <select
                      value={eff.statId}
                      onChange={(e) => {
                        const next = [...selectedTile.onTurnEndEffects];
                        next[idx] = { ...eff, statId: e.target.value };
                        updateSelectedTile({ onTurnEndEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200 flex-1"
                    >
                      {playerStats.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="hp">Unit HP</option>
                    </select>
                    <select
                      value={eff.operation}
                      onChange={(e) => {
                        const next = [...selectedTile.onTurnEndEffects];
                        next[idx] = {
                          ...eff,
                          operation: e.target.value as StatEffect['operation'],
                        };
                        updateSelectedTile({ onTurnEndEffects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200"
                    >
                      <option value="add">+</option>
                      <option value="subtract">-</option>
                    </select>
                    <input
                      type="number"
                      value={eff.value}
                      onChange={(e) => {
                        const next = [...selectedTile.onTurnEndEffects];
                        next[idx] = {
                          ...eff,
                          value: parseFloat(e.target.value) || 0,
                        };
                        updateSelectedTile({ onTurnEndEffects: next });
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
                    />
                    <button
                      onClick={() =>
                        updateSelectedTile({
                          onTurnEndEffects: selectedTile.onTurnEndEffects.filter(
                            (_, i) => i !== idx
                          ),
                        })
                      }
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Graph / Track Edge Connections Editor */}
              {(board.topology === 'graph' || board.topology === 'track') && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1.5 font-medium text-slate-200">
                    <LinkIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Connected Spaces / Edges ({selectedTile.connections.length})</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {board.tiles
                      .filter((t) => t.id !== selectedTile.id)
                      .map((other) => {
                        const linked = selectedTile.connections.includes(other.id);
                        return (
                          <label
                            key={other.id}
                            className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-950 border border-slate-800/80 cursor-pointer hover:border-slate-700"
                          >
                            <span className="text-slate-300">{other.label}</span>
                            <input
                              type="checkbox"
                              checked={linked}
                              onChange={() => handleToggleConnection(other.id)}
                              className="rounded border-slate-700"
                            />
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Select a space on the board to configure its properties.
            </p>
          )}
        </div>

        {/* Board Summary Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
          <div className="font-semibold text-slate-200">Board Balance Checklist</div>
          <div className="grid grid-cols-2 gap-2 text-slate-400">
            <div>
              🚩 Spawn Spaces:{' '}
              <span className="text-slate-100 font-semibold">
                {board.tiles.filter((t) => t.type === 'spawn').length}
              </span>
            </div>
            <div>
              👑 Goal Spaces:{' '}
              <span className="text-slate-100 font-semibold">
                {board.tiles.filter((t) => t.type === 'goal').length}
              </span>
            </div>
            <div>
              🔥 Hazard Spaces:{' '}
              <span className="text-slate-100 font-semibold">
                {board.tiles.filter((t) => t.type === 'hazard').length}
              </span>
            </div>
            <div>
              ⚡ Boost / Shops:{' '}
              <span className="text-slate-100 font-semibold">
                {
                  board.tiles.filter(
                    (t) => t.type === 'boost' || t.type === 'shop'
                  ).length
                }
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
