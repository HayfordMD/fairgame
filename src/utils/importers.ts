import {
  BoardTile,
  CardDefinition,
  ComparisonOperator,
  GameConfig,
  PieceArchetype,
  RuleAction,
  RuleTrigger,
  RuleTriggerEvent,
  StatDefinition,
  TileType,
  WinCondition,
} from '../types/game';

/**
 * Parses a CSV string into an array of key-value record objects.
 */
export function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = (cols[idx] ?? '').trim();
    });
    rows.push(record);
  }
  return rows;
}

function splitCSVLine(line: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      res.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  res.push(cur);
  return res;
}

/**
 * Converts CSV rows into CardDefinition objects.
 * Supported columns: name, copies, cost_stat, cost_amount, target, effect_type, effect_stat, effect_value, formula, condition, description
 */
export function importCardsFromCSV(
  csvText: string,
  defaultDeckId: string
): CardDefinition[] {
  const rows = parseCSV(csvText);
  return rows.map((r, idx) => {
    const effectType = (r.effect_type || 'modify_player_stat') as CardDefinition['effects'][0]['type'];
    const effectStat = r.effect_stat || 'vp';
    const effectVal = parseFloat(r.effect_value || '2') || 2;

    return {
      id: `card_csv_${Date.now()}_${idx}`,
      deckId: r.deck_id || defaultDeckId,
      name: r.name || `Imported Card ${idx + 1}`,
      copies: parseInt(r.copies || '3', 10) || 3,
      costStatId: r.cost_stat || 'mana',
      costAmount: parseFloat(r.cost_amount || '2') || 0,
      targetType: (r.target as CardDefinition['targetType']) || 'self',
      conditionExpr: r.condition || undefined,
      formulaExpr: r.formula || undefined,
      effects: [
        {
          id: `eff_csv_${idx}`,
          type: effectType,
          statId: effectStat,
          value: effectVal,
        },
      ],
      description: r.description || `Imported from CSV (${effectType} ${effectVal})`,
      tags: r.tags ? r.tags.split('|').map((t) => t.trim()) : ['Imported'],
    };
  });
}

/**
 * Converts CSV rows into PieceArchetype objects.
 * Supported columns: name, symbol, count, hp, attack, defense, move_range, attack_range, ap_cost, movement_type, respawn_turns
 */
export function importPiecesFromCSV(csvText: string): PieceArchetype[] {
  const rows = parseCSV(csvText);
  return rows.map((r, idx) => ({
    id: `piece_csv_${Date.now()}_${idx}`,
    name: r.name || `Unit ${idx + 1}`,
    symbol: r.symbol || '♟️',
    color: r.color || '#6366f1',
    ownerType: 'all_players',
    spawnCountPerPlayer: parseInt(r.count || '1', 10) || 1,
    maxHp: parseFloat(r.hp || '10') || 10,
    attack: parseFloat(r.attack || '3') || 3,
    defense: parseFloat(r.defense || '1') || 1,
    moveRange: parseInt(r.move_range || '2', 10) || 2,
    attackRange: parseInt(r.attack_range || '1', 10) || 1,
    apCost: parseInt(r.ap_cost || '1', 10) || 1,
    movementType: (r.movement_type as PieceArchetype['movementType']) || 'orthogonal',
    canCaptureGoal: r.can_capture !== 'false',
    respawnOnDeath: r.respawn !== 'false',
    respawnDelayTurns: parseInt(r.respawn_turns || '2', 10) || 2,
    onAttackEffects: [],
    onKillEffects: [
      {
        id: `kill_csv_${idx}`,
        target: 'player',
        statId: 'vp',
        operation: 'add',
        value: 1,
      },
    ],
    description: r.description || 'Imported piece configuration.',
  }));
}

/**
 * Converts CSV rows into StatDefinition objects.
 * Supported columns: id, name, initial, min, max, regen, color, description
 */
export function importStatsFromCSV(csvText: string): StatDefinition[] {
  const rows = parseCSV(csvText);
  return rows.map((r, idx) => ({
    id: (r.id || r.name || `stat_${idx}`).toLowerCase().replace(/[^a-z0-9_]/g, '_'),
    name: r.name || `Stat ${idx + 1}`,
    icon: r.icon || 'Sparkles',
    color: r.color || '#3b82f6',
    initialValue: parseFloat(r.initial || '5') || 0,
    minValue: parseFloat(r.min || '0') || 0,
    maxValue: parseFloat(r.max || '20') || 20,
    regenPerTurn: parseFloat(r.regen || '0') || 0,
    description: r.description || 'Imported player stat.',
  }));
}

/**
 * Parses a structured or natural-language rule DSL script into RuleTriggers and WinConditions.
 * Examples supported:
 *   WHEN ON_LAND_TILE IF tile.type == "boost" THEN player.vp += 2
 *   WHEN ON_TURN_START IF player.gold >= 10 THEN player.vp += 1
 *   WHEN ON_COMBAT THEN player.gold += 2
 *   WIN WHEN player.vp >= 15
 *   LOSE WHEN player.hp <= 0
 */
export function parseRulesScript(scriptText: string): {
  rules: RuleTrigger[];
  winConditions: WinCondition[];
} {
  const lines = scriptText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  const rules: RuleTrigger[] = [];
  const winConditions: WinCondition[] = [];

  lines.forEach((line, idx) => {
    // Check WIN / LOSE WHEN
    const winMatch = line.match(
      /^(WIN|LOSE)\s+WHEN\s+(?:player\.)?([a-zA-Z0-9_]+)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)/i
    );
    if (winMatch) {
      const isLoss = winMatch[1].toUpperCase() === 'LOSE';
      const statId = winMatch[2].toLowerCase();
      const op = winMatch[3] as ComparisonOperator;
      const val = parseFloat(winMatch[4]);
      winConditions.push({
        id: `wc_script_${Date.now()}_${idx}`,
        name: `${isLoss ? 'Eliminated' : 'Victory'}: ${statId.toUpperCase()} ${op} ${val}`,
        enabled: true,
        type: 'stat_threshold',
        statId,
        operator: op,
        targetValue: val,
        isLossCondition: isLoss,
        description: `Parsed from script: ${line}`,
      });
      return;
    }

    // Check WHEN <EVENT> [IF <COND>] THEN <ACTION>
    const ruleMatch = line.match(
      /^WHEN\s+([A-Z_]+)(?:\s+IF\s+(.+?))?\s+THEN\s+(.+)$/i
    );
    if (ruleMatch) {
      const rawEvent = ruleMatch[1].toUpperCase() as RuleTriggerEvent;
      const condPart = ruleMatch[2]?.trim();
      const actionPart = ruleMatch[3].trim();

      let conditionType: RuleTrigger['conditionType'] = 'always';
      let conditionTileType: TileType | undefined = undefined;
      let conditionStatId: string | undefined = undefined;
      let conditionOperator: ComparisonOperator | undefined = undefined;
      let conditionValue: number | undefined = undefined;
      let customConditionExpr: string | undefined = undefined;

      if (condPart) {
        const tileM = condPart.match(/tile\.type\s*==\s*['"]?([a-z_]+)['"]?/i);
        const statM = condPart.match(
          /(?:player\.)?([a-zA-Z0-9_]+)\s*(>=|<=|==|>|<)\s*(-?\d+(?:\.\d+)?)/
        );
        if (tileM) {
          conditionType = 'tile_type';
          conditionTileType = tileM[1].toLowerCase() as TileType;
        } else if (statM) {
          conditionType = 'stat_compare';
          conditionStatId = statM[1].toLowerCase();
          conditionOperator = statM[2] as ComparisonOperator;
          conditionValue = parseFloat(statM[3]);
        } else {
          conditionType = 'custom_expr';
          customConditionExpr = condPart;
        }
      }

      const actions: RuleAction[] = [];
      const moveM = actionPart.match(/move\s*\+?\s*(\d+)/i);
      const drawM = actionPart.match(/draw\s*\+?\s*(\d+)/i);
      if (moveM) {
        actions.push({
          id: `act_${idx}_m`,
          type: 'move_forward',
          value: parseInt(moveM[1], 10) || 1,
        });
      } else if (drawM) {
        actions.push({
          id: `act_${idx}_d`,
          type: 'draw_card',
          value: parseInt(drawM[1], 10) || 1,
        });
      } else {
        actions.push({
          id: `act_${idx}_f`,
          type: 'custom_formula',
          value: 0,
          formula: actionPart,
        });
      }

      rules.push({
        id: `rule_script_${Date.now()}_${idx}`,
        name: `Script Rule #${idx + 1} (${rawEvent})`,
        enabled: true,
        trigger: rawEvent,
        conditionType,
        conditionTileType,
        conditionStatId,
        conditionOperator,
        conditionValue,
        customConditionExpr,
        actions,
        maxTriggersPerTurn: 2,
        description: line,
      });
    }
  });

  return { rules, winConditions };
}

/**
 * Validates and normalizes an uploaded JSON GameConfig object.
 */
export function validateAndNormalizeGameJSON(
  raw: unknown,
  fallbackConfig: GameConfig
): GameConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Uploaded file is not a valid JSON object.');
  }
  const obj = raw as Partial<GameConfig>;
  return {
    id: obj.id || `custom_${Date.now()}`,
    name: obj.name || 'Imported Custom Game',
    version: obj.version || '1.0.0',
    genre: obj.genre || 'Custom Tabletop Game',
    description: obj.description || 'Imported via JSON Game Architect.',
    author: obj.author || 'Game Designer',
    board:
      obj.board && Array.isArray(obj.board.tiles) && obj.board.tiles.length > 0
        ? (obj.board as GameConfig['board'])
        : fallbackConfig.board,
    playerStats:
      Array.isArray(obj.playerStats) && obj.playerStats.length > 0
        ? obj.playerStats
        : fallbackConfig.playerStats,
    globalVars: Array.isArray(obj.globalVars) ? obj.globalVars : fallbackConfig.globalVars,
    pieces:
      Array.isArray(obj.pieces) && obj.pieces.length > 0
        ? obj.pieces
        : fallbackConfig.pieces,
    decks:
      Array.isArray(obj.decks) && obj.decks.length > 0 ? obj.decks : fallbackConfig.decks,
    cards: Array.isArray(obj.cards) ? obj.cards : fallbackConfig.cards,
    turnConfig: obj.turnConfig
      ? { ...fallbackConfig.turnConfig, ...obj.turnConfig }
      : fallbackConfig.turnConfig,
    winConditions:
      Array.isArray(obj.winConditions) && obj.winConditions.length > 0
        ? obj.winConditions
        : fallbackConfig.winConditions,
    rules: Array.isArray(obj.rules) ? obj.rules : fallbackConfig.rules,
  };
}

/**
 * Parses ASCII/CSV Grid Map into BoardTile[] for rapid board plan upload.
 * Symbols: . = normal, S = spawn, G = goal, # = obstacle, X = hazard, + = boost, $ = shop
 */
export function parseBoardMatrixText(matrixText: string): BoardTile[] {
  const rows = matrixText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (rows.length === 0) return [];

  const gridTokens = rows.map((r) =>
    r.includes(',') ? r.split(',').map((c) => c.trim()) : r.split(/\s+/)
  );
  const height = gridTokens.length;
  const width = Math.max(...gridTokens.map((r) => r.length));
  const tiles: BoardTile[] = [];
  let spawnCounter = 0;

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const sym = (gridTokens[r][c] || '.').toUpperCase();
      let type: TileType = 'normal';
      let spawnPlayerIndex: number | undefined = undefined;
      let label = `${String.fromCharCode(65 + r)}${c + 1}`;
      const onEnterEffects: BoardTile['onEnterEffects'] = [];
      const onTurnEndEffects: BoardTile['onTurnEndEffects'] = [];

      if (sym === 'S' || sym === 'P1' || sym === 'P2') {
        type = 'spawn';
        spawnPlayerIndex = sym === 'P1' ? 0 : sym === 'P2' ? 1 : spawnCounter++ % 2;
        label = `Spawn P${spawnPlayerIndex + 1}`;
      } else if (sym === 'G') {
        type = 'goal';
        label = 'Objective';
        onTurnEndEffects.push({
          id: `eff_g_${r}_${c}`,
          target: 'player',
          statId: 'vp',
          operation: 'add',
          value: 2,
        });
      } else if (sym === '#' || sym === 'O') {
        type = 'obstacle';
        label = 'Wall';
      } else if (sym === 'X' || sym === 'H') {
        type = 'hazard';
        label = 'Hazard';
        onEnterEffects.push({
          id: `eff_h_${r}_${c}`,
          target: 'piece',
          statId: 'hp',
          operation: 'subtract',
          value: 3,
        });
      } else if (sym === '+' || sym === 'B') {
        type = 'boost';
        label = 'Boost';
        onEnterEffects.push({
          id: `eff_b_${r}_${c}`,
          target: 'player',
          statId: 'mana',
          operation: 'add',
          value: 2,
        });
      } else if (sym === '$' || sym === 'M') {
        type = 'shop';
        label = 'Market';
        onEnterEffects.push({
          id: `eff_s_${r}_${c}`,
          target: 'player',
          statId: 'gold',
          operation: 'add',
          value: 2,
        });
      }

      const connections: string[] = [];
      const dirs = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
          connections.push(`tile_${nr}_${nc}`);
        }
      }

      tiles.push({
        id: `tile_${r}_${c}`,
        label,
        x: c,
        y: r,
        row: r,
        col: c,
        type,
        spawnPlayerIndex,
        moveCost: 1,
        connections,
        onEnterEffects,
        onTurnEndEffects,
      });
    }
  }
  return tiles;
}
