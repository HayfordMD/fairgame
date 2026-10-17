import React, { useRef, useState } from 'react';
import {
  BoardConfig,
  BoardTile,
  RuntimePieceState,
  TileType,
} from '../types/game';

export const TILE_TYPE_META: Record<
  TileType,
  { label: string; badge: string; bgHex: string; strokeHex: string; textHex: string }
> = {
  normal: {
    label: 'Normal Space',
    badge: '·',
    bgHex: '#1e293b',
    strokeHex: '#334155',
    textHex: '#94a3b8',
  },
  spawn: {
    label: 'Player Spawn',
    badge: '🚩',
    bgHex: '#1e3a8a',
    strokeHex: '#3b82f6',
    textHex: '#bfdbfe',
  },
  goal: {
    label: 'Victory / Goal',
    badge: '👑',
    bgHex: '#581c87',
    strokeHex: '#a855f7',
    textHex: '#f3e8ff',
  },
  obstacle: {
    label: 'Obstacle / Wall',
    badge: '🧱',
    bgHex: '#090d16',
    strokeHex: '#1e293b',
    textHex: '#475569',
  },
  hazard: {
    label: 'Hazard / Trap',
    badge: '🔥',
    bgHex: '#7f1d1d',
    strokeHex: '#ef4444',
    textHex: '#fecaca',
  },
  boost: {
    label: 'Boost / Shrine',
    badge: '⚡',
    bgHex: '#064e3b',
    strokeHex: '#10b981',
    textHex: '#a7f3d0',
  },
  shop: {
    label: 'Market / Sanctum',
    badge: '💎',
    bgHex: '#78350f',
    strokeHex: '#f59e0b',
    textHex: '#fde68a',
  },
  portal: {
    label: 'Warp Portal',
    badge: '🌀',
    bgHex: '#164e63',
    strokeHex: '#06b6d4',
    textHex: '#cffafe',
  },
  checkpoint: {
    label: 'Checkpoint Gate',
    badge: '🏁',
    bgHex: '#831843',
    strokeHex: '#ec4899',
    textHex: '#fbcfe8',
  },
};

const PLAYER_COLORS = [
  '#3b82f6', // P1 Blue
  '#f43f5e', // P2 Rose
  '#10b981', // P3 Emerald
  '#f59e0b', // P4 Amber
  '#a855f7', // P5 Purple
  '#06b6d4', // P6 Cyan
];

interface BoardVisualizerProps {
  board: BoardConfig;
  selectedTileId?: string | null;
  onSelectTile?: (tile: BoardTile) => void;
  onPaintTile?: (tile: BoardTile) => void;
  onMoveGraphNode?: (tileId: string, newX: number, newY: number) => void;
  pieces?: RuntimePieceState[];
  selectedPieceId?: string | null;
  onSelectPiece?: (piece: RuntimePieceState) => void;
  highlightedMoveTileIds?: string[];
  highlightedAttackTileIds?: string[];
  heatmapValues?: Record<string, number>;
  heatmapMode?: 'none' | 'visits' | 'deaths';
  interactivePaint?: boolean;
}

export const BoardVisualizer: React.FC<BoardVisualizerProps> = ({
  board,
  selectedTileId,
  onSelectTile,
  onPaintTile,
  onMoveGraphNode,
  pieces = [],
  selectedPieceId = null,
  onSelectPiece,
  highlightedMoveTileIds = [],
  highlightedAttackTileIds = [],
  heatmapValues,
  heatmapMode = 'none',
  interactivePaint = false,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const moveHighlightSet = new Set(highlightedMoveTileIds);
  const attackHighlightSet = new Set(highlightedAttackTileIds);

  const viewBoxWidth = 1000;
  const viewBoxHeight = 1000;

  // Compute normalized 0..1000 center coordinates for every tile so edges, heatmaps, and pieces work uniformly across all 4 topologies
  const tileCenters = new Map<string, { cx: number; cy: number; radius: number }>();

  if (board.topology === 'square_grid') {
    const cols = Math.max(1, board.width);
    const rows = Math.max(1, board.height);
    const pad = 60;
    const availW = viewBoxWidth - pad * 2;
    const availH = viewBoxHeight - pad * 2;
    const cellSize = Math.min(availW / cols, availH / rows);
    const offsetX = (viewBoxWidth - cellSize * cols) / 2;
    const offsetY = (viewBoxHeight - cellSize * rows) / 2;

    for (const t of board.tiles) {
      const c = t.col ?? t.x;
      const r = t.row ?? t.y;
      tileCenters.set(t.id, {
        cx: offsetX + c * cellSize + cellSize / 2,
        cy: offsetY + r * cellSize + cellSize / 2,
        radius: cellSize * 0.46,
      });
    }
  } else if (board.topology === 'hex_grid') {
    const cols = Math.max(1, board.width);
    const rows = Math.max(1, board.height);
    const pad = 70;
    const availW = viewBoxWidth - pad * 2;
    const availH = viewBoxHeight - pad * 2;
    const hexR = Math.min(availW / ((cols + 0.5) * Math.sqrt(3)), availH / (rows * 1.5 + 0.5));
    const hexW = Math.sqrt(3) * hexR;
    const hexH = 1.5 * hexR;
    const totalW = cols * hexW + hexW * 0.5;
    const totalH = (rows - 1) * hexH + hexR * 2;
    const startX = (viewBoxWidth - totalW) / 2 + hexW / 2;
    const startY = (viewBoxHeight - totalH) / 2 + hexR;

    for (const t of board.tiles) {
      const c = t.col ?? t.x;
      const r = t.row ?? t.y;
      const rowOffset = r % 2 === 1 ? hexW / 2 : 0;
      tileCenters.set(t.id, {
        cx: startX + c * hexW + rowOffset,
        cy: startY + r * hexH,
        radius: hexR * 0.94,
      });
    }
  } else {
    // 'track' or 'graph' use 0..1000 coordinates directly
    const nodeRadius = board.topology === 'track' ? 38 : 46;
    for (const t of board.tiles) {
      tileCenters.set(t.id, {
        cx: t.x,
        cy: t.y,
        radius: nodeRadius,
      });
    }
  }

  // Max heatmap value for color scaling
  let maxHeat = 1;
  if (heatmapMode !== 'none' && heatmapValues) {
    for (const val of Object.values(heatmapValues)) {
      if (val > maxHeat) maxHeat = val;
    }
  }

  const getHeatmapOverlayColor = (tileId: string): string | null => {
    if (heatmapMode === 'none' || !heatmapValues) return null;
    const val = heatmapValues[tileId] || 0;
    if (val <= 0) return 'rgba(15, 23, 42, 0.72)';
    const ratio = Math.min(1, val / maxHeat);
    if (heatmapMode === 'deaths') {
      // Dark amber to bright crimson
      const r = Math.round(140 + 115 * ratio);
      const g = Math.round(30 * (1 - ratio));
      const b = Math.round(40 * (1 - ratio));
      return `rgba(${r}, ${g}, ${b}, ${0.35 + ratio * 0.55})`;
    }
    // Visits: cool indigo to glowing cyan/emerald
    const r = Math.round(30 + 20 * ratio);
    const g = Math.round(80 + 165 * ratio);
    const b = Math.round(160 + 85 * (1 - ratio * 0.3));
    return `rgba(${r}, ${g}, ${b}, ${0.3 + ratio * 0.55})`;
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!draggingNodeId || !onMoveGraphNode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const normX = Math.max(
      50,
      Math.min(950, Math.round(((e.clientX - rect.left) / rect.width) * viewBoxWidth))
    );
    const normY = Math.max(
      50,
      Math.min(950, Math.round(((e.clientY - rect.top) / rect.height) * viewBoxHeight))
    );
    onMoveGraphNode(draggingNodeId, normX, normY);
  };

  // Group alive pieces by tileId
  const piecesByTile = new Map<string, RuntimePieceState[]>();
  for (const p of pieces) {
    if (!p.alive) continue;
    const list = piecesByTile.get(p.tileId) || [];
    list.push(p);
    piecesByTile.set(p.tileId, list);
  }

  const buildHexPolygonPoints = (cx: number, cy: number, r: number): string => {
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
    }
    return pts.join(' ');
  };

  return (
    <div
      className="relative w-full aspect-square max-h-[640px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden select-none shadow-inner"
      onMouseLeave={() => {
        setIsMouseDown(false);
        setDraggingNodeId(null);
      }}
      onMouseUp={() => {
        setIsMouseDown(false);
        setDraggingNodeId(null);
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
        className="w-full h-full"
        onPointerMove={handleSvgPointerMove}
        onPointerUp={() => setDraggingNodeId(null)}
      >
        <defs>
          <pattern id="minorGrid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="rgba(148, 163, 184, 0.06)"
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="trackArrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
          </marker>
        </defs>

        {/* Subtle blueprint background grid */}
        <rect width={viewBoxWidth} height={viewBoxHeight} fill="url(#minorGrid)" />

        {/* Optional Uploaded Board Plan Image Overlay */}
        {board.backgroundImageUrl && (
          <image
            href={board.backgroundImageUrl}
            x="0"
            y="0"
            width={viewBoxWidth}
            height={viewBoxHeight}
            preserveAspectRatio="xMidYMid slice"
            opacity={board.backgroundOpacity ?? 0.35}
          />
        )}

        {/* Connections / Edges for Track, Graph, and Portals */}
        {(board.topology === 'track' || board.topology === 'graph') &&
          board.tiles.map((t) => {
            const from = tileCenters.get(t.id);
            if (!from) return null;
            return t.connections.map((targetId) => {
              const to = tileCenters.get(targetId);
              if (!to) return null;
              // Calculate shortened endpoint for track arrow
              const dx = to.cx - from.cx;
              const dy = to.cy - from.cy;
              const len = Math.hypot(dx, dy) || 1;
              const endX = to.cx - (dx / len) * (to.radius + 4);
              const endY = to.cy - (dy / len) * (to.radius + 4);

              return (
                <line
                  key={`edge_${t.id}_${targetId}`}
                  x1={from.cx}
                  y1={from.cy}
                  x2={board.topology === 'track' ? endX : to.cx}
                  y2={board.topology === 'track' ? endY : to.cy}
                  stroke={board.topology === 'track' ? '#475569' : '#334155'}
                  strokeWidth={board.topology === 'track' ? 4 : 3}
                  strokeDasharray={board.topology === 'graph' ? '6 4' : undefined}
                  markerEnd={board.topology === 'track' ? 'url(#trackArrow)' : undefined}
                />
              );
            });
          })}

        {/* Portal links on any topology */}
        {board.tiles.map((t) => {
          if (!t.portalTargetId) return null;
          const from = tileCenters.get(t.id);
          const to = tileCenters.get(t.portalTargetId);
          if (!from || !to) return null;
          return (
            <path
              key={`portal_${t.id}_${t.portalTargetId}`}
              d={`M ${from.cx} ${from.cy} Q 500 500 ${to.cx} ${to.cy}`}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="3"
              strokeDasharray="8 6"
              opacity="0.8"
            />
          );
        })}

        {/* Render Tiles / Nodes */}
        {board.tiles.map((t) => {
          const center = tileCenters.get(t.id);
          if (!center) return null;
          const { cx, cy, radius } = center;
          const meta = TILE_TYPE_META[t.type] || TILE_TYPE_META.normal;
          const isSelected = selectedTileId === t.id;
          const isMoveTarget = moveHighlightSet.has(t.id);
          const isAttackTarget = attackHighlightSet.has(t.id);
          const heatColor = getHeatmapOverlayColor(t.id);
          const heatVal = heatmapValues?.[t.id] ?? 0;
          const tilePieces = piecesByTile.get(t.id) || [];

          const strokeColor = isAttackTarget
            ? '#f43f5e'
            : isMoveTarget
            ? '#34d399'
            : isSelected
            ? '#f8fafc'
            : meta.strokeHex;
          const strokeW =
            isAttackTarget || isMoveTarget || isSelected ? 4.5 : 2;

          const handleTileMouseDown = (e: React.PointerEvent) => {
            e.stopPropagation();
            setIsMouseDown(true);
            onSelectTile?.(t);
            if (interactivePaint && onPaintTile) {
              onPaintTile(t);
            } else if (
              (board.topology === 'graph' || board.topology === 'track') &&
              onMoveGraphNode
            ) {
              setDraggingNodeId(t.id);
            }
          };

          const handleTileMouseEnter = () => {
            if (isMouseDown && interactivePaint && onPaintTile) {
              onPaintTile(t);
            }
          };

          return (
            <g
              key={t.id}
              className="cursor-pointer transition-opacity"
              onPointerDown={handleTileMouseDown}
              onPointerEnter={handleTileMouseEnter}
            >
              {board.topology === 'square_grid' ? (
                <rect
                  x={cx - radius}
                  y={cy - radius}
                  width={radius * 2}
                  height={radius * 2}
                  rx={8}
                  fill={heatColor || t.color || meta.bgHex}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                />
              ) : board.topology === 'hex_grid' ? (
                <polygon
                  points={buildHexPolygonPoints(cx, cy, radius)}
                  fill={heatColor || t.color || meta.bgHex}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                />
              ) : (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={heatColor || t.color || meta.bgHex}
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                />
              )}

              {/* Legal Move / Attack Highlight Overlay */}
              {isMoveTarget && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius * 0.48}
                  fill="rgba(16, 185, 129, 0.22)"
                  stroke="#34d399"
                  strokeWidth="2.5"
                  strokeDasharray="5 3"
                />
              )}
              {isAttackTarget && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius * 0.68}
                  fill="rgba(244, 63, 94, 0.24)"
                  stroke="#fb7185"
                  strokeWidth="3"
                />
              )}

              {/* Tile Badge / Type Icon */}
              {t.type !== 'normal' && tilePieces.length === 0 && (
                <text
                  x={cx}
                  y={cy - 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={Math.max(14, Math.min(26, radius * 0.62))}
                >
                  {meta.badge}
                </text>
              )}

              {/* Tile Label */}
              <text
                x={cx}
                y={cy + radius * 0.58}
                textAnchor="middle"
                fill={meta.textHex}
                fontSize={Math.max(10, Math.min(14, radius * 0.28))}
                fontWeight="600"
              >
                {t.label.length > 11 ? `${t.label.slice(0, 10)}…` : t.label}
              </text>

              {/* Heatmap numeric overlay */}
              {heatmapMode !== 'none' && (
                <text
                  x={cx}
                  y={cy - radius * 0.45}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={Math.max(11, Math.min(15, radius * 0.34))}
                  fontWeight="700"
                >
                  {heatVal}
                </text>
              )}

              {/* Effect count indicator pill */}
              {(t.onEnterEffects.length > 0 || t.onTurnEndEffects.length > 0) &&
                heatmapMode === 'none' && (
                  <circle
                    cx={cx + radius * 0.62}
                    cy={cy - radius * 0.62}
                    r={6}
                    fill="#38bdf8"
                    stroke="#0f172a"
                    strokeWidth={1.5}
                  />
                )}

              {/* Render Pieces on this tile */}
              {tilePieces.map((piece, idx) => {
                const offsetAngle = (idx / Math.max(1, tilePieces.length)) * Math.PI * 2;
                const spread = tilePieces.length > 1 ? radius * 0.35 : 0;
                const px = cx + Math.cos(offsetAngle) * spread;
                const py = cy - 4 + Math.sin(offsetAngle) * spread;
                const pColor = PLAYER_COLORS[piece.ownerPlayerIndex % PLAYER_COLORS.length];
                const isPieceSelected = selectedPieceId === piece.instanceId;

                return (
                  <g
                    key={piece.instanceId}
                    onPointerDown={(e) => {
                      if (onSelectPiece && !isAttackTarget && !isMoveTarget) {
                        e.stopPropagation();
                        onSelectPiece(piece);
                        onSelectTile?.(t);
                      }
                    }}
                  >
                    {isPieceSelected && (
                      <circle
                        cx={px}
                        cy={py}
                        r={Math.max(19, radius * 0.56)}
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="3.5"
                        strokeDasharray="5 3"
                      />
                    )}
                    <circle
                      cx={px}
                      cy={py}
                      r={Math.max(14, radius * 0.44)}
                      fill={pColor}
                      stroke={isPieceSelected ? '#fde047' : '#ffffff'}
                      strokeWidth={isPieceSelected ? '3.5' : '2.5'}
                    />
                    <text
                      x={px}
                      y={py}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(14, radius * 0.46)}
                    >
                      {piece.symbol}
                    </text>
                    {/* Tiny HP bar under unit */}
                    <rect
                      x={px - 14}
                      y={py + Math.max(12, radius * 0.38)}
                      width={28}
                      height={5}
                      rx={2}
                      fill="#0f172a"
                    />
                    <rect
                      x={px - 14}
                      y={py + Math.max(12, radius * 0.38)}
                      width={Math.max(3, (28 * Math.max(0, piece.hp)) / Math.max(1, piece.maxHp))}
                      height={5}
                      rx={2}
                      fill="#22c55e"
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Top-left topology badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-indigo-400" />
        <span className="font-medium uppercase tracking-wider">
          {board.topology.replace('_', ' ')}
        </span>
        <span className="text-slate-500">•</span>
        <span>{board.tiles.length} Spaces</span>
      </div>
    </div>
  );
};
