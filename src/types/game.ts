export type BoardTopology = 'square_grid' | 'hex_grid' | 'track' | 'graph';

export type TileType =
  | 'normal'
  | 'spawn'
  | 'goal'
  | 'obstacle'
  | 'hazard'
  | 'boost'
  | 'shop'
  | 'portal'
  | 'checkpoint';

export interface StatEffect {
  id: string;
  target: 'player' | 'piece' | 'global';
  statId: string; // e.g., 'hp', 'gold', 'vp', 'ap', 'mana'
  operation: 'add' | 'subtract' | 'set' | 'multiply';
  value: number;
}

export interface BoardTile {
  id: string;
  label: string;
  x: number; // Grid col or 0..1000 canvas X
  y: number; // Grid row or 0..1000 canvas Y
  row?: number;
  col?: number;
  type: TileType;
  spawnPlayerIndex?: number; // 0-indexed player or undefined for any
  color?: string;
  moveCost: number;
  connections: string[]; // IDs of connected tiles (used in track & graph, or extra bridges in grid)
  portalTargetId?: string;
  onEnterEffects: StatEffect[];
  onTurnEndEffects: StatEffect[];
}

export interface BoardConfig {
  topology: BoardTopology;
  width: number;
  height: number;
  loopTrack: boolean;
  backgroundImageUrl?: string;
  backgroundOpacity: number;
  tiles: BoardTile[];
}

export interface StatDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  initialValue: number;
  minValue: number;
  maxValue: number;
  regenPerTurn: number;
  description: string;
}

export interface GlobalVarDefinition {
  id: string;
  name: string;
  initialValue: number;
  changePerRound: number;
  minValue: number;
  maxValue: number;
  description: string;
}

export type MovementPattern =
  | 'orthogonal'
  | 'diagonal'
  | 'omni'
  | 'track_forward'
  | 'graph_adjacent'
  | 'jump'
  | 'stationary';

export interface PieceArchetype {
  id: string;
  name: string;
  symbol: string;
  color: string;
  ownerType: 'all_players' | 'specific_player' | 'neutral';
  specificPlayerIndex?: number;
  spawnCountPerPlayer: number;
  maxHp: number;
  attack: number;
  defense: number;
  moveRange: number;
  attackRange: number;
  apCost: number;
  movementType: MovementPattern;
  canCaptureGoal: boolean;
  respawnOnDeath: boolean;
  respawnDelayTurns: number;
  onAttackEffects: StatEffect[];
  onKillEffects: StatEffect[];
  description: string;
}

export interface DeckDefinition {
  id: string;
  name: string;
  color: string;
  drawPerTurn: number;
  reshuffleDiscard: boolean;
  description: string;
}

export type CardTargetType =
  | 'self'
  | 'enemy_player'
  | 'friendly_piece'
  | 'enemy_piece'
  | 'any_tile';

export interface CardEffect {
  id: string;
  type:
    | 'modify_player_stat'
    | 'modify_enemy_stat'
    | 'damage_piece'
    | 'heal_piece'
    | 'push_move_piece'
    | 'draw_cards'
    | 'steal_stat'
    | 'boost_piece_attack'
    | 'teleport_to_goal_step';
  statId?: string;
  value: number;
}

export interface CardDefinition {
  id: string;
  deckId: string;
  name: string;
  copies: number;
  costStatId: string;
  costAmount: number;
  targetType: CardTargetType;
  conditionExpr?: string; // e.g. "player.gold >= 2" or "turn >= 3"
  formulaExpr?: string; // e.g. "player.vp += 1; enemy.hp -= 3"
  effects: CardEffect[];
  description: string;
  tags: string[];
}

export type AIArchetype =
  | 'balanced'
  | 'aggressive'
  | 'rusher'
  | 'economic'
  | 'defensive'
  | 'random';

export type TurnPhaseType =
  | 'upkeep'
  | 'draw'
  | 'roll_and_move'
  | 'action_points'
  | 'play_cards'
  | 'combat'
  | 'end_turn';

export interface TurnPhase {
  id: string;
  name: string;
  type: TurnPhaseType;
  enabled: boolean;
  maxCardsToPlay?: number;
  deckIdToDraw?: string;
  bonusAp?: number;
  description: string;
}

export interface TurnConfig {
  playerCount: number;
  maxTurns: number; // Max full rounds before stalemate/timeout check
  startingHandSize: number;
  maxHandSize: number;
  diceCount: number;
  diceSides: number;
  actionPointsPerTurn: number;
  firstPlayerAdvantageMitigation: boolean; // e.g. P2+ gets +1 bonus resource or card on turn 1
  playerStrategies: AIArchetype[];
  phases: TurnPhase[];
}

export type WinConditionType =
  | 'stat_threshold'
  | 'reach_goal_tile'
  | 'control_goal_tiles'
  | 'eliminate_all_enemies'
  | 'last_player_standing'
  | 'highest_stat_at_max_turns';

export type ComparisonOperator = '>=' | '<=' | '==' | '>' | '<';

export interface WinCondition {
  id: string;
  name: string;
  enabled: boolean;
  type: WinConditionType;
  statId?: string;
  operator?: ComparisonOperator;
  targetValue?: number;
  isLossCondition?: boolean; // If true, triggers player elimination instead of victory
  description: string;
}

export type RuleTriggerEvent =
  | 'ON_GAME_START'
  | 'ON_TURN_START'
  | 'ON_MOVE'
  | 'ON_LAND_TILE'
  | 'ON_COMBAT'
  | 'ON_CARD_PLAY'
  | 'ON_PIECE_DEATH'
  | 'ON_TURN_END'
  | 'ON_ROUND_END';

export interface RuleAction {
  id: string;
  type:
    | 'modify_stat'
    | 'damage_active_piece'
    | 'heal_active_piece'
    | 'move_forward'
    | 'draw_card'
    | 'grant_ap'
    | 'modify_global'
    | 'trigger_again_check'
    | 'custom_formula';
  statId?: string;
  operation?: 'add' | 'subtract' | 'set' | 'multiply';
  value: number;
  formula?: string;
}

export interface RuleTrigger {
  id: string;
  name: string;
  enabled: boolean;
  trigger: RuleTriggerEvent;
  conditionType: 'always' | 'stat_compare' | 'tile_type' | 'turn_compare' | 'custom_expr';
  conditionStatId?: string;
  conditionOperator?: ComparisonOperator;
  conditionValue?: number;
  conditionTileType?: TileType;
  customConditionExpr?: string;
  actions: RuleAction[];
  maxTriggersPerTurn: number; // 0 = unlimited (can cause infinite loops if self-triggering!)
  description: string;
}

export interface GameConfig {
  id: string;
  name: string;
  version: string;
  genre: string;
  description: string;
  author: string;
  board: BoardConfig;
  playerStats: StatDefinition[];
  globalVars: GlobalVarDefinition[];
  pieces: PieceArchetype[];
  decks: DeckDefinition[];
  cards: CardDefinition[];
  turnConfig: TurnConfig;
  winConditions: WinCondition[];
  rules: RuleTrigger[];
}

// Simulation & Telemetry Types
export interface RuntimePieceState {
  instanceId: string;
  archetypeId: string;
  name: string;
  symbol: string;
  ownerPlayerIndex: number;
  tileId: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  alive: boolean;
  respawnTimer: number;
}

export interface RuntimePlayerState {
  playerIndex: number;
  name: string;
  strategy: AIArchetype;
  stats: Record<string, number>;
  hand: string[]; // card IDs
  eliminated: boolean;
  turnsTaken: number;
  cardsPlayedCount: number;
  movesCount: number;
  attacksCount: number;
}

export interface ReplayTurnSnapshot {
  round: number;
  activePlayerIndex: number;
  players: RuntimePlayerState[];
  pieces: RuntimePieceState[];
  globalVars: Record<string, number>;
  events: string[];
}

export interface SimulatedGameLog {
  gameIndex: number;
  label: string; // e.g., "Fastest Win (Exploit Check)", "Stalemate / Timeout", "Loop Detected", "Median Game"
  winnerPlayerIndex: number | null; // null if draw/stalemate/loop
  winnerStrategy: AIArchetype | null;
  winConditionName: string;
  outcomeType: 'win' | 'stalemate_timeout' | 'infinite_loop' | 'deadlock_no_moves' | 'mutual_elimination';
  totalRounds: number;
  totalActions: number;
  snapshots: ReplayTurnSnapshot[];
}

export interface CardTelemetry {
  cardId: string;
  cardName: string;
  deckName: string;
  costSummary: string;
  timesDrawn: number;
  timesPlayed: number;
  playRateWhenDrawn: number; // 0..1
  gamesWherePlayed: number;
  winsWhenPlayed: number;
  winRateWhenPlayed: number; // 0..1
  winRateDelta: number; // difference from baseline 1/N win rate
}

export interface PieceTelemetry {
  archetypeId: string;
  pieceName: string;
  symbol: string;
  spawns: number;
  kills: number;
  deaths: number;
  kdRatio: number;
  survivalRate: number;
  goalCaptures: number;
  damageDealt: number;
}

export interface DiagnosticPatch {
  id: string;
  label: string;
  description: string;
  category: 'rule' | 'card' | 'piece' | 'turn' | 'board' | 'win_condition';
  apply: (config: GameConfig) => GameConfig;
}

export interface DiagnosticIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category:
    | 'infinite_loop'
    | 'stalemate'
    | 'first_player_bias'
    | 'dominant_strategy'
    | 'overpowered_card'
    | 'dead_card'
    | 'unbalanced_piece'
    | 'economy_broken'
    | 'unreachable_board';
  title: string;
  summary: string;
  technicalDetail: string;
  metricBadge: string;
  fixes: DiagnosticPatch[];
}

export interface SimulationBatchSummary {
  id: string;
  timestamp: number;
  configName: string;
  totalGames: number;
  durationMs: number;
  randomizeStrategies: boolean;
  // Outcomes
  winsBySeat: number[]; // length = playerCount
  winRatesBySeat: number[];
  winsByStrategy: Record<AIArchetype, { games: number; wins: number; winRate: number }>;
  winsByCondition: Record<string, number>;
  outcomeCounts: {
    win: number;
    stalemate_timeout: number;
    infinite_loop: number;
    deadlock_no_moves: number;
    mutual_elimination: number;
  };
  // Turn stats
  avgRounds: number;
  medianRounds: number;
  minRounds: number;
  maxRounds: number;
  p90Rounds: number;
  roundHistogram: { bucketLabel: string; min: number; max: number; count: number }[];
  // Component stats
  cardTelemetry: CardTelemetry[];
  pieceTelemetry: PieceTelemetry[];
  tileVisits: Record<string, number>;
  tileDeaths: Record<string, number>;
  // Economy curves: roundIndex -> statId -> average value across players
  economyCurves: { round: number; stats: Record<string, number> }[];
  // Automated Flaw & Hole Detection
  issues: DiagnosticIssue[];
  healthScore: number; // 0..100 overall game health/balance score
  // Notable Replays
  notableGames: SimulatedGameLog[];
}
