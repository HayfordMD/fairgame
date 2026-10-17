import {
  AIArchetype,
  BoardConfig,
  BoardTile,
  CardDefinition,
  ComparisonOperator,
  GameConfig,
  PieceArchetype,
  RuleTriggerEvent,
  RuntimePieceState,
  RuntimePlayerState,
  StatEffect,
} from '../types/game';
import { evaluateCustomCondition, executeCustomFormula } from './simulator';

export type SeatControlMode = 'human' | 'ai';

export type LogCategory =
  | 'GAME'
  | 'TURN'
  | 'PHASE'
  | 'DICE'
  | 'DRAW'
  | 'CARD'
  | 'MOVE'
  | 'COMBAT'
  | 'RULE_TRIGGER'
  | 'TILE_EFFECT'
  | 'WIN_LOSS';

export interface LiveLogEntry {
  id: string;
  stepNumber: number;
  round: number;
  playerIndex: number;
  phaseName: string;
  category: LogCategory;
  headline: string;
  details?: string;
  severity: 'normal' | 'highlight' | 'warning' | 'critical';
}

export interface LiveMatchState {
  configId: string;
  round: number;
  activePlayerIndex: number;
  activePhaseIndex: number; // index into enabledPhases
  phaseReadyForInput: boolean;
  seatControllers: SeatControlMode[];
  players: RuntimePlayerState[];
  pieces: RuntimePieceState[];
  globalVars: Record<string, number>;
  drawPiles: Record<string, string[]>;
  discardPiles: Record<string, string[]>;
  remainingAp: number;
  cardsPlayedInPhase: number;
  diceRolledInPhase: boolean;
  lastDiceRolls: number[];
  pendingMoveSteps: number;
  ruleTriggersThisTurn: Record<string, number>;
  totalRuleChainThisTurn: number;
  gameOver: boolean;
  winnerPlayerIndex: number | null;
  outcomeType:
    | 'in_progress'
    | 'win'
    | 'stalemate_timeout'
    | 'infinite_loop'
    | 'mutual_elimination';
  winConditionName: string;
  logs: LiveLogEntry[];
  stepCounter: number;
}

function cloneState(state: LiveMatchState): LiveMatchState {
  return {
    ...state,
    seatControllers: [...state.seatControllers],
    players: state.players.map((p) => ({
      ...p,
      stats: { ...p.stats },
      hand: [...p.hand],
    })),
    pieces: state.pieces.map((u) => ({ ...u })),
    globalVars: { ...state.globalVars },
    drawPiles: Object.fromEntries(
      Object.entries(state.drawPiles).map(([k, v]) => [k, [...v]])
    ),
    discardPiles: Object.fromEntries(
      Object.entries(state.discardPiles).map(([k, v]) => [k, [...v]])
    ),
    lastDiceRolls: [...state.lastDiceRolls],
    ruleTriggersThisTurn: { ...state.ruleTriggersThisTurn },
    logs: [...state.logs],
  };
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function compareValues(a: number, op: ComparisonOperator, b: number): boolean {
  switch (op) {
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '==':
      return Math.abs(a - b) < 1e-6;
    case '>':
      return a > b;
    case '<':
      return a < b;
    default:
      return false;
  }
}

export function getEnabledPhases(config: GameConfig) {
  const enabled = config.turnConfig.phases.filter((p) => p.enabled);
  return enabled.length > 0
    ? enabled
    : [
        {
          id: 'fallback_ap',
          name: 'Action Phase',
          type: 'action_points' as const,
          enabled: true,
          description: 'Default Action Phase',
        },
      ];
}

export function buildNeighborMap(board: BoardConfig): Map<string, string[]> {
  const tileMap = new Map(board.tiles.map((t) => [t.id, t]));
  const neighbors = new Map<string, string[]>();
  for (const t of board.tiles) {
    const valid: string[] = [];
    for (const cid of t.connections) {
      const target = tileMap.get(cid);
      if (target && target.type !== 'obstacle') {
        valid.push(cid);
      }
    }
    if (t.portalTargetId && tileMap.has(t.portalTargetId)) {
      const pt = tileMap.get(t.portalTargetId)!;
      if (pt.type !== 'obstacle' && !valid.includes(pt.id)) {
        valid.push(pt.id);
      }
    }
    neighbors.set(t.id, valid);
  }
  return neighbors;
}

function pushLog(
  state: LiveMatchState,
  config: GameConfig,
  category: LogCategory,
  headline: string,
  details?: string,
  severity: LiveLogEntry['severity'] = 'normal'
) {
  const enabledPhases = getEnabledPhases(config);
  const phase = enabledPhases[state.activePhaseIndex];
  state.stepCounter += 1;
  state.logs.push({
    id: `log_${state.stepCounter}_${Date.now()}`,
    stepNumber: state.stepCounter,
    round: state.round,
    playerIndex: state.activePlayerIndex,
    phaseName: phase?.name || 'Setup',
    category,
    headline,
    details,
    severity,
  });
}

function formatPlayerStatsSummary(player: RuntimePlayerState, config: GameConfig): string {
  return config.playerStats
    .map((s) => `${s.name}: ${player.stats[s.id] ?? 0}`)
    .join(' | ');
}

function clampPlayerStat(
  state: LiveMatchState,
  config: GameConfig,
  player: RuntimePlayerState,
  statId: string,
  newVal: number
): { before: number; after: number } {
  const before = player.stats[statId] ?? 0;
  const def = config.playerStats.find((s) => s.id === statId);
  const after = def
    ? Math.max(def.minValue, Math.min(def.maxValue, Math.round(newVal * 100) / 100))
    : Math.round(newVal * 100) / 100;
  player.stats[statId] = after;
  return { before, after };
}

function getSpawnTileForPlayer(config: GameConfig, playerIndex: number, unitIndex: number): string {
  const playerSpawns = config.board.tiles.filter(
    (t) => t.type === 'spawn' && t.spawnPlayerIndex === playerIndex
  );
  if (playerSpawns.length > 0) {
    return playerSpawns[unitIndex % playerSpawns.length].id;
  }
  const anySpawns = config.board.tiles.filter((t) => t.type === 'spawn');
  if (anySpawns.length > 0) {
    return anySpawns[(playerIndex + unitIndex) % anySpawns.length].id;
  }
  const passable = config.board.tiles.filter((t) => t.type !== 'obstacle');
  if (passable.length === 0) return config.board.tiles[0]?.id || 'tile_0_0';
  if (playerIndex === 0) return passable[0].id;
  if (playerIndex === 1) return passable[passable.length - 1].id;
  return passable[(playerIndex * 3) % passable.length].id;
}

function drawCardForPlayer(
  state: LiveMatchState,
  config: GameConfig,
  player: RuntimePlayerState,
  deckId?: string,
  logDraw = true
): CardDefinition | null {
  if (player.hand.length >= config.turnConfig.maxHandSize) {
    if (logDraw) {
      pushLog(
        state,
        config,
        'DRAW',
        `${player.name} hand is full (${player.hand.length}/${config.turnConfig.maxHandSize}) — skipped draw`,
        undefined,
        'normal'
      );
    }
    return null;
  }
  const targetDeckId = deckId || config.decks[0]?.id;
  if (!targetDeckId) return null;
  const pile = state.drawPiles[targetDeckId];
  const discard = state.discardPiles[targetDeckId];
  const deckDef = config.decks.find((d) => d.id === targetDeckId);
  if (!pile) return null;

  if (pile.length === 0 && discard && discard.length > 0 && deckDef?.reshuffleDiscard !== false) {
    while (discard.length > 0) {
      pile.push(discard.pop()!);
    }
    shuffleArray(pile);
    pushLog(
      state,
      config,
      'DRAW',
      `Reshuffled discard pile into "${deckDef?.name || targetDeckId}" (${pile.length} cards)`,
      undefined,
      'normal'
    );
  }

  if (pile.length === 0) return null;
  const cid = pile.pop()!;
  player.hand.push(cid);
  const cardDef = config.cards.find((c) => c.id === cid) || null;
  if (logDraw && cardDef) {
    pushLog(
      state,
      config,
      'DRAW',
      `${player.name} drew card "${cardDef.name}"`,
      `Cost: ${cardDef.costAmount} ${cardDef.costStatId.toUpperCase()} • Hand size: ${player.hand.length}/${config.turnConfig.maxHandSize}`,
      'normal'
    );
  }
  return cardDef;
}

export function createInitialLiveMatch(
  config: GameConfig,
  defaultControlModes?: SeatControlMode[]
): LiveMatchState {
  const playerCount = Math.max(1, Math.min(6, config.turnConfig.playerCount));
  const seatControllers: SeatControlMode[] = [];
  for (let i = 0; i < playerCount; i++) {
    seatControllers.push(defaultControlModes?.[i] ?? (i === 0 ? 'human' : 'ai'));
  }

  const players: RuntimePlayerState[] = [];
  for (let i = 0; i < playerCount; i++) {
    const initialStats: Record<string, number> = {};
    for (const s of config.playerStats) {
      initialStats[s.id] = s.initialValue;
    }
    if (config.turnConfig.firstPlayerAdvantageMitigation && i > 0) {
      const econStat =
        config.playerStats.find((s) => s.id === 'mana' || s.id === 'gold') ||
        config.playerStats[1];
      if (econStat) {
        initialStats[econStat.id] = Math.min(
          econStat.maxValue,
          (initialStats[econStat.id] ?? 0) + 1
        );
      }
    }
    const strat: AIArchetype = config.turnConfig.playerStrategies[i] || 'balanced';
    players.push({
      playerIndex: i,
      name: `Player ${i + 1}`,
      strategy: strat,
      stats: initialStats,
      hand: [],
      eliminated: false,
      turnsTaken: 0,
      cardsPlayedCount: 0,
      movesCount: 0,
      attacksCount: 0,
    });
  }

  const globalVars: Record<string, number> = {};
  for (const g of config.globalVars) {
    globalVars[g.id] = g.initialValue;
  }

  const drawPiles: Record<string, string[]> = {};
  const discardPiles: Record<string, string[]> = {};
  for (const d of config.decks) {
    const pile: string[] = [];
    for (const c of config.cards.filter((card) => card.deckId === d.id)) {
      const copies = Math.max(1, Math.min(50, c.copies));
      for (let k = 0; k < copies; k++) pile.push(c.id);
    }
    shuffleArray(pile);
    drawPiles[d.id] = pile;
    discardPiles[d.id] = [];
  }

  const pieces: RuntimePieceState[] = [];
  let unitCounter = 1;
  for (const arch of config.pieces) {
    for (let pIdx = 0; pIdx < playerCount; pIdx++) {
      if (
        arch.ownerType === 'specific_player' &&
        arch.specificPlayerIndex !== undefined &&
        arch.specificPlayerIndex !== pIdx
      ) {
        continue;
      }
      const count = Math.max(0, Math.min(10, arch.spawnCountPerPlayer));
      for (let u = 0; u < count; u++) {
        const spawnTileId = getSpawnTileForPlayer(config, pIdx, u);
        pieces.push({
          instanceId: `unit_${unitCounter++}`,
          archetypeId: arch.id,
          name: arch.name,
          symbol: arch.symbol,
          ownerPlayerIndex: pIdx,
          tileId: spawnTileId,
          hp: arch.maxHp,
          maxHp: arch.maxHp,
          attack: arch.attack,
          defense: arch.defense,
          alive: true,
          respawnTimer: 0,
        });
      }
    }
  }

  const state: LiveMatchState = {
    configId: config.id,
    round: 1,
    activePlayerIndex: 0,
    activePhaseIndex: 0,
    phaseReadyForInput: false,
    seatControllers,
    players,
    pieces,
    globalVars,
    drawPiles,
    discardPiles,
    remainingAp: config.turnConfig.actionPointsPerTurn,
    cardsPlayedInPhase: 0,
    diceRolledInPhase: false,
    lastDiceRolls: [],
    pendingMoveSteps: 0,
    ruleTriggersThisTurn: {},
    totalRuleChainThisTurn: 0,
    gameOver: false,
    winnerPlayerIndex: null,
    outcomeType: 'in_progress',
    winConditionName: '',
    logs: [],
    stepCounter: 0,
  };

  pushLog(
    state,
    config,
    'GAME',
    `Match initialized: "${config.name}" (${playerCount} Players, Max ${config.turnConfig.maxTurns} Rounds)`,
    players
      .map(
        (p, idx) =>
          `${p.name} [${seatControllers[idx] === 'human' ? 'HUMAN' : `AI:${p.strategy}`}]: ${formatPlayerStatsSummary(p, config)}`
      )
      .join('  •  '),
    'highlight'
  );

  // Deal starting hands
  for (const p of state.players) {
    const drawnNames: string[] = [];
    for (let h = 0; h < config.turnConfig.startingHandSize; h++) {
      const c = drawCardForPlayer(state, config, p, undefined, false);
      if (c) drawnNames.push(c.name);
    }
    if (drawnNames.length > 0) {
      pushLog(
        state,
        config,
        'DRAW',
        `Dealt starting hand (${drawnNames.length} cards) to ${p.name}`,
        drawnNames.join(', '),
        'normal'
      );
    }
  }

  // Fire ON_GAME_START rules
  for (const p of state.players) {
    fireLiveRules(state, config, 'ON_GAME_START', p);
  }

  // Start Turn 1 for Player 1
  beginPlayerTurn(state, config);

  return state;
}

function applyStatEffectWithLog(
  state: LiveMatchState,
  config: GameConfig,
  eff: StatEffect,
  player: RuntimePlayerState,
  piece: RuntimePieceState | undefined,
  sourceLabel: string
) {
  if (eff.target === 'player') {
    const cur = player.stats[eff.statId] ?? 0;
    const rawNext =
      eff.operation === 'add'
        ? cur + eff.value
        : eff.operation === 'subtract'
        ? cur - eff.value
        : eff.operation === 'multiply'
        ? cur * eff.value
        : eff.value;
    const { before, after } = clampPlayerStat(state, config, player, eff.statId, rawNext);
    pushLog(
      state,
      config,
      'TILE_EFFECT',
      `${sourceLabel}: ${player.name}'s ${eff.statId.toUpperCase()} ${before} → ${after}`,
      `Operation: ${eff.operation} ${eff.value}`,
      'normal'
    );
  } else if (eff.target === 'piece' && piece && piece.alive) {
    if (eff.statId === 'hp') {
      const before = piece.hp;
      const nextHp =
        eff.operation === 'add'
          ? piece.hp + eff.value
          : eff.operation === 'subtract'
          ? piece.hp - eff.value
          : eff.value;
      piece.hp = Math.min(piece.maxHp, nextHp);
      pushLog(
        state,
        config,
        'TILE_EFFECT',
        `${sourceLabel}: ${player.name}'s ${piece.name} HP ${before} → ${Math.max(0, piece.hp)}`,
        undefined,
        eff.operation === 'subtract' || eff.value < 0 ? 'warning' : 'normal'
      );
      if (piece.hp <= 0) {
        handlePieceDeath(state, config, piece, undefined);
      }
    } else if (eff.statId === 'attack') {
      const before = piece.attack;
      piece.attack = Math.max(
        0,
        piece.attack + (eff.operation === 'subtract' ? -eff.value : eff.value)
      );
      pushLog(
        state,
        config,
        'TILE_EFFECT',
        `${sourceLabel}: ${piece.name} Attack ${before} → ${piece.attack}`,
        undefined,
        'normal'
      );
    }
  } else if (eff.target === 'global') {
    const before = state.globalVars[eff.statId] ?? 0;
    const after =
      eff.operation === 'add'
        ? before + eff.value
        : eff.operation === 'subtract'
        ? before - eff.value
        : eff.value;
    state.globalVars[eff.statId] = after;
    pushLog(
      state,
      config,
      'TILE_EFFECT',
      `${sourceLabel}: Global ${eff.statId} ${before} → ${after}`,
      undefined,
      'normal'
    );
  }
}

function handlePieceDeath(
  state: LiveMatchState,
  config: GameConfig,
  victim: RuntimePieceState,
  killerPiece?: RuntimePieceState
) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.hp = 0;
  const victimOwner = state.players[victim.ownerPlayerIndex];
  const arch = config.pieces.find((a) => a.id === victim.archetypeId);
  if (arch?.respawnOnDeath) {
    victim.respawnTimer = Math.max(1, arch.respawnDelayTurns);
  }

  pushLog(
    state,
    config,
    'COMBAT',
    `💀 ${victimOwner?.name || 'Player'}'s ${victim.symbol} ${victim.name} was defeated at ${victim.tileId}!`,
    arch?.respawnOnDeath
      ? `Will respawn at spawn in ${victim.respawnTimer} turn(s)`
      : 'Permanently eliminated (Respawn disabled)',
    'warning'
  );

  if (killerPiece) {
    const killerArch = config.pieces.find((a) => a.id === killerPiece.archetypeId);
    const killerPlayer = state.players[killerPiece.ownerPlayerIndex];
    if (killerArch && killerPlayer && killerArch.onKillEffects.length > 0) {
      for (const eff of killerArch.onKillEffects) {
        applyStatEffectWithLog(
          state,
          config,
          eff,
          killerPlayer,
          killerPiece,
          `On-Kill Bounty (${killerPiece.name})`
        );
      }
    }
  }

  if (victimOwner) {
    const tile = config.board.tiles.find((t) => t.id === victim.tileId);
    fireLiveRules(state, config, 'ON_PIECE_DEATH', victimOwner, victim, tile);
  }
}

function fireLiveRules(
  state: LiveMatchState,
  config: GameConfig,
  event: RuleTriggerEvent,
  player: RuntimePlayerState,
  activePiece?: RuntimePieceState,
  tile?: BoardTile
) {
  if (state.gameOver) return;
  const MAX_SAFE_TRIGGER_CHAIN = 35;

  for (const rule of config.rules) {
    if (!rule.enabled || rule.trigger !== event) continue;

    const count = state.ruleTriggersThisTurn[rule.id] || 0;
    if (rule.maxTriggersPerTurn > 0 && count >= rule.maxTriggersPerTurn) {
      continue;
    }

    let condPassed = true;
    if (
      rule.conditionType === 'stat_compare' &&
      rule.conditionStatId &&
      rule.conditionOperator
    ) {
      const val = player.stats[rule.conditionStatId] ?? 0;
      condPassed = compareValues(val, rule.conditionOperator, rule.conditionValue ?? 0);
    } else if (rule.conditionType === 'tile_type' && rule.conditionTileType) {
      condPassed = tile?.type === rule.conditionTileType;
    } else if (rule.conditionType === 'turn_compare' && rule.conditionOperator) {
      condPassed = compareValues(
        state.round,
        rule.conditionOperator,
        rule.conditionValue ?? 1
      );
    } else if (rule.conditionType === 'custom_expr') {
      condPassed = evaluateCustomCondition(
        rule.customConditionExpr,
        player,
        state.round,
        state.globalVars,
        tile
      );
    }

    if (!condPassed) continue;

    state.ruleTriggersThisTurn[rule.id] = count + 1;
    state.totalRuleChainThisTurn += 1;

    if (state.totalRuleChainThisTurn > MAX_SAFE_TRIGGER_CHAIN) {
      state.gameOver = true;
      state.outcomeType = 'infinite_loop';
      state.winConditionName = `Infinite Loop Abort (${rule.name})`;
      pushLog(
        state,
        config,
        'RULE_TRIGGER',
        `🚨 CRITICAL INFINITE LOOP DETECTED: Rule "${rule.name}" triggered >${MAX_SAFE_TRIGGER_CHAIN} times in a single turn!`,
        `Event: ${event} • MaxTriggersPerTurn=${rule.maxTriggersPerTurn} (Uncapped). Match halted to prevent hang.`,
        'critical'
      );
      return;
    }

    pushLog(
      state,
      config,
      'RULE_TRIGGER',
      `⚡ Rule Triggered [${event}]: "${rule.name}" (${state.ruleTriggersThisTurn[rule.id]}/${
        rule.maxTriggersPerTurn === 0 ? '∞' : rule.maxTriggersPerTurn
      } this turn)`,
      rule.description,
      'highlight'
    );

    for (const act of rule.actions) {
      if (state.gameOver) return;
      switch (act.type) {
        case 'modify_stat':
          if (act.statId) {
            applyStatEffectWithLog(
              state,
              config,
              {
                id: act.id,
                target: 'player',
                statId: act.statId,
                operation: act.operation || 'add',
                value: act.value,
              },
              player,
              activePiece,
              `Rule "${rule.name}"`
            );
          }
          break;
        case 'damage_active_piece':
          if (activePiece && activePiece.alive) {
            const before = activePiece.hp;
            activePiece.hp -= act.value;
            pushLog(
              state,
              config,
              'RULE_TRIGGER',
              `Rule "${rule.name}" dealt ${act.value} damage to ${activePiece.name} (HP: ${before} → ${Math.max(0, activePiece.hp)})`,
              undefined,
              'warning'
            );
            if (activePiece.hp <= 0) {
              handlePieceDeath(state, config, activePiece, undefined);
            }
          }
          break;
        case 'heal_active_piece':
          if (activePiece && activePiece.alive) {
            const before = activePiece.hp;
            activePiece.hp = Math.min(activePiece.maxHp, activePiece.hp + act.value);
            pushLog(
              state,
              config,
              'RULE_TRIGGER',
              `Rule "${rule.name}" healed ${activePiece.name} (HP: ${before} → ${activePiece.hp})`,
              undefined,
              'normal'
            );
          }
          break;
        case 'move_forward': {
          const pieceToMove =
            activePiece ||
            state.pieces.find(
              (p) => p.ownerPlayerIndex === player.playerIndex && p.alive
            );
          if (pieceToMove) {
            advancePieceAutoSteps(
              state,
              config,
              pieceToMove,
              player,
              Math.max(1, act.value),
              `Rule "${rule.name}"`
            );
          }
          break;
        }
        case 'draw_card':
          for (let c = 0; c < Math.max(1, act.value); c++) {
            drawCardForPlayer(state, config, player, undefined, true);
          }
          break;
        case 'modify_global':
          if (act.statId) {
            const before = state.globalVars[act.statId] ?? 0;
            state.globalVars[act.statId] = before + act.value;
            pushLog(
              state,
              config,
              'RULE_TRIGGER',
              `Rule "${rule.name}" modified Global ${act.statId}: ${before} → ${state.globalVars[act.statId]}`,
              undefined,
              'normal'
            );
          }
          break;
        case 'custom_formula': {
          const enemy = state.players.find(
            (p) => p.playerIndex !== player.playerIndex && !p.eliminated
          );
          const beforeSnap = formatPlayerStatsSummary(player, config);
          executeCustomFormula(
            act.formula,
            player,
            enemy,
            state.globalVars,
            (p, sId, val) => {
              clampPlayerStat(state, config, p, sId, val);
            }
          );
          const afterSnap = formatPlayerStatsSummary(player, config);
          pushLog(
            state,
            config,
            'RULE_TRIGGER',
            `Rule "${rule.name}" executed formula: ${act.formula}`,
            `${player.name} stats: ${beforeSnap}  →  ${afterSnap}`,
            'normal'
          );
          break;
        }
        default:
          break;
      }
    }
  }
}

function checkLiveWinAndLossConditions(
  state: LiveMatchState,
  config: GameConfig,
  isMaxTurnEnd = false
): boolean {
  if (state.gameOver) return true;

  // 1. Check loss / elimination rules
  for (const wc of config.winConditions) {
    if (!wc.enabled || !wc.isLossCondition) continue;
    if (wc.type === 'stat_threshold' && wc.statId && wc.operator) {
      for (const p of state.players) {
        if (p.eliminated) continue;
        const val = p.stats[wc.statId] ?? 0;
        if (compareValues(val, wc.operator, wc.targetValue ?? 0)) {
          p.eliminated = true;
          for (const u of state.pieces) {
            if (u.ownerPlayerIndex === p.playerIndex) u.alive = false;
          }
          pushLog(
            state,
            config,
            'WIN_LOSS',
            `❌ ${p.name} was ELIMINATED by "${wc.name}" (${wc.statId.toUpperCase()} = ${val} ${wc.operator} ${wc.targetValue})!`,
            undefined,
            'warning'
          );
        }
      }
    }
  }

  const alivePlayers = state.players.filter((p) => !p.eliminated);
  if (alivePlayers.length === 0) {
    state.gameOver = true;
    state.outcomeType = 'mutual_elimination';
    state.winConditionName = 'Mutual Elimination';
    pushLog(
      state,
      config,
      'WIN_LOSS',
      `🏁 GAME OVER — Mutual Elimination (All players eliminated)!`,
      undefined,
      'critical'
    );
    return true;
  }

  // 2. Check victory conditions
  const playerCount = state.players.length;
  for (const wc of config.winConditions) {
    if (!wc.enabled || wc.isLossCondition) continue;

    if (
      wc.type === 'last_player_standing' &&
      playerCount > 1 &&
      alivePlayers.length === 1
    ) {
      state.gameOver = true;
      state.winnerPlayerIndex = alivePlayers[0].playerIndex;
      state.outcomeType = 'win';
      state.winConditionName = wc.name;
      pushLog(
        state,
        config,
        'WIN_LOSS',
        `🏆 VICTORY! ${alivePlayers[0].name} wins by "${wc.name}" (Last Player Standing) in Round ${state.round}!`,
        formatPlayerStatsSummary(alivePlayers[0], config),
        'highlight'
      );
      return true;
    }

    if (wc.type === 'stat_threshold' && wc.statId && wc.operator) {
      for (const p of alivePlayers) {
        const val = p.stats[wc.statId] ?? 0;
        if (compareValues(val, wc.operator, wc.targetValue ?? 10)) {
          state.gameOver = true;
          state.winnerPlayerIndex = p.playerIndex;
          state.outcomeType = 'win';
          state.winConditionName = wc.name;
          pushLog(
            state,
            config,
            'WIN_LOSS',
            `🏆 VICTORY! ${p.name} wins by "${wc.name}" (${wc.statId.toUpperCase()} = ${val} ${wc.operator} ${wc.targetValue}) in Round ${state.round}!`,
            formatPlayerStatsSummary(p, config),
            'highlight'
          );
          return true;
        }
      }
    }

    if (wc.type === 'reach_goal_tile') {
      for (const p of alivePlayers) {
        const goalUnit = state.pieces.find(
          (u) =>
            u.ownerPlayerIndex === p.playerIndex &&
            u.alive &&
            config.board.tiles.find((t) => t.id === u.tileId)?.type === 'goal'
        );
        if (goalUnit) {
          state.gameOver = true;
          state.winnerPlayerIndex = p.playerIndex;
          state.outcomeType = 'win';
          state.winConditionName = wc.name;
          pushLog(
            state,
            config,
            'WIN_LOSS',
            `🏆 VICTORY! ${p.name} wins by "${wc.name}" — ${goalUnit.name} reached the Goal space (${goalUnit.tileId}) in Round ${state.round}!`,
            formatPlayerStatsSummary(p, config),
            'highlight'
          );
          return true;
        }
      }
    }

    if (wc.type === 'control_goal_tiles') {
      const req = Math.max(1, wc.targetValue ?? 1);
      for (const p of alivePlayers) {
        const heldGoals = new Set(
          state.pieces
            .filter(
              (u) =>
                u.ownerPlayerIndex === p.playerIndex &&
                u.alive &&
                config.board.tiles.find((t) => t.id === u.tileId)?.type === 'goal'
            )
            .map((u) => u.tileId)
        );
        if (heldGoals.size >= req) {
          state.gameOver = true;
          state.winnerPlayerIndex = p.playerIndex;
          state.outcomeType = 'win';
          state.winConditionName = wc.name;
          pushLog(
            state,
            config,
            'WIN_LOSS',
            `🏆 VICTORY! ${p.name} wins by "${wc.name}" (Controls ${heldGoals.size}/${req} Goal spaces)!`,
            formatPlayerStatsSummary(p, config),
            'highlight'
          );
          return true;
        }
      }
    }

    if (wc.type === 'eliminate_all_enemies' && playerCount > 1) {
      for (const p of alivePlayers) {
        const enemyAlive = state.pieces.some(
          (u) => u.ownerPlayerIndex !== p.playerIndex && u.alive
        );
        if (!enemyAlive && state.pieces.length > 0) {
          state.gameOver = true;
          state.winnerPlayerIndex = p.playerIndex;
          state.outcomeType = 'win';
          state.winConditionName = wc.name;
          pushLog(
            state,
            config,
            'WIN_LOSS',
            `🏆 VICTORY! ${p.name} wins by "${wc.name}" (All enemy units defeated)!`,
            formatPlayerStatsSummary(p, config),
            'highlight'
          );
          return true;
        }
      }
    }

    if (isMaxTurnEnd && wc.type === 'highest_stat_at_max_turns' && wc.statId) {
      let bestVal = -Infinity;
      let bestPlayers: RuntimePlayerState[] = [];
      for (const p of alivePlayers) {
        const v = p.stats[wc.statId] ?? 0;
        if (v > bestVal) {
          bestVal = v;
          bestPlayers = [p];
        } else if (Math.abs(v - bestVal) < 1e-6) {
          bestPlayers.push(p);
        }
      }
      if (bestPlayers.length === 1) {
        state.gameOver = true;
        state.winnerPlayerIndex = bestPlayers[0].playerIndex;
        state.outcomeType = 'win';
        state.winConditionName = wc.name;
        pushLog(
          state,
          config,
          'WIN_LOSS',
          `🏆 VICTORY! ${bestPlayers[0].name} wins tiebreaker "${wc.name}" with ${wc.statId.toUpperCase()} = ${bestVal}!`,
          formatPlayerStatsSummary(bestPlayers[0], config),
          'highlight'
        );
        return true;
      }
    }
  }

  return false;
}

function advancePieceAutoSteps(
  state: LiveMatchState,
  config: GameConfig,
  piece: RuntimePieceState,
  player: RuntimePlayerState,
  steps: number,
  reasonLabel: string
) {
  if (!piece.alive || steps <= 0 || state.gameOver) return;
  const neighbors = buildNeighborMap(config.board);
  const goalTiles = config.board.tiles.filter((t) => t.type === 'goal');
  const startTile = config.board.tiles.find((t) => t.id === piece.tileId);
  const pathLabels: string[] = [startTile?.label || piece.tileId];

  for (let s = 0; s < steps; s++) {
    const nextIds = neighbors.get(piece.tileId) || [];
    if (nextIds.length === 0) break;

    let chosenId = nextIds[0];
    if (nextIds.length > 1 && goalTiles.length > 0) {
      // Pick neighbor closest to a goal tile
      let bestDist = Infinity;
      for (const cid of nextIds) {
        const candTile = config.board.tiles.find((t) => t.id === cid);
        if (!candTile) continue;
        for (const gt of goalTiles) {
          const d = Math.hypot(candTile.x - gt.x, candTile.y - gt.y);
          if (d < bestDist) {
            bestDist = d;
            chosenId = cid;
          }
        }
      }
    }
    piece.tileId = chosenId;
    player.movesCount += 1;
    const tObj = config.board.tiles.find((t) => t.id === chosenId);
    pathLabels.push(tObj?.label || chosenId);
  }

  const landedTile = config.board.tiles.find((t) => t.id === piece.tileId);
  pushLog(
    state,
    config,
    'MOVE',
    `${reasonLabel}: ${player.name}'s ${piece.symbol} ${piece.name} moved along [${pathLabels.join(' → ')}]`,
    landedTile ? `Landed on "${landedTile.label}" (Type: ${landedTile.type.toUpperCase()})` : undefined,
    'normal'
  );

  if (landedTile) {
    for (const eff of landedTile.onEnterEffects) {
      applyStatEffectWithLog(
        state,
        config,
        eff,
        player,
        piece,
        `Space "${landedTile.label}" On-Enter`
      );
    }
    fireLiveRules(state, config, 'ON_MOVE', player, piece, landedTile);
    fireLiveRules(state, config, 'ON_LAND_TILE', player, piece, landedTile);
  }
}

function beginPlayerTurn(state: LiveMatchState, config: GameConfig) {
  if (state.gameOver) return;
  const player = state.players[state.activePlayerIndex];
  if (!player || player.eliminated) return;

  state.activePhaseIndex = 0;
  state.ruleTriggersThisTurn = {};
  state.totalRuleChainThisTurn = 0;
  state.remainingAp = config.turnConfig.actionPointsPerTurn;
  state.cardsPlayedInPhase = 0;
  state.diceRolledInPhase = false;
  state.lastDiceRolls = [];
  state.pendingMoveSteps = 0;
  player.turnsTaken += 1;

  const seatMode = state.seatControllers[player.playerIndex];
  pushLog(
    state,
    config,
    'TURN',
    `═══ Round ${state.round} • ${player.name}'s Turn (${
      seatMode === 'human' ? '👤 HUMAN' : `🤖 AI: ${player.strategy.toUpperCase()}`
    }) ═══`,
    formatPlayerStatsSummary(player, config),
    'highlight'
  );

  fireLiveRules(state, config, 'ON_TURN_START', player);
  if (checkLiveWinAndLossConditions(state, config, false)) return;

  enterCurrentPhase(state, config);
}

function enterCurrentPhase(state: LiveMatchState, config: GameConfig) {
  if (state.gameOver) return;
  const enabledPhases = getEnabledPhases(config);
  const phase = enabledPhases[state.activePhaseIndex];
  const player = state.players[state.activePlayerIndex];
  if (!phase || !player) return;

  state.cardsPlayedInPhase = 0;
  state.diceRolledInPhase = false;
  state.lastDiceRolls = [];
  state.pendingMoveSteps = 0;

  if (phase.type === 'action_points') {
    state.remainingAp = Math.max(
      1,
      config.turnConfig.actionPointsPerTurn + (phase.bonusAp || 0)
    );
  } else if (phase.type === 'combat') {
    state.remainingAp = 1;
  }

  pushLog(
    state,
    config,
    'PHASE',
    `▶ Phase ${state.activePhaseIndex + 1}/${enabledPhases.length}: ${phase.name} (${phase.type})`,
    phase.description,
    'normal'
  );

  // Automatic phases execute immediately and log their effects
  if (phase.type === 'upkeep') {
    const statChanges: string[] = [];
    for (const s of config.playerStats) {
      if (s.regenPerTurn !== 0) {
        const { before, after } = clampPlayerStat(
          state,
          config,
          player,
          s.id,
          (player.stats[s.id] ?? 0) + s.regenPerTurn
        );
        if (before !== after) {
          statChanges.push(
            `${s.name}: ${before} → ${after} (${s.regenPerTurn >= 0 ? '+' : ''}${s.regenPerTurn})`
          );
        }
      }
    }
    if (statChanges.length > 0) {
      pushLog(
        state,
        config,
        'PHASE',
        `Upkeep Stat Regen applied for ${player.name}`,
        statChanges.join('  •  '),
        'normal'
      );
    }

    // Check unit respawns
    for (const u of state.pieces) {
      if (u.ownerPlayerIndex === player.playerIndex && !u.alive && u.respawnTimer > 0) {
        u.respawnTimer -= 1;
        if (u.respawnTimer <= 0) {
          u.alive = true;
          u.hp = u.maxHp;
          u.tileId = getSpawnTileForPlayer(config, player.playerIndex, 0);
          pushLog(
            state,
            config,
            'PHASE',
            `✨ ${player.name}'s ${u.symbol} ${u.name} respawned at ${u.tileId}!`,
            `HP restored to ${u.hp}/${u.maxHp}`,
            'highlight'
          );
        }
      }
    }
    state.phaseReadyForInput = true;
  } else if (phase.type === 'draw') {
    const deckId = phase.deckIdToDraw || config.decks[0]?.id;
    const deckDef = config.decks.find((d) => d.id === deckId);
    const drawCount = Math.max(1, deckDef?.drawPerTurn ?? 1);
    for (let d = 0; d < drawCount; d++) {
      drawCardForPlayer(state, config, player, deckId, true);
    }
    state.phaseReadyForInput = true;
  } else if (phase.type === 'end_turn') {
    const occupiedTiles = new Set<string>();
    for (const u of state.pieces) {
      if (u.ownerPlayerIndex === player.playerIndex && u.alive) {
        const tile = config.board.tiles.find((t) => t.id === u.tileId);
        if (tile && !occupiedTiles.has(tile.id)) {
          occupiedTiles.add(tile.id);
          for (const eff of tile.onTurnEndEffects) {
            applyStatEffectWithLog(
              state,
              config,
              eff,
              player,
              u,
              `Space "${tile.label}" End-of-Turn`
            );
          }
        }
      }
    }
    fireLiveRules(state, config, 'ON_TURN_END', player);
    checkLiveWinAndLossConditions(state, config, false);
    state.phaseReadyForInput = true;
  } else {
    state.phaseReadyForInput = true;
  }
}

export function getReachableMoveTiles(
  state: LiveMatchState,
  config: GameConfig,
  pieceId: string | null
): Map<string, { distance: number; path: string[] }> {
  const result = new Map<string, { distance: number; path: string[] }>();
  if (!pieceId || state.gameOver) return result;
  const piece = state.pieces.find((u) => u.instanceId === pieceId);
  if (!piece || !piece.alive || piece.ownerPlayerIndex !== state.activePlayerIndex) {
    return result;
  }

  const arch = config.pieces.find((a) => a.id === piece.archetypeId);
  const enabledPhases = getEnabledPhases(config);
  const currentPhase = enabledPhases[state.activePhaseIndex];

  let maxSteps = Math.max(1, arch?.moveRange ?? 1);
  if (currentPhase?.type === 'roll_and_move') {
    if (!state.diceRolledInPhase || state.pendingMoveSteps <= 0) return result;
    maxSteps = state.pendingMoveSteps;
  } else {
    const apCost = Math.max(1, arch?.apCost ?? 1);
    if (state.remainingAp < apCost) return result;
  }

  const neighbors = buildNeighborMap(config.board);
  const queue: { tileId: string; dist: number; path: string[] }[] = [
    { tileId: piece.tileId, dist: 0, path: [piece.tileId] },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.dist > 0) {
      if (currentPhase?.type === 'roll_and_move') {
        if (curr.dist === maxSteps && !result.has(curr.tileId)) {
          result.set(curr.tileId, { distance: curr.dist, path: curr.path });
        }
      } else if (!result.has(curr.tileId)) {
        result.set(curr.tileId, { distance: curr.dist, path: curr.path });
      }
    }
    if (curr.dist < maxSteps) {
      for (const nextId of neighbors.get(curr.tileId) || []) {
        if (!curr.path.includes(nextId)) {
          queue.push({
            tileId: nextId,
            dist: curr.dist + 1,
            path: [...curr.path, nextId],
          });
        }
      }
    }
  }

  return result;
}

export function getAttackableEnemiesForPiece(
  state: LiveMatchState,
  config: GameConfig,
  pieceId: string | null
): RuntimePieceState[] {
  if (!pieceId || state.gameOver) return [];
  const unit = state.pieces.find((u) => u.instanceId === pieceId);
  if (!unit || !unit.alive || unit.ownerPlayerIndex !== state.activePlayerIndex) {
    return [];
  }
  const arch: PieceArchetype | undefined = config.pieces.find(
    (a) => a.id === unit.archetypeId
  );
  const apCost = Math.max(1, arch?.apCost ?? 1);
  if (state.remainingAp < apCost) return [];

  const range = Math.max(1, arch?.attackRange ?? 1);
  const neighbors = buildNeighborMap(config.board);
  const directNeighbors = neighbors.get(unit.tileId) || [];
  const uTile = config.board.tiles.find((t) => t.id === unit.tileId);

  return state.pieces.filter((other) => {
    if (!other.alive || other.ownerPlayerIndex === unit.ownerPlayerIndex) {
      return false;
    }
    if (other.tileId === unit.tileId) return true;
    if (directNeighbors.includes(other.tileId)) return true;
    if (range >= 2 && uTile) {
      const oTile = config.board.tiles.find((t) => t.id === other.tileId);
      if (
        uTile.row !== undefined &&
        oTile?.row !== undefined &&
        uTile.col !== undefined &&
        oTile.col !== undefined
      ) {
        const manhattan =
          Math.abs(uTile.row - oTile.row) + Math.abs(uTile.col - oTile.col);
        return manhattan <= range;
      }
    }
    return false;
  });
}

export function canPlayCardNow(
  state: LiveMatchState,
  config: GameConfig,
  card: CardDefinition
): { allowed: boolean; reason?: string } {
  if (state.gameOver) return { allowed: false, reason: 'Match is over' };
  const player = state.players[state.activePlayerIndex];
  if (!player) return { allowed: false, reason: 'No active player' };

  const enabledPhases = getEnabledPhases(config);
  const phase = enabledPhases[state.activePhaseIndex];
  const maxToPlay = phase?.maxCardsToPlay ?? 2;
  if (phase?.type === 'play_cards' && state.cardsPlayedInPhase >= maxToPlay) {
    return {
      allowed: false,
      reason: `Max ${maxToPlay} card(s) per phase reached`,
    };
  }

  const haveStat = player.stats[card.costStatId] ?? 0;
  if (card.costAmount > haveStat) {
    return {
      allowed: false,
      reason: `Needs ${card.costAmount} ${card.costStatId.toUpperCase()} (Have ${haveStat})`,
    };
  }

  if (
    card.conditionExpr &&
    !evaluateCustomCondition(
      card.conditionExpr,
      player,
      state.round,
      state.globalVars
    )
  ) {
    return {
      allowed: false,
      reason: `Condition not met: ${card.conditionExpr}`,
    };
  }

  return { allowed: true };
}

export function rollDiceForTurn(
  prevState: LiveMatchState,
  config: GameConfig
): LiveMatchState {
  const state = cloneState(prevState);
  if (state.gameOver || state.diceRolledInPhase) return state;

  const player = state.players[state.activePlayerIndex];
  const dCount = Math.max(1, config.turnConfig.diceCount);
  const dSides = Math.max(1, config.turnConfig.diceSides);
  const rolls: number[] = [];
  let sum = 0;
  for (let i = 0; i < dCount; i++) {
    const r = Math.floor(Math.random() * dSides) + 1;
    rolls.push(r);
    sum += r;
  }

  state.diceRolledInPhase = true;
  state.lastDiceRolls = rolls;
  state.pendingMoveSteps = sum;

  pushLog(
    state,
    config,
    'DICE',
    `🎲 ${player.name} rolled ${dCount}d${dSides}: [${rolls.join(', ')}] = ${sum} steps!`,
    `Select a friendly unit and click a highlighted destination space (or click Auto-Move).`,
    'highlight'
  );

  return state;
}

export function movePieceInLiveMatch(
  prevState: LiveMatchState,
  config: GameConfig,
  pieceId: string,
  targetTileId: string
): LiveMatchState {
  const state = cloneState(prevState);
  if (state.gameOver) return state;

  const player = state.players[state.activePlayerIndex];
  const piece = state.pieces.find((u) => u.instanceId === pieceId);
  if (!player || !piece || !piece.alive || piece.ownerPlayerIndex !== player.playerIndex) {
    return state;
  }

  const reachable = getReachableMoveTiles(state, config, pieceId);
  const moveInfo = reachable.get(targetTileId);
  if (!moveInfo) return state;

  const enabledPhases = getEnabledPhases(config);
  const currentPhase = enabledPhases[state.activePhaseIndex];
  const arch = config.pieces.find((a) => a.id === piece.archetypeId);
  const apCost = Math.max(1, arch?.apCost ?? 1);

  if (currentPhase?.type === 'roll_and_move') {
    state.pendingMoveSteps = 0;
  } else {
    state.remainingAp = Math.max(0, state.remainingAp - apCost);
  }

  const pathLabels = moveInfo.path.map(
    (tid) => config.board.tiles.find((t) => t.id === tid)?.label || tid
  );

  piece.tileId = targetTileId;
  player.movesCount += 1;
  const landedTile = config.board.tiles.find((t) => t.id === targetTileId);

  pushLog(
    state,
    config,
    'MOVE',
    `🏃 ${player.name} moved ${piece.symbol} ${piece.name} to "${
      landedTile?.label || targetTileId
    }" (${moveInfo.distance} step${moveInfo.distance === 1 ? '' : 's'})`,
    `Path: ${pathLabels.join(' → ')} • Remaining AP: ${state.remainingAp}`,
    'normal'
  );

  if (landedTile) {
    for (const eff of landedTile.onEnterEffects) {
      applyStatEffectWithLog(
        state,
        config,
        eff,
        player,
        piece,
        `Space "${landedTile.label}" On-Enter`
      );
    }
    fireLiveRules(state, config, 'ON_MOVE', player, piece, landedTile);
    fireLiveRules(state, config, 'ON_LAND_TILE', player, piece, landedTile);
  }

  checkLiveWinAndLossConditions(state, config, false);
  return state;
}

export function attackEnemyPieceInLiveMatch(
  prevState: LiveMatchState,
  config: GameConfig,
  attackerPieceId: string,
  targetEnemyPieceId: string
): LiveMatchState {
  const state = cloneState(prevState);
  if (state.gameOver) return state;

  const player = state.players[state.activePlayerIndex];
  const attacker = state.pieces.find((u) => u.instanceId === attackerPieceId);
  const defender = state.pieces.find((u) => u.instanceId === targetEnemyPieceId);
  if (!player || !attacker || !defender || !attacker.alive || !defender.alive) {
    return state;
  }

  const arch = config.pieces.find((a) => a.id === attacker.archetypeId);
  const apCost = Math.max(1, arch?.apCost ?? 1);
  if (state.remainingAp < apCost) return state;

  state.remainingAp = Math.max(0, state.remainingAp - apCost);
  player.attacksCount += 1;

  const rawDmg = Math.max(1, attacker.attack - Math.floor(defender.defense * 0.5));
  const hpBefore = defender.hp;
  defender.hp = Math.max(0, defender.hp - rawDmg);
  const defOwner = state.players[defender.ownerPlayerIndex];

  pushLog(
    state,
    config,
    'COMBAT',
    `⚔️ ${player.name}'s ${attacker.symbol} ${attacker.name} attacked ${
      defOwner?.name || 'Enemy'
    }'s ${defender.symbol} ${defender.name} for ${rawDmg} dmg!`,
    `Combat math: ATK ${attacker.attack} - ⌊DEF ${defender.defense} × 0.5⌋ = ${rawDmg} dmg • Target HP: ${hpBefore} → ${defender.hp} • Remaining AP: ${state.remainingAp}`,
    'highlight'
  );

  if (arch) {
    for (const eff of arch.onAttackEffects) {
      applyStatEffectWithLog(
        state,
        config,
        eff,
        player,
        attacker,
        `On-Attack (${attacker.name})`
      );
    }
  }

  const tile = config.board.tiles.find((t) => t.id === attacker.tileId);
  fireLiveRules(state, config, 'ON_COMBAT', player, attacker, tile);

  if (defender.hp <= 0) {
    handlePieceDeath(state, config, defender, attacker);
  }

  checkLiveWinAndLossConditions(state, config, false);
  return state;
}

export function playCardInLiveMatch(
  prevState: LiveMatchState,
  config: GameConfig,
  handIndex: number,
  targetEnemyPlayerIndex?: number,
  targetPieceId?: string
): LiveMatchState {
  const state = cloneState(prevState);
  if (state.gameOver) return state;

  const player = state.players[state.activePlayerIndex];
  if (!player || handIndex < 0 || handIndex >= player.hand.length) return state;

  const cardId = player.hand[handIndex];
  const card = config.cards.find((c) => c.id === cardId);
  if (!card) return state;

  const check = canPlayCardNow(state, config, card);
  if (!check.allowed) return state;

  // Deduct cost
  let costDetail = 'Free (0 Cost)';
  if (card.costStatId && card.costAmount > 0) {
    const { before, after } = clampPlayerStat(
      state,
      config,
      player,
      card.costStatId,
      (player.stats[card.costStatId] ?? 0) - card.costAmount
    );
    costDetail = `Paid ${card.costAmount} ${card.costStatId.toUpperCase()} (${before} → ${after})`;
  }

  // Remove from hand & add to discard
  player.hand.splice(handIndex, 1);
  if (!state.discardPiles[card.deckId]) state.discardPiles[card.deckId] = [];
  state.discardPiles[card.deckId].push(card.id);
  player.cardsPlayedCount += 1;
  state.cardsPlayedInPhase += 1;

  const enemyPlayers = state.players.filter(
    (ep) => ep.playerIndex !== player.playerIndex && !ep.eliminated
  );
  const targetEnemy =
    (targetEnemyPlayerIndex !== undefined
      ? state.players.find((p) => p.playerIndex === targetEnemyPlayerIndex && !p.eliminated)
      : undefined) || enemyPlayers[0];

  const effectLogs: string[] = [costDetail];

  for (const ce of card.effects) {
    switch (ce.type) {
      case 'modify_player_stat':
        if (ce.statId) {
          const { before, after } = clampPlayerStat(
            state,
            config,
            player,
            ce.statId,
            (player.stats[ce.statId] ?? 0) + ce.value
          );
          effectLogs.push(`${player.name} ${ce.statId.toUpperCase()}: ${before} → ${after}`);
        }
        break;
      case 'modify_enemy_stat':
        if (ce.statId && targetEnemy) {
          const { before, after } = clampPlayerStat(
            state,
            config,
            targetEnemy,
            ce.statId,
            (targetEnemy.stats[ce.statId] ?? 0) + ce.value
          );
          effectLogs.push(
            `${targetEnemy.name} ${ce.statId.toUpperCase()}: ${before} → ${after}`
          );
        }
        break;
      case 'steal_stat':
        if (ce.statId && targetEnemy) {
          const avail = Math.max(
            0,
            Math.min(ce.value, targetEnemy.stats[ce.statId] ?? 0)
          );
          const eRes = clampPlayerStat(
            state,
            config,
            targetEnemy,
            ce.statId,
            (targetEnemy.stats[ce.statId] ?? 0) - avail
          );
          const pRes = clampPlayerStat(
            state,
            config,
            player,
            ce.statId,
            (player.stats[ce.statId] ?? 0) + avail
          );
          effectLogs.push(
            `Stole ${avail} ${ce.statId.toUpperCase()} from ${targetEnemy.name} (${eRes.before}→${eRes.after}, ${player.name} ${pRes.before}→${pRes.after})`
          );
        }
        break;
      case 'damage_piece': {
        const enemyUnit =
          (targetPieceId
            ? state.pieces.find(
                (u) =>
                  u.instanceId === targetPieceId &&
                  u.ownerPlayerIndex !== player.playerIndex &&
                  u.alive
              )
            : undefined) ||
          state.pieces.find(
            (u) => u.ownerPlayerIndex !== player.playerIndex && u.alive
          );
        if (enemyUnit) {
          const before = enemyUnit.hp;
          enemyUnit.hp = Math.max(0, enemyUnit.hp - Math.abs(ce.value));
          effectLogs.push(
            `Dealt ${Math.abs(ce.value)} dmg to ${enemyUnit.name} (HP: ${before} → ${enemyUnit.hp})`
          );
          if (enemyUnit.hp <= 0) {
            handlePieceDeath(state, config, enemyUnit, undefined);
          }
        }
        break;
      }
      case 'heal_piece': {
        const friendlyUnit =
          (targetPieceId
            ? state.pieces.find(
                (u) =>
                  u.instanceId === targetPieceId &&
                  u.ownerPlayerIndex === player.playerIndex &&
                  u.alive
              )
            : undefined) ||
          state.pieces.find(
            (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
          );
        if (friendlyUnit) {
          const before = friendlyUnit.hp;
          friendlyUnit.hp = Math.min(
            friendlyUnit.maxHp,
            friendlyUnit.hp + Math.abs(ce.value)
          );
          effectLogs.push(
            `Healed ${friendlyUnit.name} (HP: ${before} → ${friendlyUnit.hp})`
          );
        }
        break;
      }
      case 'boost_piece_attack': {
        const friendlyUnit =
          (targetPieceId
            ? state.pieces.find(
                (u) =>
                  u.instanceId === targetPieceId &&
                  u.ownerPlayerIndex === player.playerIndex &&
                  u.alive
              )
            : undefined) ||
          state.pieces.find(
            (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
          );
        if (friendlyUnit) {
          const before = friendlyUnit.attack;
          friendlyUnit.attack += ce.value;
          effectLogs.push(
            `Boosted ${friendlyUnit.name} ATK: ${before} → ${friendlyUnit.attack}`
          );
        }
        break;
      }
      case 'push_move_piece':
      case 'teleport_to_goal_step': {
        const friendlyUnit =
          (targetPieceId
            ? state.pieces.find(
                (u) =>
                  u.instanceId === targetPieceId &&
                  u.ownerPlayerIndex === player.playerIndex &&
                  u.alive
              )
            : undefined) ||
          state.pieces.find(
            (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
          );
        if (friendlyUnit) {
          advancePieceAutoSteps(
            state,
            config,
            friendlyUnit,
            player,
            Math.max(1, ce.value),
            `Card "${card.name}"`
          );
          effectLogs.push(`Advanced ${friendlyUnit.name} +${Math.max(1, ce.value)} space(s)`);
        }
        break;
      }
      case 'draw_cards':
        for (let k = 0; k < Math.max(1, ce.value); k++) {
          drawCardForPlayer(state, config, player, card.deckId, true);
        }
        effectLogs.push(`Drew ${Math.max(1, ce.value)} extra card(s)`);
        break;
    }
  }

  if (card.formulaExpr) {
    executeCustomFormula(
      card.formulaExpr,
      player,
      targetEnemy,
      state.globalVars,
      (p, sId, val) => {
        clampPlayerStat(state, config, p, sId, val);
      }
    );
    effectLogs.push(`Formula: ${card.formulaExpr}`);
  }

  pushLog(
    state,
    config,
    'CARD',
    `🃏 ${player.name} played card "${card.name}"`,
    effectLogs.join('  •  '),
    'highlight'
  );

  fireLiveRules(state, config, 'ON_CARD_PLAY', player);
  checkLiveWinAndLossConditions(state, config, false);
  return state;
}

export function advancePhaseOrTurnInLiveMatch(
  prevState: LiveMatchState,
  config: GameConfig
): LiveMatchState {
  const state = cloneState(prevState);
  if (state.gameOver) return state;

  const enabledPhases = getEnabledPhases(config);
  if (state.activePhaseIndex + 1 < enabledPhases.length) {
    state.activePhaseIndex += 1;
    enterCurrentPhase(state, config);
    return state;
  }

  // Otherwise end current player's turn and move to next alive player
  const playerCount = state.players.length;
  let nextPlayerIdx = -1;
  let wrappedRound = false;

  for (let offset = 1; offset <= playerCount; offset++) {
    const cand = (state.activePlayerIndex + offset) % playerCount;
    if (state.activePlayerIndex + offset >= playerCount) {
      wrappedRound = true;
    }
    if (!state.players[cand].eliminated) {
      nextPlayerIdx = cand;
      break;
    }
  }

  if (nextPlayerIdx === -1) {
    checkLiveWinAndLossConditions(state, config, true);
    return state;
  }

  if (wrappedRound) {
    // End of full round
    for (const g of config.globalVars) {
      if (g.changePerRound !== 0) {
        const before = state.globalVars[g.id] ?? g.initialValue;
        const after = Math.max(
          g.minValue,
          Math.min(g.maxValue, before + g.changePerRound)
        );
        state.globalVars[g.id] = after;
        pushLog(
          state,
          config,
          'TURN',
          `End of Round ${state.round}: Global "${g.name}" ${before} → ${after}`,
          undefined,
          'normal'
        );
      }
    }
    const firstAlive = state.players.find((p) => !p.eliminated);
    if (firstAlive) {
      fireLiveRules(state, config, 'ON_ROUND_END', firstAlive);
    }

    if (state.round >= config.turnConfig.maxTurns) {
      if (!checkLiveWinAndLossConditions(state, config, true)) {
        state.gameOver = true;
        state.outcomeType = 'stalemate_timeout';
        state.winConditionName = `Stalemate / Timeout (${config.turnConfig.maxTurns} Rounds)`;
        pushLog(
          state,
          config,
          'WIN_LOSS',
          `⏱️ STALEMATE / TIMEOUT: Reached Max Rounds Cap (${config.turnConfig.maxTurns}) with no decisive winner!`,
          state.players.map((p) => `${p.name}: ${formatPlayerStatsSummary(p, config)}`).join('  •  '),
          'warning'
        );
      }
      return state;
    }

    state.round += 1;
  }

  state.activePlayerIndex = nextPlayerIdx;
  beginPlayerTurn(state, config);
  return state;
}

/**
 * Executes a single atomic step for the active player (used by AI turns, "AI Assist Step", and "Slow Logs" streaming mode).
 * Each call performs ONE visible action (e.g. rolling dice, moving 1 piece, playing 1 card, attacking 1 enemy, or advancing 1 phase)
 * so the user can watch the logs and board update step-by-step at their chosen speed!
 */
export function stepSingleAtomicAction(
  prevState: LiveMatchState,
  config: GameConfig
): LiveMatchState {
  if (prevState.gameOver) return prevState;

  const enabledPhases = getEnabledPhases(config);
  const phase = enabledPhases[prevState.activePhaseIndex];
  const player = prevState.players[prevState.activePlayerIndex];
  if (!phase || !player) return prevState;

  // 1. If in roll_and_move phase: first roll dice, then move a piece
  if (phase.type === 'roll_and_move') {
    if (!prevState.diceRolledInPhase) {
      return rollDiceForTurn(prevState, config);
    }
    if (prevState.pendingMoveSteps > 0) {
      const myUnits = prevState.pieces.filter(
        (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
      );
      for (const unit of myUnits) {
        const reachable = getReachableMoveTiles(prevState, config, unit.instanceId);
        const candidates = Array.from(reachable.keys());
        if (candidates.length > 0) {
          const chosenTileId = pickBestTileForAIStrategy(
            candidates,
            player.strategy,
            unit,
            prevState.pieces,
            config
          );
          return movePieceInLiveMatch(prevState, config, unit.instanceId, chosenTileId);
        }
      }
      // If no exact-step tile available, clear pendingMoveSteps and advance
    }
    return advancePhaseOrTurnInLiveMatch(prevState, config);
  }

  // 2. If in play_cards phase: play 1 playable card per step until maxCardsToPlay or no playable cards
  if (phase.type === 'play_cards') {
    const maxCards = phase.maxCardsToPlay ?? 2;
    if (prevState.cardsPlayedInPhase < maxCards) {
      for (let i = 0; i < player.hand.length; i++) {
        const card = config.cards.find((c) => c.id === player.hand[i]);
        if (card && canPlayCardNow(prevState, config, card).allowed) {
          return playCardInLiveMatch(prevState, config, i);
        }
      }
    }
    return advancePhaseOrTurnInLiveMatch(prevState, config);
  }

  // 3. If in action_points or combat phase: perform 1 unit attack or 1 unit move per step while AP > 0
  if (phase.type === 'action_points' || phase.type === 'combat') {
    const myUnits = prevState.pieces.filter(
      (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
    );
    for (const unit of myUnits) {
      const arch = config.pieces.find((a) => a.id === unit.archetypeId);
      const apCost = Math.max(1, arch?.apCost ?? 1);
      if (prevState.remainingAp < apCost) continue;

      const enemies = getAttackableEnemiesForPiece(prevState, config, unit.instanceId);
      if (
        enemies.length > 0 &&
        (phase.type === 'combat' ||
          player.strategy === 'aggressive' ||
          Math.random() < 0.7)
      ) {
        return attackEnemyPieceInLiveMatch(
          prevState,
          config,
          unit.instanceId,
          enemies[0].instanceId
        );
      }

      if (phase.type !== 'combat') {
        const reachable = getReachableMoveTiles(prevState, config, unit.instanceId);
        const candidates = Array.from(reachable.keys());
        if (candidates.length > 0) {
          const chosenTileId = pickBestTileForAIStrategy(
            candidates,
            player.strategy,
            unit,
            prevState.pieces,
            config
          );
          return movePieceInLiveMatch(prevState, config, unit.instanceId, chosenTileId);
        }
      }
    }
    return advancePhaseOrTurnInLiveMatch(prevState, config);
  }

  // 4. For automatic phases (upkeep, draw, end_turn), advance to the next phase/turn
  return advancePhaseOrTurnInLiveMatch(prevState, config);
}

function pickBestTileForAIStrategy(
  candidateTileIds: string[],
  strategy: AIArchetype,
  unit: RuntimePieceState,
  allPieces: RuntimePieceState[],
  config: GameConfig
): string {
  if (strategy === 'random' || candidateTileIds.length === 1) {
    return candidateTileIds[Math.floor(Math.random() * candidateTileIds.length)];
  }
  const goalTiles = config.board.tiles.filter((t) => t.type === 'goal');
  const boostShopTiles = config.board.tiles.filter(
    (t) => t.type === 'boost' || t.type === 'shop' || t.type === 'checkpoint'
  );

  let bestId = candidateTileIds[0];
  let bestScore = -Infinity;

  for (const cid of candidateTileIds) {
    const tile = config.board.tiles.find((t) => t.id === cid);
    if (!tile) continue;

    let score = (Math.random() - 0.5) * 0.5;
    let minGoalDist = 500;
    for (const gt of goalTiles) {
      const d = Math.hypot(tile.x - gt.x, tile.y - gt.y);
      if (d < minGoalDist) minGoalDist = d;
    }

    let minBoostDist = 500;
    for (const bt of boostShopTiles) {
      const d = Math.hypot(tile.x - bt.x, tile.y - bt.y);
      if (d < minBoostDist) minBoostDist = d;
    }

    if (strategy === 'rusher') {
      score -= minGoalDist * 0.08;
      if (tile.type === 'goal') score += 50;
    } else if (strategy === 'economic') {
      score -= minBoostDist * 0.08;
      if (tile.type === 'boost' || tile.type === 'shop') score += 35;
    } else if (strategy === 'aggressive') {
      const hasEnemy = allPieces.some(
        (p) =>
          p.ownerPlayerIndex !== unit.ownerPlayerIndex &&
          p.alive &&
          p.tileId === cid
      );
      if (hasEnemy) score += 45;
      score -= minGoalDist * 0.04;
    } else {
      score -= minGoalDist * 0.06;
      if (tile.type === 'goal') score += 40;
      if (tile.type === 'boost' || tile.type === 'shop') score += 18;
      if (tile.type === 'hazard') score -= 25;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = cid;
    }
  }

  return bestId;
}
