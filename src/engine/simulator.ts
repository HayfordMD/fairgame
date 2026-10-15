import {
  AIArchetype,
  BoardConfig,
  BoardTile,
  CardDefinition,
  CardTelemetry,
  ComparisonOperator,
  DiagnosticIssue,
  GameConfig,
  PieceArchetype,
  PieceTelemetry,
  ReplayTurnSnapshot,
  RuleTrigger,
  RuleTriggerEvent,
  RuntimePieceState,
  RuntimePlayerState,
  SimulatedGameLog,
  SimulationBatchSummary,
  StatEffect,
  WinCondition,
} from '../types/game';

const ALL_STRATEGIES: AIArchetype[] = [
  'balanced',
  'aggressive',
  'rusher',
  'economic',
  'defensive',
  'random',
];

interface BoardGraphCache {
  tileMap: Map<string, BoardTile>;
  neighbors: Map<string, string[]>;
  distToGoal: Map<string, number>;
  distToBoostOrShop: Map<string, number>;
  goalTileIds: string[];
  spawnTilesByPlayer: Map<number, string[]>;
  anySpawnTiles: string[];
}

function buildBoardGraphCache(board: BoardConfig): BoardGraphCache {
  const tileMap = new Map<string, BoardTile>();
  const neighbors = new Map<string, string[]>();
  const goalTileIds: string[] = [];
  const boostShopIds: string[] = [];
  const spawnTilesByPlayer = new Map<number, string[]>();
  const anySpawnTiles: string[] = [];

  for (const t of board.tiles) {
    tileMap.set(t.id, t);
    if (t.type === 'goal') goalTileIds.push(t.id);
    if (t.type === 'boost' || t.type === 'shop' || t.type === 'checkpoint') {
      boostShopIds.push(t.id);
    }
    if (t.type === 'spawn') {
      anySpawnTiles.push(t.id);
      if (t.spawnPlayerIndex !== undefined) {
        const list = spawnTilesByPlayer.get(t.spawnPlayerIndex) || [];
        list.push(t.id);
        spawnTilesByPlayer.set(t.spawnPlayerIndex, list);
      }
    }
  }

  for (const t of board.tiles) {
    const validConns: string[] = [];
    for (const cid of t.connections) {
      const target = tileMap.get(cid);
      if (target && target.type !== 'obstacle') {
        validConns.push(cid);
      }
    }
    if (t.portalTargetId && tileMap.has(t.portalTargetId)) {
      const pt = tileMap.get(t.portalTargetId)!;
      if (pt.type !== 'obstacle' && !validConns.includes(pt.id)) {
        validConns.push(pt.id);
      }
    }
    neighbors.set(t.id, validConns);
  }

  const distToGoal = computeMultiSourceBFS(board.tiles, neighbors, goalTileIds);
  const distToBoostOrShop = computeMultiSourceBFS(board.tiles, neighbors, boostShopIds);

  return {
    tileMap,
    neighbors,
    distToGoal,
    distToBoostOrShop,
    goalTileIds,
    spawnTilesByPlayer,
    anySpawnTiles,
  };
}

function computeMultiSourceBFS(
  tiles: BoardTile[],
  neighbors: Map<string, string[]>,
  sources: string[]
): Map<string, number> {
  const reverseNeighbors = new Map<string, string[]>();
  for (const t of tiles) reverseNeighbors.set(t.id, []);
  for (const [u, vs] of neighbors.entries()) {
    for (const v of vs) {
      reverseNeighbors.get(v)?.push(u);
    }
  }

  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const s of sources) {
    dist.set(s, 0);
    queue.push(s);
  }
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const d = dist.get(curr)!;
    const prevs = reverseNeighbors.get(curr) || [];
    for (const p of prevs) {
      if (!dist.has(p)) {
        dist.set(p, d + 1);
        queue.push(p);
      }
    }
  }
  return dist;
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

export function evaluateCustomCondition(
  expr: string | undefined,
  player: RuntimePlayerState,
  round: number,
  globalVars: Record<string, number>,
  tile?: BoardTile
): boolean {
  if (!expr || !expr.trim()) return true;
  const trimmed = expr.trim();

  if (trimmed.includes('&&')) {
    return trimmed
      .split('&&')
      .every((part) => evaluateCustomCondition(part, player, round, globalVars, tile));
  }
  if (trimmed.includes('||')) {
    return trimmed
      .split('||')
      .some((part) => evaluateCustomCondition(part, player, round, globalVars, tile));
  }

  const tileMatch = trimmed.match(/tile\.type\s*(==|!=)\s*['"]?([a-zA-Z_]+)['"]?/);
  if (tileMatch) {
    const op = tileMatch[1];
    const val = tileMatch[2];
    const actual = tile?.type || '';
    return op === '==' ? actual === val : actual !== val;
  }

  const match = trimmed.match(/^([a-zA-Z0-9_.]+)\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return true;
  const [, lhsKey, op, rhsStr] = match;
  const rhs = parseFloat(rhsStr);

  let lhs = 0;
  if (lhsKey === 'turn' || lhsKey === 'round') {
    lhs = round;
  } else if (lhsKey.startsWith('player.')) {
    const statId = lhsKey.slice('player.'.length);
    lhs = player.stats[statId] ?? 0;
  } else if (lhsKey.startsWith('global.')) {
    const varId = lhsKey.slice('global.'.length);
    lhs = globalVars[varId] ?? 0;
  } else {
    lhs = player.stats[lhsKey] ?? 0;
  }

  if (op === '!=') return Math.abs(lhs - rhs) > 1e-6;
  return compareValues(lhs, op as ComparisonOperator, rhs);
}

export function executeCustomFormula(
  formula: string | undefined,
  player: RuntimePlayerState,
  enemy: RuntimePlayerState | undefined,
  globalVars: Record<string, number>,
  clampStat: (p: RuntimePlayerState, statId: string, val: number) => void
): void {
  if (!formula || !formula.trim()) return;
  const statements = formula
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    const m = stmt.match(
      /^(player|enemy|global)\.([a-zA-Z0-9_]+)\s*(\+=|-=|\*=|=)\s*(-?\d+(?:\.\d+)?)$/
    );
    if (!m) continue;
    const [, targetScope, statId, assignOp, numStr] = m;
    const val = parseFloat(numStr);
    if (isNaN(val)) continue;

    if (targetScope === 'player') {
      const cur = player.stats[statId] ?? 0;
      const next =
        assignOp === '+='
          ? cur + val
          : assignOp === '-='
          ? cur - val
          : assignOp === '*='
          ? cur * val
          : val;
      clampStat(player, statId, next);
    } else if (targetScope === 'enemy' && enemy) {
      const cur = enemy.stats[statId] ?? 0;
      const next =
        assignOp === '+='
          ? cur + val
          : assignOp === '-='
          ? cur - val
          : assignOp === '*='
          ? cur * val
          : val;
      clampStat(enemy, statId, next);
    } else if (targetScope === 'global') {
      const cur = globalVars[statId] ?? 0;
      globalVars[statId] =
        assignOp === '+='
          ? cur + val
          : assignOp === '-='
          ? cur - val
          : assignOp === '*='
          ? cur * val
          : val;
    }
  }
}

export interface SingleSimResult {
  winnerPlayerIndex: number | null;
  winnerStrategy: AIArchetype | null;
  winConditionName: string;
  outcomeType:
    | 'win'
    | 'stalemate_timeout'
    | 'infinite_loop'
    | 'deadlock_no_moves'
    | 'mutual_elimination';
  offendingRuleName?: string;
  totalRounds: number;
  totalActions: number;
  playerStrategies: AIArchetype[];
  cardsDrawnByPlayer: Record<string, number>[];
  cardsPlayedByPlayer: Record<string, number>[];
  pieceStats: Record<
    string,
    { spawns: number; kills: number; deaths: number; goalCaptures: number; damageDealt: number }
  >;
  tileVisits: Record<string, number>;
  tileDeaths: Record<string, number>;
  economyByRound: Record<string, number>[];
  snapshots: ReplayTurnSnapshot[];
}

export function runSingleGameSimulation(
  config: GameConfig,
  graphCache: BoardGraphCache,
  strategyOverride?: AIArchetype[],
  recordSnapshots = false
): SingleSimResult {
  const playerCount = Math.max(1, Math.min(6, config.turnConfig.playerCount));
  const statDefs = new Map(config.playerStats.map((s) => [s.id, s]));

  const clampPlayerStat = (p: RuntimePlayerState, statId: string, newVal: number) => {
    const def = statDefs.get(statId);
    if (def) {
      p.stats[statId] = Math.max(def.minValue, Math.min(def.maxValue, Math.round(newVal * 100) / 100));
    } else {
      p.stats[statId] = Math.round(newVal * 100) / 100;
    }
  };

  const applyEffectToPlayerOrPiece = (
    eff: StatEffect,
    player: RuntimePlayerState,
    piece: RuntimePieceState | undefined,
    globalVars: Record<string, number>
  ) => {
    if (eff.target === 'player') {
      const cur = player.stats[eff.statId] ?? 0;
      const next =
        eff.operation === 'add'
          ? cur + eff.value
          : eff.operation === 'subtract'
          ? cur - eff.value
          : eff.operation === 'multiply'
          ? cur * eff.value
          : eff.value;
      clampPlayerStat(player, eff.statId, next);
    } else if (eff.target === 'piece' && piece && piece.alive) {
      if (eff.statId === 'hp') {
        const nextHp =
          eff.operation === 'add'
            ? piece.hp + eff.value
            : eff.operation === 'subtract'
            ? piece.hp - eff.value
            : eff.value;
        piece.hp = Math.min(piece.maxHp, nextHp);
        if (piece.hp <= 0) {
          handlePieceDeath(piece, undefined);
        }
      } else if (eff.statId === 'attack') {
        piece.attack = Math.max(0, piece.attack + (eff.operation === 'subtract' ? -eff.value : eff.value));
      }
    } else if (eff.target === 'global') {
      const cur = globalVars[eff.statId] ?? 0;
      globalVars[eff.statId] =
        eff.operation === 'add'
          ? cur + eff.value
          : eff.operation === 'subtract'
          ? cur - eff.value
          : eff.value;
    }
  };

  const players: RuntimePlayerState[] = [];
  const cardsDrawnByPlayer: Record<string, number>[] = [];
  const cardsPlayedByPlayer: Record<string, number>[] = [];

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

    const strat =
      strategyOverride?.[i] ||
      config.turnConfig.playerStrategies[i] ||
      'balanced';

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
    cardsDrawnByPlayer.push({});
    cardsPlayedByPlayer.push({});
  }

  const globalVars: Record<string, number> = {};
  for (const g of config.globalVars) {
    globalVars[g.id] = g.initialValue;
  }

  const drawPiles = new Map<string, string[]>();
  const discardPiles = new Map<string, string[]>();
  const cardMap = new Map<string, CardDefinition>();
  for (const c of config.cards) {
    cardMap.set(c.id, c);
  }
  for (const d of config.decks) {
    const pile: string[] = [];
    for (const c of config.cards.filter((card) => card.deckId === d.id)) {
      const copies = Math.max(1, Math.min(50, c.copies));
      for (let k = 0; k < copies; k++) pile.push(c.id);
    }
    shuffleInPlace(pile);
    drawPiles.set(d.id, pile);
    discardPiles.set(d.id, []);
  }

  const drawCardForPlayer = (player: RuntimePlayerState, deckId?: string) => {
    if (player.hand.length >= config.turnConfig.maxHandSize) return;
    const targetDeckId = deckId || config.decks[0]?.id;
    if (!targetDeckId) return;
    const pile = drawPiles.get(targetDeckId);
    const discard = discardPiles.get(targetDeckId);
    const deckDef = config.decks.find((d) => d.id === targetDeckId);
    if (!pile) return;

    if (pile.length === 0 && discard && discard.length > 0 && deckDef?.reshuffleDiscard !== false) {
      while (discard.length > 0) {
        pile.push(discard.pop()!);
      }
      shuffleInPlace(pile);
    }
    if (pile.length > 0) {
      const cid = pile.pop()!;
      player.hand.push(cid);
      cardsDrawnByPlayer[player.playerIndex][cid] =
        (cardsDrawnByPlayer[player.playerIndex][cid] || 0) + 1;
    }
  };

  for (const p of players) {
    for (let h = 0; h < config.turnConfig.startingHandSize; h++) {
      drawCardForPlayer(p);
    }
  }

  const pieces: RuntimePieceState[] = [];
  const pieceTelemetryMap: Record<
    string,
    { spawns: number; kills: number; deaths: number; goalCaptures: number; damageDealt: number }
  > = {};
  const archetypeMap = new Map<string, PieceArchetype>();

  for (const arch of config.pieces) {
    archetypeMap.set(arch.id, arch);
    pieceTelemetryMap[arch.id] = {
      spawns: 0,
      kills: 0,
      deaths: 0,
      goalCaptures: 0,
      damageDealt: 0,
    };
  }

  const getSpawnTileForPlayer = (playerIndex: number, unitIndex: number): string => {
    const playerSpawns = graphCache.spawnTilesByPlayer.get(playerIndex);
    if (playerSpawns && playerSpawns.length > 0) {
      return playerSpawns[unitIndex % playerSpawns.length];
    }
    if (graphCache.anySpawnTiles.length > 0) {
      return graphCache.anySpawnTiles[(playerIndex + unitIndex) % graphCache.anySpawnTiles.length];
    }
    const passable = config.board.tiles.filter((t) => t.type !== 'obstacle');
    if (passable.length === 0) return config.board.tiles[0]?.id || 'tile_0_0';
    if (playerIndex === 0) return passable[0].id;
    if (playerIndex === 1) return passable[passable.length - 1].id;
    return passable[(playerIndex * 3) % passable.length].id;
  };

  const tileVisits: Record<string, number> = {};
  const tileDeaths: Record<string, number> = {};
  for (const t of config.board.tiles) {
    tileVisits[t.id] = 0;
    tileDeaths[t.id] = 0;
  }

  let instanceCounter = 1;
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
        const spawnTileId = getSpawnTileForPlayer(pIdx, u);
        pieces.push({
          instanceId: `unit_${instanceCounter++}`,
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
        pieceTelemetryMap[arch.id].spawns++;
        tileVisits[spawnTileId] = (tileVisits[spawnTileId] || 0) + 1;
      }
    }
  }

  let winnerPlayerIndex: number | null = null;
  let winConditionName = '';
  let outcomeType: SingleSimResult['outcomeType'] = 'stalemate_timeout';
  let offendingRuleName: string | undefined = undefined;
  const isLoopOrWon = () => outcomeType === 'infinite_loop' || winnerPlayerIndex !== null;
  let totalActions = 0;
  let currentRound = 1;
  const snapshots: ReplayTurnSnapshot[] = [];
  const economyByRound: Record<string, number>[] = [];
  let turnEvents: string[] = [];

  let ruleTriggersThisTurn: Record<string, number> = {};
  let totalRuleCallDepthThisTurn = 0;
  const MAX_SAFE_TRIGGER_CHAIN = 35;

  const handlePieceDeath = (victim: RuntimePieceState, killerPiece?: RuntimePieceState) => {
    if (!victim.alive) return;
    victim.alive = false;
    victim.hp = 0;
    const arch = archetypeMap.get(victim.archetypeId);
    if (arch) {
      pieceTelemetryMap[arch.id].deaths++;
      if (arch.respawnOnDeath) {
        victim.respawnTimer = Math.max(1, arch.respawnDelayTurns);
      }
    }
    tileDeaths[victim.tileId] = (tileDeaths[victim.tileId] || 0) + 1;

    if (killerPiece) {
      const killerArch = archetypeMap.get(killerPiece.archetypeId);
      const killerPlayer = players[killerPiece.ownerPlayerIndex];
      if (killerArch && killerPlayer) {
        pieceTelemetryMap[killerArch.id].kills++;
        for (const eff of killerArch.onKillEffects) {
          applyEffectToPlayerOrPiece(eff, killerPlayer, killerPiece, globalVars);
        }
      }
    }

    const victimPlayer = players[victim.ownerPlayerIndex];
    if (victimPlayer) {
      fireRules('ON_PIECE_DEATH', victimPlayer, victim, graphCache.tileMap.get(victim.tileId));
    }
  };

  const movePieceAlongBoard = (
    piece: RuntimePieceState,
    player: RuntimePlayerState,
    steps: number,
    preferGoal: boolean
  ) => {
    if (!piece.alive || steps <= 0) return;
    let moved = false;
    for (let s = 0; s < steps; s++) {
      const nextTileIds = graphCache.neighbors.get(piece.tileId) || [];
      if (nextTileIds.length === 0) break;

      let chosenTileId = nextTileIds[0];
      if (nextTileIds.length > 1) {
        chosenTileId = chooseBestNextTile(
          nextTileIds,
          player.strategy,
          preferGoal,
          piece,
          pieces,
          graphCache
        );
      }

      piece.tileId = chosenTileId;
      moved = true;
      player.movesCount++;
      totalActions++;
      tileVisits[chosenTileId] = (tileVisits[chosenTileId] || 0) + 1;
    }

    if (moved) {
      const landedTile = graphCache.tileMap.get(piece.tileId);
      if (landedTile) {
        if (landedTile.type === 'goal') {
          const arch = archetypeMap.get(piece.archetypeId);
          if (arch) pieceTelemetryMap[arch.id].goalCaptures++;
        }
        for (const eff of landedTile.onEnterEffects) {
          applyEffectToPlayerOrPiece(eff, player, piece, globalVars);
        }
        if (recordSnapshots) {
          turnEvents.push(`${player.name}'s ${piece.name} landed on ${landedTile.label}`);
        }
        fireRules('ON_MOVE', player, piece, landedTile);
        fireRules('ON_LAND_TILE', player, piece, landedTile);
      }
    }
  };

  const fireRules = (
    event: RuleTriggerEvent,
    player: RuntimePlayerState,
    activePiece?: RuntimePieceState,
    tile?: BoardTile
  ) => {
    if (outcomeType === 'infinite_loop' || winnerPlayerIndex !== null) return;

    for (const rule of config.rules) {
      if (!rule.enabled || rule.trigger !== event) continue;

      const firedCount = ruleTriggersThisTurn[rule.id] || 0;
      if (rule.maxTriggersPerTurn > 0 && firedCount >= rule.maxTriggersPerTurn) {
        continue;
      }

      let condPassed = true;
      if (rule.conditionType === 'stat_compare' && rule.conditionStatId && rule.conditionOperator) {
        const val = player.stats[rule.conditionStatId] ?? 0;
        condPassed = compareValues(val, rule.conditionOperator, rule.conditionValue ?? 0);
      } else if (rule.conditionType === 'tile_type' && rule.conditionTileType) {
        condPassed = tile?.type === rule.conditionTileType;
      } else if (rule.conditionType === 'turn_compare' && rule.conditionOperator) {
        condPassed = compareValues(currentRound, rule.conditionOperator, rule.conditionValue ?? 1);
      } else if (rule.conditionType === 'custom_expr') {
        condPassed = evaluateCustomCondition(
          rule.customConditionExpr,
          player,
          currentRound,
          globalVars,
          tile
        );
      }

      if (!condPassed) continue;

      ruleTriggersThisTurn[rule.id] = firedCount + 1;
      totalRuleCallDepthThisTurn++;

      if (totalRuleCallDepthThisTurn > MAX_SAFE_TRIGGER_CHAIN) {
        outcomeType = 'infinite_loop';
        offendingRuleName = rule.name;
        winConditionName = `Infinite Loop Abort (${rule.name})`;
        if (recordSnapshots) {
          turnEvents.push(
            `CRITICAL LOOP: Rule "${rule.name}" triggered >${MAX_SAFE_TRIGGER_CHAIN} times in a single turn!`
          );
        }
        return;
      }

      if (recordSnapshots) {
        turnEvents.push(`Rule Triggered: "${rule.name}"`);
      }

      for (const act of rule.actions) {
        if (isLoopOrWon()) return;
        switch (act.type) {
          case 'modify_stat':
            if (act.statId) {
              applyEffectToPlayerOrPiece(
                {
                  id: act.id,
                  target: 'player',
                  statId: act.statId,
                  operation: act.operation || 'add',
                  value: act.value,
                },
                player,
                activePiece,
                globalVars
              );
            }
            break;
          case 'damage_active_piece':
            if (activePiece && activePiece.alive) {
              activePiece.hp -= act.value;
              if (activePiece.hp <= 0) handlePieceDeath(activePiece, undefined);
            }
            break;
          case 'heal_active_piece':
            if (activePiece && activePiece.alive) {
              activePiece.hp = Math.min(activePiece.maxHp, activePiece.hp + act.value);
            }
            break;
          case 'move_forward': {
            const pieceToMove =
              activePiece ||
              pieces.find((p) => p.ownerPlayerIndex === player.playerIndex && p.alive);
            if (pieceToMove) {
              movePieceAlongBoard(pieceToMove, player, Math.max(1, act.value), true);
            }
            break;
          }
          case 'draw_card':
            for (let c = 0; c < Math.max(1, act.value); c++) {
              drawCardForPlayer(player);
            }
            break;
          case 'modify_global':
            if (act.statId) {
              globalVars[act.statId] = (globalVars[act.statId] ?? 0) + act.value;
            }
            break;
          case 'custom_formula': {
            const enemy = players.find(
              (p) => p.playerIndex !== player.playerIndex && !p.eliminated
            );
            executeCustomFormula(act.formula, player, enemy, globalVars, clampPlayerStat);
            break;
          }
          default:
            break;
        }
      }
    }
  };

  const evaluateWinAndLossConditions = (isMaxTurnEnd = false): boolean => {
    if (outcomeType === 'infinite_loop') return true;

    for (const wc of config.winConditions) {
      if (!wc.enabled || !wc.isLossCondition) continue;
      if (wc.type === 'stat_threshold' && wc.statId && wc.operator !== undefined) {
        for (const p of players) {
          if (p.eliminated) continue;
          const val = p.stats[wc.statId] ?? 0;
          if (compareValues(val, wc.operator, wc.targetValue ?? 0)) {
            p.eliminated = true;
            for (const unit of pieces) {
              if (unit.ownerPlayerIndex === p.playerIndex) unit.alive = false;
            }
            if (recordSnapshots) {
              turnEvents.push(`${p.name} eliminated by "${wc.name}"!`);
            }
          }
        }
      }
    }

    const alivePlayers = players.filter((p) => !p.eliminated);
    if (alivePlayers.length === 0) {
      outcomeType = 'mutual_elimination';
      winConditionName = 'Mutual Elimination';
      return true;
    }

    for (const wc of config.winConditions) {
      if (!wc.enabled || wc.isLossCondition) continue;

      if (wc.type === 'last_player_standing' && playerCount > 1 && alivePlayers.length === 1) {
        winnerPlayerIndex = alivePlayers[0].playerIndex;
        winConditionName = wc.name;
        outcomeType = 'win';
        return true;
      }

      if (wc.type === 'stat_threshold' && wc.statId && wc.operator) {
        for (const p of alivePlayers) {
          const val = p.stats[wc.statId] ?? 0;
          if (compareValues(val, wc.operator, wc.targetValue ?? 10)) {
            winnerPlayerIndex = p.playerIndex;
            winConditionName = wc.name;
            outcomeType = 'win';
            return true;
          }
        }
      }

      if (wc.type === 'reach_goal_tile') {
        for (const p of alivePlayers) {
          const onGoal = pieces.some(
            (u) =>
              u.ownerPlayerIndex === p.playerIndex &&
              u.alive &&
              graphCache.tileMap.get(u.tileId)?.type === 'goal'
          );
          if (onGoal) {
            winnerPlayerIndex = p.playerIndex;
            winConditionName = wc.name;
            outcomeType = 'win';
            return true;
          }
        }
      }

      if (wc.type === 'control_goal_tiles') {
        const req = Math.max(1, wc.targetValue ?? 1);
        for (const p of alivePlayers) {
          const heldGoals = new Set(
            pieces
              .filter(
                (u) =>
                  u.ownerPlayerIndex === p.playerIndex &&
                  u.alive &&
                  graphCache.tileMap.get(u.tileId)?.type === 'goal'
              )
              .map((u) => u.tileId)
          );
          if (heldGoals.size >= req) {
            winnerPlayerIndex = p.playerIndex;
            winConditionName = wc.name;
            outcomeType = 'win';
            return true;
          }
        }
      }

      if (wc.type === 'eliminate_all_enemies' && playerCount > 1) {
        for (const p of alivePlayers) {
          const enemyUnitsAlive = pieces.some(
            (u) => u.ownerPlayerIndex !== p.playerIndex && u.alive
          );
          if (!enemyUnitsAlive && pieces.length > 0) {
            winnerPlayerIndex = p.playerIndex;
            winConditionName = wc.name;
            outcomeType = 'win';
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
          winnerPlayerIndex = bestPlayers[0].playerIndex;
          winConditionName = wc.name;
          outcomeType = 'win';
          return true;
        }
      }
    }

    return false;
  };

  for (const p of players) {
    fireRules('ON_GAME_START', p);
  }

  let consecutiveZeroActionRounds = 0;
  const maxRounds = Math.max(1, Math.min(200, config.turnConfig.maxTurns));

  for (currentRound = 1; currentRound <= maxRounds; currentRound++) {
    let actionsThisRound = 0;

    for (let pIdx = 0; pIdx < playerCount; pIdx++) {
      const player = players[pIdx];
      if (player.eliminated) continue;

      turnEvents = [];
      ruleTriggersThisTurn = {};
      totalRuleCallDepthThisTurn = 0;
      player.turnsTaken++;

      fireRules('ON_TURN_START', player);
      if (evaluateWinAndLossConditions(false)) break;

      for (const phase of config.turnConfig.phases) {
        if (!phase.enabled) continue;
        if (isLoopOrWon() || player.eliminated) {
          break;
        }

        switch (phase.type) {
          case 'upkeep': {
            for (const s of config.playerStats) {
              if (s.regenPerTurn !== 0) {
                clampPlayerStat(player, s.id, (player.stats[s.id] ?? 0) + s.regenPerTurn);
              }
            }
            for (const u of pieces) {
              if (u.ownerPlayerIndex === player.playerIndex && !u.alive && u.respawnTimer > 0) {
                u.respawnTimer--;
                if (u.respawnTimer <= 0) {
                  u.alive = true;
                  u.hp = u.maxHp;
                  u.tileId = getSpawnTileForPlayer(player.playerIndex, 0);
                  const arch = archetypeMap.get(u.archetypeId);
                  if (arch) pieceTelemetryMap[arch.id].spawns++;
                  if (recordSnapshots) {
                    turnEvents.push(`${player.name}'s ${u.name} respawned at ${u.tileId}`);
                  }
                }
              }
            }
            break;
          }

          case 'draw': {
            const deckId = phase.deckIdToDraw || config.decks[0]?.id;
            const deckDef = config.decks.find((d) => d.id === deckId);
            const drawCount = Math.max(1, deckDef?.drawPerTurn ?? 1);
            for (let d = 0; d < drawCount; d++) {
              drawCardForPlayer(player, deckId);
            }
            break;
          }

          case 'roll_and_move': {
            let rollSum = 0;
            const dCount = Math.max(1, config.turnConfig.diceCount);
            const dSides = Math.max(1, config.turnConfig.diceSides);
            for (let d = 0; d < dCount; d++) {
              rollSum += Math.floor(Math.random() * dSides) + 1;
            }
            const myUnits = pieces.filter(
              (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
            );
            if (myUnits.length > 0 && rollSum > 0) {
              const unit = myUnits[0];
              if (recordSnapshots) {
                turnEvents.push(`${player.name} rolled ${rollSum} and moved ${unit.name}`);
              }
              movePieceAlongBoard(unit, player, rollSum, true);
              actionsThisRound++;
            }
            break;
          }

          case 'play_cards': {
            const maxToPlay = phase.maxCardsToPlay ?? 2;
            let playedInPhase = 0;
            while (playedInPhase < maxToPlay && player.hand.length > 0) {
              const bestCardIdx = selectCardToPlay(
                player,
                players,
                pieces,
                cardMap,
                currentRound,
                globalVars
              );
              if (bestCardIdx === -1) break;

              const cardId = player.hand[bestCardIdx];
              const card = cardMap.get(cardId);
              if (!card) break;

              if (card.costStatId && card.costAmount > 0) {
                clampPlayerStat(
                  player,
                  card.costStatId,
                  (player.stats[card.costStatId] ?? 0) - card.costAmount
                );
              }

              player.hand.splice(bestCardIdx, 1);
              discardPiles.get(card.deckId)?.push(card.id);

              player.cardsPlayedCount++;
              playedInPhase++;
              actionsThisRound++;
              totalActions++;
              cardsPlayedByPlayer[player.playerIndex][card.id] =
                (cardsPlayedByPlayer[player.playerIndex][card.id] || 0) + 1;

              if (recordSnapshots) {
                turnEvents.push(`${player.name} played card "${card.name}"`);
              }

              const enemyPlayers = players.filter(
                (ep) => ep.playerIndex !== player.playerIndex && !ep.eliminated
              );
              const targetEnemy = selectTargetEnemyPlayer(enemyPlayers, player.strategy);

              for (const ce of card.effects) {
                switch (ce.type) {
                  case 'modify_player_stat':
                    if (ce.statId) {
                      clampPlayerStat(player, ce.statId, (player.stats[ce.statId] ?? 0) + ce.value);
                    }
                    break;
                  case 'modify_enemy_stat':
                    if (ce.statId && targetEnemy) {
                      clampPlayerStat(
                        targetEnemy,
                        ce.statId,
                        (targetEnemy.stats[ce.statId] ?? 0) + ce.value
                      );
                    }
                    break;
                  case 'steal_stat':
                    if (ce.statId && targetEnemy) {
                      const avail = Math.max(
                        0,
                        Math.min(ce.value, targetEnemy.stats[ce.statId] ?? 0)
                      );
                      clampPlayerStat(
                        targetEnemy,
                        ce.statId,
                        (targetEnemy.stats[ce.statId] ?? 0) - avail
                      );
                      clampPlayerStat(player, ce.statId, (player.stats[ce.statId] ?? 0) + avail);
                    }
                    break;
                  case 'damage_piece': {
                    const enemyUnit = pieces.find(
                      (u) => u.ownerPlayerIndex !== player.playerIndex && u.alive
                    );
                    if (enemyUnit) {
                      enemyUnit.hp -= Math.abs(ce.value);
                      if (enemyUnit.hp <= 0) handlePieceDeath(enemyUnit, undefined);
                    }
                    break;
                  }
                  case 'heal_piece': {
                    const friendlyUnit = pieces.find(
                      (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
                    );
                    if (friendlyUnit) {
                      friendlyUnit.hp = Math.min(
                        friendlyUnit.maxHp,
                        friendlyUnit.hp + Math.abs(ce.value)
                      );
                    }
                    break;
                  }
                  case 'boost_piece_attack': {
                    const friendlyUnit = pieces.find(
                      (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
                    );
                    if (friendlyUnit) {
                      friendlyUnit.attack += ce.value;
                    }
                    break;
                  }
                  case 'push_move_piece':
                  case 'teleport_to_goal_step': {
                    const friendlyUnit = pieces.find(
                      (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
                    );
                    if (friendlyUnit) {
                      movePieceAlongBoard(friendlyUnit, player, Math.max(1, ce.value), true);
                    }
                    break;
                  }
                  case 'draw_cards':
                    for (let k = 0; k < Math.max(1, ce.value); k++) {
                      drawCardForPlayer(player, card.deckId);
                    }
                    break;
                }
              }

              if (card.formulaExpr) {
                executeCustomFormula(
                  card.formulaExpr,
                  player,
                  targetEnemy,
                  globalVars,
                  clampPlayerStat
                );
              }

              fireRules('ON_CARD_PLAY', player);
              if (evaluateWinAndLossConditions(false)) break;
            }
            break;
          }

          case 'action_points':
          case 'combat': {
            let ap =
              phase.type === 'combat'
                ? 1
                : Math.max(1, config.turnConfig.actionPointsPerTurn + (phase.bonusAp || 0));

            while (ap > 0) {
              if (isLoopOrWon()) break;
              const myUnits = pieces.filter(
                (u) => u.ownerPlayerIndex === player.playerIndex && u.alive
              );
              if (myUnits.length === 0) break;

              let performedUnitAction = false;
              for (const unit of myUnits) {
                if (ap <= 0) break;
                const arch = archetypeMap.get(unit.archetypeId);
                const cost = Math.max(1, arch?.apCost ?? 1);
                if (ap < cost) continue;

                const attackableEnemies = findAttackableEnemies(unit, arch, pieces, graphCache);
                const shouldAttackFirst =
                  attackableEnemies.length > 0 &&
                  (player.strategy === 'aggressive' ||
                    phase.type === 'combat' ||
                    graphCache.tileMap.get(unit.tileId)?.type === 'goal' ||
                    Math.random() < 0.65);

                if (shouldAttackFirst) {
                  const target = attackableEnemies[0];
                  ap -= cost;
                  performedUnitAction = true;
                  actionsThisRound++;
                  totalActions++;
                  player.attacksCount++;

                  const rawDmg = Math.max(1, unit.attack - Math.floor(target.defense * 0.5));
                  target.hp -= rawDmg;
                  if (arch) pieceTelemetryMap[arch.id].damageDealt += rawDmg;

                  if (recordSnapshots) {
                    turnEvents.push(
                      `${player.name}'s ${unit.name} attacked ${target.name} for ${rawDmg} dmg`
                    );
                  }

                  if (arch) {
                    for (const eff of arch.onAttackEffects) {
                      applyEffectToPlayerOrPiece(eff, player, unit, globalVars);
                    }
                  }
                  fireRules('ON_COMBAT', player, unit, graphCache.tileMap.get(unit.tileId));

                  if (target.hp <= 0) {
                    handlePieceDeath(target, unit);
                  }
                } else if (phase.type !== 'combat' && (arch?.moveRange ?? 1) > 0) {
                  ap -= cost;
                  performedUnitAction = true;
                  actionsThisRound++;
                  const steps = Math.max(1, arch?.moveRange ?? 1);
                  movePieceAlongBoard(
                    unit,
                    player,
                    steps,
                    player.strategy === 'rusher' || player.strategy === 'balanced'
                  );

                  const coLocatedEnemy = pieces.find(
                    (e) =>
                      e.ownerPlayerIndex !== player.playerIndex &&
                      e.alive &&
                      e.tileId === unit.tileId
                  );
                  if (coLocatedEnemy) {
                    const dmg = Math.max(1, unit.attack - Math.floor(coLocatedEnemy.defense * 0.5));
                    coLocatedEnemy.hp -= dmg;
                    if (arch) pieceTelemetryMap[arch.id].damageDealt += dmg;
                    fireRules('ON_COMBAT', player, unit, graphCache.tileMap.get(unit.tileId));
                    if (coLocatedEnemy.hp <= 0) {
                      handlePieceDeath(coLocatedEnemy, unit);
                    }
                  }
                }
              }

              if (!performedUnitAction) break;
              if (evaluateWinAndLossConditions(false)) break;
            }
            break;
          }

          case 'end_turn': {
            const occupiedTiles = new Set<string>();
            for (const u of pieces) {
              if (u.ownerPlayerIndex === player.playerIndex && u.alive) {
                const tile = graphCache.tileMap.get(u.tileId);
                if (tile && !occupiedTiles.has(tile.id)) {
                  occupiedTiles.add(tile.id);
                  for (const eff of tile.onTurnEndEffects) {
                    applyEffectToPlayerOrPiece(eff, player, u, globalVars);
                  }
                }
              }
            }
            fireRules('ON_TURN_END', player);
            break;
          }
        }
      }

      if (recordSnapshots) {
        snapshots.push({
          round: currentRound,
          activePlayerIndex: player.playerIndex,
          players: players.map((pl) => ({
            ...pl,
            stats: { ...pl.stats },
            hand: [...pl.hand],
          })),
          pieces: pieces.map((pc) => ({ ...pc })),
          globalVars: { ...globalVars },
          events: [...turnEvents],
        });
      }

      if (evaluateWinAndLossConditions(false)) break;
    }

    const avgStats: Record<string, number> = {};
    const activePlayers = players.filter((p) => !p.eliminated);
    const denom = Math.max(1, activePlayers.length);
    for (const s of config.playerStats) {
      let sum = 0;
      for (const p of activePlayers) sum += p.stats[s.id] ?? 0;
      avgStats[s.id] = Math.round((sum / denom) * 100) / 100;
    }
    economyByRound.push(avgStats);

    if (isLoopOrWon()) {
      break;
    }

    for (const g of config.globalVars) {
      if (g.changePerRound !== 0) {
        const nextG = (globalVars[g.id] ?? g.initialValue) + g.changePerRound;
        globalVars[g.id] = Math.max(g.minValue, Math.min(g.maxValue, nextG));
      }
    }
    if (activePlayers.length > 0) {
      fireRules('ON_ROUND_END', activePlayers[0]);
    }

    if (actionsThisRound === 0) {
      consecutiveZeroActionRounds++;
      if (consecutiveZeroActionRounds >= 3) {
        outcomeType = 'deadlock_no_moves';
        winConditionName = 'Board Lock / 0 Legal Actions';
        break;
      }
    } else {
      consecutiveZeroActionRounds = 0;
    }
  }

  if (winnerPlayerIndex === null && outcomeType === 'stalemate_timeout') {
    evaluateWinAndLossConditions(true);
    if (winnerPlayerIndex === null) {
      winConditionName = `Stalemate / Timeout (${maxRounds} Rounds)`;
    }
  }

  return {
    winnerPlayerIndex,
    winnerStrategy: winnerPlayerIndex !== null ? players[winnerPlayerIndex].strategy : null,
    winConditionName,
    outcomeType,
    offendingRuleName,
    totalRounds: Math.min(currentRound, maxRounds),
    totalActions,
    playerStrategies: players.map((p) => p.strategy),
    cardsDrawnByPlayer,
    cardsPlayedByPlayer,
    pieceStats: pieceTelemetryMap,
    tileVisits,
    tileDeaths,
    economyByRound,
    snapshots,
  };
}

function chooseBestNextTile(
  candidateIds: string[],
  strategy: AIArchetype,
  preferGoal: boolean,
  unit: RuntimePieceState,
  allPieces: RuntimePieceState[],
  graphCache: BoardGraphCache
): string {
  if (strategy === 'random') {
    return candidateIds[Math.floor(Math.random() * candidateIds.length)];
  }

  let bestId = candidateIds[0];
  let bestScore = -Infinity;

  for (const cid of candidateIds) {
    const tile = graphCache.tileMap.get(cid);
    if (!tile) continue;

    let score = (Math.random() - 0.5) * 0.4;

    const dGoal = graphCache.distToGoal.get(cid) ?? 50;
    const dResource = graphCache.distToBoostOrShop.get(cid) ?? 50;

    if (strategy === 'rusher' || preferGoal) {
      score -= dGoal * 3.5;
      if (tile.type === 'goal') score += 20;
    } else if (strategy === 'economic') {
      score -= dResource * 3.0;
      score -= dGoal * 1.2;
      if (tile.type === 'boost' || tile.type === 'shop' || tile.type === 'checkpoint') {
        score += 15;
      }
    } else if (strategy === 'aggressive') {
      score -= dGoal * 1.5;
      const hasEnemy = allPieces.some(
        (p) => p.ownerPlayerIndex !== unit.ownerPlayerIndex && p.alive && p.tileId === cid
      );
      if (hasEnemy) score += 18;
    } else if (strategy === 'defensive') {
      score -= dGoal * 1.5;
      if (tile.type === 'hazard') score -= 25;
      if (tile.type === 'boost') score += 10;
    } else {
      score -= dGoal * 2.5;
      score -= dResource * 1.0;
      if (tile.type === 'goal') score += 16;
      if (tile.type === 'hazard' && unit.hp <= 5) score -= 18;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = cid;
    }
  }

  return bestId;
}

function findAttackableEnemies(
  unit: RuntimePieceState,
  arch: PieceArchetype | undefined,
  allPieces: RuntimePieceState[],
  graphCache: BoardGraphCache
): RuntimePieceState[] {
  const range = Math.max(1, arch?.attackRange ?? 1);
  const directNeighbors = graphCache.neighbors.get(unit.tileId) || [];

  return allPieces.filter((other) => {
    if (!other.alive || other.ownerPlayerIndex === unit.ownerPlayerIndex) return false;
    if (other.tileId === unit.tileId) return true;
    if (directNeighbors.includes(other.tileId)) return true;
    if (range >= 2) {
      const uTile = graphCache.tileMap.get(unit.tileId);
      const oTile = graphCache.tileMap.get(other.tileId);
      if (uTile?.row !== undefined && oTile?.row !== undefined && uTile.col !== undefined && oTile.col !== undefined) {
        const manhattan = Math.abs(uTile.row - oTile.row) + Math.abs(uTile.col - oTile.col);
        return manhattan <= range;
      }
    }
    return false;
  });
}

function selectCardToPlay(
  player: RuntimePlayerState,
  allPlayers: RuntimePlayerState[],
  allPieces: RuntimePieceState[],
  cardMap: Map<string, CardDefinition>,
  round: number,
  globalVars: Record<string, number>
): number {
  let bestIdx = -1;
  let bestPriority = -Infinity;

  for (let i = 0; i < player.hand.length; i++) {
    const cid = player.hand[i];
    const card = cardMap.get(cid);
    if (!card) continue;

    if (card.costStatId && card.costAmount > 0) {
      const avail = player.stats[card.costStatId] ?? 0;
      if (avail < card.costAmount) continue;
    }

    if (!evaluateCustomCondition(card.conditionExpr, player, round, globalVars)) {
      continue;
    }

    if (card.targetType === 'enemy_piece') {
      const hasEnemyPiece = allPieces.some(
        (u) => u.ownerPlayerIndex !== player.playerIndex && u.alive
      );
      if (!hasEnemyPiece) continue;
    }

    let score = 5 + card.costAmount;
    for (const eff of card.effects) {
      if (eff.statId === 'vp') score += eff.value * 4;
      if (eff.type === 'modify_enemy_stat' || eff.type === 'damage_piece') {
        score += Math.abs(eff.value) * (player.strategy === 'aggressive' ? 2.5 : 1.5);
      }
      if (eff.type === 'push_move_piece' || eff.type === 'teleport_to_goal_step') {
        score += eff.value * (player.strategy === 'rusher' ? 3.0 : 1.8);
      }
    }

    if (player.strategy === 'random') {
      score = Math.random() * 20;
    }

    if (score > bestPriority) {
      bestPriority = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function selectTargetEnemyPlayer(
  enemies: RuntimePlayerState[],
  strategy: AIArchetype
): RuntimePlayerState | undefined {
  if (enemies.length === 0) return undefined;
  if (strategy === 'random') {
    return enemies[Math.floor(Math.random() * enemies.length)];
  }
  return [...enemies].sort((a, b) => {
    const vpDiff = (b.stats['vp'] ?? 0) - (a.stats['vp'] ?? 0);
    if (vpDiff !== 0) return vpDiff;
    return (a.stats['hp'] ?? 20) - (b.stats['hp'] ?? 20);
  })[0];
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

export async function runMonteCarloBatch(
  config: GameConfig,
  totalGames: number,
  randomizeStrategies: boolean,
  onProgress?: (completed: number, total: number) => void
): Promise<SimulationBatchSummary> {
  const startTime = performance.now();
  const graphCache = buildBoardGraphCache(config.board);
  const playerCount = Math.max(1, Math.min(6, config.turnConfig.playerCount));

  const winsBySeat = new Array(playerCount).fill(0);
  const winsByCondition: Record<string, number> = {};
  const outcomeCounts = {
    win: 0,
    stalemate_timeout: 0,
    infinite_loop: 0,
    deadlock_no_moves: 0,
    mutual_elimination: 0,
  };

  const winsByStrategy: Record<AIArchetype, { games: number; wins: number; winRate: number }> = {
    balanced: { games: 0, wins: 0, winRate: 0 },
    aggressive: { games: 0, wins: 0, winRate: 0 },
    rusher: { games: 0, wins: 0, winRate: 0 },
    economic: { games: 0, wins: 0, winRate: 0 },
    defensive: { games: 0, wins: 0, winRate: 0 },
    random: { games: 0, wins: 0, winRate: 0 },
  };

  const cardAgg = new Map<
    string,
    { drawn: number; played: number; gamesPlayed: number; winsWhenPlayed: number }
  >();
  for (const c of config.cards) {
    cardAgg.set(c.id, { drawn: 0, played: 0, gamesPlayed: 0, winsWhenPlayed: 0 });
  }

  const pieceAgg = new Map<
    string,
    { spawns: number; kills: number; deaths: number; goalCaptures: number; damageDealt: number }
  >();
  for (const p of config.pieces) {
    pieceAgg.set(p.id, { spawns: 0, kills: 0, deaths: 0, goalCaptures: 0, damageDealt: 0 });
  }

  const tileVisits: Record<string, number> = {};
  const tileDeaths: Record<string, number> = {};
  for (const t of config.board.tiles) {
    tileVisits[t.id] = 0;
    tileDeaths[t.id] = 0;
  }

  const maxRounds = Math.max(1, config.turnConfig.maxTurns);
  const economySumByRound: Record<string, number>[] = Array.from({ length: maxRounds }, () => ({}));
  const economyCountByRound: number[] = new Array(maxRounds).fill(0);

  const roundsList: number[] = [];
  let offendingLoopRule: string | undefined = undefined;

  let fastestWinLog: SimulatedGameLog | null = null;
  let longestGameLog: SimulatedGameLog | null = null;
  let anomalyGameLog: SimulatedGameLog | null = null;
  let sampleTypicalLog: SimulatedGameLog | null = null;

  const chunkSize = totalGames <= 500 ? 100 : 250;

  for (let i = 0; i < totalGames; i++) {
    const strategyOverride = randomizeStrategies
      ? Array.from(
          { length: playerCount },
          () => ALL_STRATEGIES[Math.floor(Math.random() * ALL_STRATEGIES.length)]
        )
      : undefined;

    const shouldRecordLog =
      i < 20 || fastestWinLog === null || anomalyGameLog === null;

    const res = runSingleGameSimulation(config, graphCache, strategyOverride, shouldRecordLog);

    outcomeCounts[res.outcomeType]++;
    roundsList.push(res.totalRounds);
    winsByCondition[res.winConditionName] = (winsByCondition[res.winConditionName] || 0) + 1;

    if (res.offendingRuleName && !offendingLoopRule) {
      offendingLoopRule = res.offendingRuleName;
    }

    for (let s = 0; s < playerCount; s++) {
      const strat = res.playerStrategies[s];
      winsByStrategy[strat].games++;
      if (res.winnerPlayerIndex === s) {
        winsBySeat[s]++;
        winsByStrategy[strat].wins++;
      }
    }

    for (const c of config.cards) {
      const entry = cardAgg.get(c.id)!;
      for (let s = 0; s < playerCount; s++) {
        const dCount = res.cardsDrawnByPlayer[s][c.id] || 0;
        const pCount = res.cardsPlayedByPlayer[s][c.id] || 0;
        entry.drawn += dCount;
        entry.played += pCount;
        if (pCount > 0) {
          entry.gamesPlayed++;
          if (res.winnerPlayerIndex === s) {
            entry.winsWhenPlayed++;
          }
        }
      }
    }

    for (const p of config.pieces) {
      const pe = pieceAgg.get(p.id)!;
      const rPe = res.pieceStats[p.id];
      if (rPe) {
        pe.spawns += rPe.spawns;
        pe.kills += rPe.kills;
        pe.deaths += rPe.deaths;
        pe.goalCaptures += rPe.goalCaptures;
        pe.damageDealt += rPe.damageDealt;
      }
    }

    for (const [tid, v] of Object.entries(res.tileVisits)) {
      tileVisits[tid] = (tileVisits[tid] || 0) + v;
    }
    for (const [tid, d] of Object.entries(res.tileDeaths)) {
      tileDeaths[tid] = (tileDeaths[tid] || 0) + d;
    }

    for (let r = 0; r < res.economyByRound.length && r < maxRounds; r++) {
      economyCountByRound[r]++;
      for (const [statId, val] of Object.entries(res.economyByRound[r])) {
        economySumByRound[r][statId] = (economySumByRound[r][statId] || 0) + val;
      }
    }

    if (res.snapshots.length > 0) {
      const logObj: SimulatedGameLog = {
        gameIndex: i + 1,
        label: 'Simulated Match',
        winnerPlayerIndex: res.winnerPlayerIndex,
        winnerStrategy: res.winnerStrategy,
        winConditionName: res.winConditionName,
        outcomeType: res.outcomeType,
        totalRounds: res.totalRounds,
        totalActions: res.totalActions,
        snapshots: res.snapshots,
      };

      if (
        res.outcomeType === 'win' &&
        (!fastestWinLog || res.totalRounds < fastestWinLog.totalRounds)
      ) {
        fastestWinLog = { ...logObj, label: `Fastest Win (${res.totalRounds} Rounds)` };
      }
      if (!longestGameLog || res.totalRounds > longestGameLog.totalRounds) {
        longestGameLog = { ...logObj, label: `Longest Match (${res.totalRounds} Rounds)` };
      }
      if (
        res.outcomeType !== 'win' &&
        (!anomalyGameLog || res.outcomeType === 'infinite_loop')
      ) {
        anomalyGameLog = {
          ...logObj,
          label:
            res.outcomeType === 'infinite_loop'
              ? `Infinite Loop Failure (Game #${i + 1})`
              : `Stalemate / Deadlock (Game #${i + 1})`,
        };
      }
      if (!sampleTypicalLog && res.outcomeType === 'win' && res.totalRounds >= 4) {
        sampleTypicalLog = { ...logObj, label: `Typical Complete Match (Game #${i + 1})` };
      }
    }

    if ((i + 1) % chunkSize === 0) {
      onProgress?.(i + 1, totalGames);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.(totalGames, totalGames);

  const winRatesBySeat = winsBySeat.map((w) => w / Math.max(1, totalGames));
  for (const strat of ALL_STRATEGIES) {
    const st = winsByStrategy[strat];
    st.winRate = st.games > 0 ? st.wins / st.games : 0;
  }

  const sortedRounds = [...roundsList].sort((a, b) => a - b);
  const avgRounds =
    roundsList.reduce((acc, r) => acc + r, 0) / Math.max(1, roundsList.length);
  const medianRounds = sortedRounds[Math.floor(sortedRounds.length * 0.5)] || 0;
  const minRounds = sortedRounds[0] || 0;
  const maxObsRounds = sortedRounds[sortedRounds.length - 1] || 0;
  const p90Rounds = sortedRounds[Math.floor(sortedRounds.length * 0.9)] || 0;

  const bucketCount = 6;
  const bucketSpan = Math.max(1, Math.ceil(maxRounds / bucketCount));
  const roundHistogram = Array.from({ length: bucketCount }, (_, idx) => {
    const bMin = idx * bucketSpan + 1;
    const bMax = idx === bucketCount - 1 ? maxRounds : (idx + 1) * bucketSpan;
    const count = roundsList.filter((r) => r >= bMin && r <= bMax).length;
    return {
      bucketLabel: `R${bMin}-${bMax}`,
      min: bMin,
      max: bMax,
      count,
    };
  });

  const baselineWinRate = 1 / playerCount;
  const deckMap = new Map(config.decks.map((d) => [d.id, d.name]));

  const cardTelemetry: CardTelemetry[] = config.cards.map((c) => {
    const agg = cardAgg.get(c.id)!;
    const playRate = agg.drawn > 0 ? agg.played / agg.drawn : 0;
    const winRateWhenPlayed =
      agg.gamesPlayed > 0 ? agg.winsWhenPlayed / agg.gamesPlayed : baselineWinRate;
    return {
      cardId: c.id,
      cardName: c.name,
      deckName: deckMap.get(c.deckId) || 'Deck',
      costSummary: `${c.costAmount} ${c.costStatId.toUpperCase()}`,
      timesDrawn: agg.drawn,
      timesPlayed: agg.played,
      playRateWhenDrawn: playRate,
      gamesWherePlayed: agg.gamesPlayed,
      winsWhenPlayed: agg.winsWhenPlayed,
      winRateWhenPlayed,
      winRateDelta: agg.gamesPlayed > 0 ? winRateWhenPlayed - baselineWinRate : 0,
    };
  });

  const pieceTelemetry: PieceTelemetry[] = config.pieces.map((p) => {
    const agg = pieceAgg.get(p.id)!;
    return {
      archetypeId: p.id,
      pieceName: p.name,
      symbol: p.symbol,
      spawns: agg.spawns,
      kills: agg.kills,
      deaths: agg.deaths,
      kdRatio: agg.deaths > 0 ? agg.kills / agg.deaths : agg.kills,
      survivalRate: agg.spawns > 0 ? Math.max(0, (agg.spawns - agg.deaths) / agg.spawns) : 0,
      goalCaptures: agg.goalCaptures,
      damageDealt: agg.damageDealt,
    };
  });

  const economyCurves: { round: number; stats: Record<string, number> }[] = [];
  for (let r = 0; r < maxRounds; r++) {
    if (economyCountByRound[r] === 0) continue;
    const stats: Record<string, number> = {};
    for (const [k, sumVal] of Object.entries(economySumByRound[r])) {
      stats[k] = Math.round((sumVal / economyCountByRound[r]) * 100) / 100;
    }
    economyCurves.push({ round: r + 1, stats });
  }

  const notableGames: SimulatedGameLog[] = [];
  if (anomalyGameLog) notableGames.push(anomalyGameLog);
  if (fastestWinLog) notableGames.push(fastestWinLog);
  if (sampleTypicalLog) notableGames.push(sampleTypicalLog);
  if (longestGameLog && longestGameLog.gameIndex !== fastestWinLog?.gameIndex) {
    notableGames.push(longestGameLog);
  }

  const { issues, healthScore } = analyzeDiagnosticIssues(
    config,
    totalGames,
    outcomeCounts,
    winRatesBySeat,
    winsByStrategy,
    cardTelemetry,
    pieceTelemetry,
    tileVisits,
    avgRounds,
    minRounds,
    offendingLoopRule
  );

  return {
    id: `sim_${Date.now()}`,
    timestamp: Date.now(),
    configName: config.name,
    totalGames,
    durationMs: Math.round(performance.now() - startTime),
    randomizeStrategies,
    winsBySeat,
    winRatesBySeat,
    winsByStrategy,
    winsByCondition,
    outcomeCounts,
    avgRounds: Math.round(avgRounds * 10) / 10,
    medianRounds,
    minRounds,
    maxRounds: maxObsRounds,
    p90Rounds,
    roundHistogram,
    cardTelemetry,
    pieceTelemetry,
    tileVisits,
    tileDeaths,
    economyCurves,
    issues,
    healthScore,
    notableGames,
  };
}

function analyzeDiagnosticIssues(
  config: GameConfig,
  totalGames: number,
  outcomeCounts: SimulationBatchSummary['outcomeCounts'],
  winRatesBySeat: number[],
  winsByStrategy: SimulationBatchSummary['winsByStrategy'],
  cardTelemetry: CardTelemetry[],
  pieceTelemetry: PieceTelemetry[],
  tileVisits: Record<string, number>,
  avgRounds: number,
  minRounds: number,
  offendingLoopRule?: string
): { issues: DiagnosticIssue[]; healthScore: number } {
  const issues: DiagnosticIssue[] = [];
  let penalty = 0;
  const playerCount = Math.max(1, config.turnConfig.playerCount);
  const expectedWinRate = 1 / playerCount;

  const loopRate = outcomeCounts.infinite_loop / totalGames;
  if (outcomeCounts.infinite_loop > 0) {
    penalty += Math.min(45, Math.round(loopRate * 60) + 20);
    const targetRule =
      config.rules.find((r) => r.name === offendingLoopRule || r.maxTriggersPerTurn === 0) ||
      config.rules[0];

    issues.push({
      id: 'issue_infinite_loop',
      severity: 'critical',
      category: 'infinite_loop',
      title: `Infinite Rule Trigger Loop Detected (${(loopRate * 100).toFixed(1)}% of games)`,
      summary: `Rule "${
        targetRule?.name || 'Uncapped Trigger'
      }" chained recursively past the safety limit (${outcomeCounts.infinite_loop} aborted games).`,
      technicalDetail:
        'When a rule triggers movement or stat changes without a per-turn cap (maxTriggersPerTurn = 0) and lands on another matching tile/condition, the game enters an unrecoverable infinite loop.',
      metricBadge: `${outcomeCounts.infinite_loop} Loop Crashes`,
      fixes: targetRule
        ? [
            {
              id: `fix_cap_rule_${targetRule.id}`,
              label: `Cap "${targetRule.name}" to max 1 trigger per turn`,
              description:
                'Sets maxTriggersPerTurn = 1 on the recursive rule so it cannot chain infinitely.',
              category: 'rule',
              apply: (cfg: GameConfig) => ({
                ...cfg,
                rules: cfg.rules.map((r) =>
                  r.id === targetRule.id
                    ? {
                        ...r,
                        maxTriggersPerTurn: 1,
                        actions: r.actions.map((a) =>
                          a.type === 'move_forward' && a.value === 4 ? { ...a, value: 2 } : a
                        ),
                      }
                    : r
                ),
              }),
            },
            {
              id: `fix_disable_rule_${targetRule.id}`,
              label: `Disable rule "${targetRule.name}"`,
              description: 'Turns off the offending rule trigger completely.',
              category: 'rule',
              apply: (cfg: GameConfig) => ({
                ...cfg,
                rules: cfg.rules.map((r) =>
                  r.id === targetRule.id ? { ...r, enabled: false } : r
                ),
              }),
            },
          ]
        : [],
    });
  }

  for (const ct of cardTelemetry) {
    const cardDef = config.cards.find((c) => c.id === ct.cardId);
    if (!cardDef) continue;
    const costStat = config.playerStats.find((s) => s.id === cardDef.costStatId);

    if (costStat && cardDef.costAmount > costStat.maxValue) {
      penalty += 18;
      issues.push({
        id: `issue_impossible_card_${cardDef.id}`,
        severity: 'critical',
        category: 'dead_card',
        title: `Unplayable Card Hole: "${cardDef.name}" Cost Exceeds Stat Cap`,
        summary: `"${cardDef.name}" costs ${cardDef.costAmount} ${costStat.name}, but ${costStat.name} has a maximum cap of ${costStat.maxValue}. It was drawn ${ct.timesDrawn} times and played 0 times (0%).`,
        technicalDetail: `Players can never accumulate enough ${costStat.name} to play "${cardDef.name}", making every copy drawn a dead card that clogs player hands.`,
        metricBadge: `0% Play Rate (${ct.timesDrawn} Draws)`,
        fixes: [
          {
            id: `fix_lower_card_cost_${cardDef.id}`,
            label: `Lower "${cardDef.name}" cost to ${Math.max(1, costStat.maxValue - 2)} ${costStat.name}`,
            description: `Reduces the card cost from ${cardDef.costAmount} to ${Math.max(
              1,
              costStat.maxValue - 2
            )} so it fits within ${costStat.name}'s cap (${costStat.maxValue}).`,
            category: 'card',
            apply: (cfg: GameConfig) => ({
              ...cfg,
              cards: cfg.cards.map((c) =>
                c.id === cardDef.id
                  ? { ...c, costAmount: Math.max(1, costStat.maxValue - 2) }
                  : c
              ),
            }),
          },
          {
            id: `fix_raise_stat_cap_${costStat.id}`,
            label: `Raise "${costStat.name}" Max Cap to ${cardDef.costAmount + 2}`,
            description: `Increases ${costStat.name} maxValue from ${costStat.maxValue} to ${
              cardDef.costAmount + 2
            }.`,
            category: 'turn',
            apply: (cfg: GameConfig) => ({
              ...cfg,
              playerStats: cfg.playerStats.map((s) =>
                s.id === costStat.id ? { ...s, maxValue: cardDef.costAmount + 2 } : s
              ),
            }),
          },
        ],
      });
    } else if (ct.timesDrawn >= 30 && ct.playRateWhenDrawn < 0.05) {
      penalty += 8;
      issues.push({
        id: `issue_dead_card_${cardDef.id}`,
        severity: 'warning',
        category: 'dead_card',
        title: `Dead / Underplayed Card: "${cardDef.name}" (${(
          ct.playRateWhenDrawn * 100
        ).toFixed(1)}% Play Rate)`,
        summary: `Drawn ${ct.timesDrawn} times but only played ${ct.timesPlayed} times. Its cost (${ct.costSummary}) or condition is too restrictive.`,
        technicalDetail:
          'Cards with <5% play-to-draw conversion reduce hand turnover and stall player agency.',
        metricBadge: `${(ct.playRateWhenDrawn * 100).toFixed(1)}% Played`,
        fixes: [
          {
            id: `fix_reduce_dead_cost_${cardDef.id}`,
            label: `Reduce "${cardDef.name}" cost by 1`,
            description: 'Makes the card easier to cast during normal turns.',
            category: 'card',
            apply: (cfg: GameConfig) => ({
              ...cfg,
              cards: cfg.cards.map((c) =>
                c.id === cardDef.id ? { ...c, costAmount: Math.max(1, c.costAmount - 1) } : c
              ),
            }),
          },
        ],
      });
    }
  }

  for (const ct of cardTelemetry) {
    if (ct.gamesWherePlayed >= Math.max(15, totalGames * 0.05) && ct.winRateDelta > 0.14) {
      const cardDef = config.cards.find((c) => c.id === ct.cardId);
      if (!cardDef) continue;
      const isSevere = ct.winRateDelta > 0.22;
      penalty += isSevere ? 16 : 10;

      issues.push({
        id: `issue_op_card_${cardDef.id}`,
        severity: isSevere ? 'critical' : 'warning',
        category: 'overpowered_card',
        title: `Overpowered Card Detected: "${cardDef.name}" (+${(
          ct.winRateDelta * 100
        ).toFixed(1)}% Win Rate Lift)`,
        summary: `Players who play "${cardDef.name}" win ${(
          ct.winRateWhenPlayed * 100
        ).toFixed(1)}% of their games (expected baseline: ${(expectedWinRate * 100).toFixed(
          1
        )}%).`,
        technicalDetail: `Cost-to-impact ratio for "${cardDef.name}" (${ct.costSummary}) warps game outcomes around drawing this card early.`,
        metricBadge: `${(ct.winRateWhenPlayed * 100).toFixed(1)}% Win Rate`,
        fixes: [
          {
            id: `fix_nerf_card_${cardDef.id}`,
            label: `Increase "${cardDef.name}" cost (+2) & tone down effect magnitude`,
            description: `Raises ${cardDef.name} cost from ${cardDef.costAmount} to ${
              cardDef.costAmount + 2
            } and scales extreme stat swings by ~35%.`,
            category: 'card',
            apply: (cfg: GameConfig) => ({
              ...cfg,
              cards: cfg.cards.map((c) =>
                c.id === cardDef.id
                  ? {
                      ...c,
                      costAmount: c.costAmount + 2,
                      effects: c.effects.map((e) => ({
                        ...e,
                        value:
                          Math.abs(e.value) >= 3
                            ? Math.sign(e.value) * Math.max(1, Math.round(Math.abs(e.value) * 0.65))
                            : e.value,
                      })),
                    }
                  : c
              ),
            }),
          },
        ],
      });
    }
  }

  const stalemateRate =
    (outcomeCounts.stalemate_timeout + outcomeCounts.deadlock_no_moves) / totalGames;
  if (stalemateRate > 0.12) {
    const isCritical = stalemateRate > 0.35;
    penalty += isCritical ? 25 : 12;
    issues.push({
      id: 'issue_stalemate_rate',
      severity: isCritical ? 'critical' : 'warning',
      category: 'stalemate',
      title: `High Stalemate / Timeout Rate (${(stalemateRate * 100).toFixed(1)}% of games)`,
      summary: `${
        outcomeCounts.stalemate_timeout + outcomeCounts.deadlock_no_moves
      } out of ${totalGames} games reached Round ${
        config.turnConfig.maxTurns
      } or deadlocked without a winner.`,
      technicalDetail:
        'Victory thresholds may be too high relative to turn limit, or the game lacks a max-turn tiebreaker rule.',
      metricBadge: `${(stalemateRate * 100).toFixed(1)}% Stalemates`,
      fixes: [
        {
          id: 'fix_add_tiebreaker_or_lower_vp',
          label: 'Lower primary Victory Point threshold by 20% & enable Max-Turn Tiebreaker',
          description:
            'Reduces stat_threshold win targets slightly and ensures highest_stat_at_max_turns is enabled.',
          category: 'win_condition',
          apply: (cfg: GameConfig) => {
            const hasTiebreaker = cfg.winConditions.some(
              (w) => w.type === 'highest_stat_at_max_turns' && w.enabled
            );
            const updatedWcs: WinCondition[] = cfg.winConditions.map((w) =>
              w.type === 'stat_threshold' && !w.isLossCondition && (w.targetValue ?? 0) > 5
                ? { ...w, targetValue: Math.max(5, Math.round((w.targetValue ?? 12) * 0.8)) }
                : w
            );
            if (!hasTiebreaker) {
              updatedWcs.push({
                id: `wc_tiebreaker_${Date.now()}`,
                name: 'Max-Turn VP Tiebreaker',
                enabled: true,
                type: 'highest_stat_at_max_turns',
                statId: 'vp',
                isLossCondition: false,
                description: 'Player with the highest VP at Max Turns wins.',
              });
            }
            return { ...cfg, winConditions: updatedWcs };
          },
        },
      ],
    });
  }

  if (playerCount >= 2 && outcomeCounts.win > totalGames * 0.3) {
    const p1WinRate = winRatesBySeat[0] || 0;
    const seatBias = p1WinRate - expectedWinRate;
    if (seatBias > 0.09 && !config.turnConfig.firstPlayerAdvantageMitigation) {
      penalty += 12;
      issues.push({
        id: 'issue_first_player_bias',
        severity: seatBias > 0.16 ? 'critical' : 'warning',
        category: 'first_player_bias',
        title: `First-Player Tempo Advantage (Player 1 Wins ${(p1WinRate * 100).toFixed(1)}%)`,
        summary: `Seat 1 wins +${(seatBias * 100).toFixed(
          1
        )}% more often than fair baseline (${(expectedWinRate * 100).toFixed(1)}%).`,
        technicalDetail:
          'Acting first grants uncontested objective capture and first combat strike unless subsequent players receive catch-up resources.',
        metricBadge: `P1: ${(p1WinRate * 100).toFixed(1)}% vs Fair ${(
          expectedWinRate * 100
        ).toFixed(1)}%`,
        fixes: [
          {
            id: 'fix_enable_fp_mitigation',
            label: 'Enable First-Player Advantage Mitigation (+1 Bonus Starting Resource for P2+)',
            description:
              'Grants players going 2nd or later +1 starting Mana/Gold on Turn 1 to balance tempo.',
            category: 'turn',
            apply: (cfg: GameConfig) => ({
              ...cfg,
              turnConfig: {
                ...cfg.turnConfig,
                firstPlayerAdvantageMitigation: true,
              },
            }),
          },
        ],
      });
    }
  }

  const passableTiles = config.board.tiles.filter((t) => t.type !== 'obstacle');
  const unvisitedTiles = passableTiles.filter((t) => (tileVisits[t.id] || 0) === 0);
  if (unvisitedTiles.length > passableTiles.length * 0.35 && passableTiles.length > 4) {
    penalty += 6;
    issues.push({
      id: 'issue_unreachable_tiles',
      severity: 'info',
      category: 'unreachable_board',
      title: `Underutilized Board Space (${unvisitedTiles.length}/${passableTiles.length} Tiles Never Visited)`,
      summary: `${unvisitedTiles.length} passable tiles had 0 visits across ${totalGames} games.`,
      technicalDetail:
        'Units are funneling along a single shortest corridor or lack movement range / incentives to explore side tiles.',
      metricBadge: `${unvisitedTiles.length} Cold Tiles`,
      fixes: [
        {
          id: 'fix_increase_unit_mobility',
          label: 'Increase Unit Move Range (+1) to open board mobility',
          description: 'Adds +1 moveRange to mobile piece archetypes.',
          category: 'piece',
          apply: (cfg: GameConfig) => ({
            ...cfg,
            pieces: cfg.pieces.map((p) =>
              p.movementType !== 'stationary' ? { ...p, moveRange: p.moveRange + 1 } : p
            ),
          }),
        },
      ],
    });
  }

  if (minRounds <= 2 && outcomeCounts.win > 0 && avgRounds < 4.5) {
    penalty += 14;
    issues.push({
      id: 'issue_degenerate_rush',
      severity: 'warning',
      category: 'dominant_strategy',
      title: `Degenerate Early-Turn Rush (Games Ending in ${minRounds} Rounds)`,
      summary: `Average game length is only ${avgRounds.toFixed(
        1
      )} rounds, with fastest wins occurring on Round ${minRounds}.`,
      technicalDetail:
        'Players are achieving victory conditions before strategic mid-game decisions can unfold.',
      metricBadge: `Min ${minRounds} Rounds`,
      fixes: [
        {
          id: 'fix_scale_win_threshold',
          label: 'Increase Victory Point / Stat Thresholds by +4',
          description: 'Extends game pacing into a healthier mid-game.',
          category: 'win_condition',
          apply: (cfg: GameConfig) => ({
            ...cfg,
            winConditions: cfg.winConditions.map((w) =>
              w.type === 'stat_threshold' && !w.isLossCondition
                ? { ...w, targetValue: (w.targetValue ?? 10) + 4 }
                : w
            ),
          }),
        },
      ],
    });
  }

  const healthScore = Math.max(5, Math.min(100, 100 - penalty));
  return { issues, healthScore };
}
