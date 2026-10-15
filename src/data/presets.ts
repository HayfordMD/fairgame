import {
  BoardConfig,
  BoardTile,
  GameConfig,
  TileType,
} from '../types/game';

export function generateSquareGrid(width: number, height: number): BoardConfig {
  const tiles: BoardTile[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const id = `tile_${r}_${c}`;
      let type: TileType = 'normal';
      let spawnPlayerIndex: number | undefined = undefined;
      let label = `${String.fromCharCode(65 + r)}${c + 1}`;
      const onEnterEffects: BoardTile['onEnterEffects'] = [];
      const onTurnEndEffects: BoardTile['onTurnEndEffects'] = [];

      if (r === 0 && (c === Math.floor(width / 2) - 1 || c === Math.floor(width / 2))) {
        type = 'spawn';
        spawnPlayerIndex = 0;
        label = 'P1 Spawn';
      } else if (
        r === height - 1 &&
        (c === Math.floor(width / 2) - 1 || c === Math.floor(width / 2))
      ) {
        type = 'spawn';
        spawnPlayerIndex = 1;
        label = 'P2 Spawn';
      } else if (r === Math.floor(height / 2) && c === Math.floor(width / 2)) {
        type = 'goal';
        label = 'Citadel';
        onTurnEndEffects.push({
          id: `eff_goal_${r}_${c}`,
          target: 'player',
          statId: 'vp',
          operation: 'add',
          value: 2,
        });
      } else if (
        (r === Math.floor(height / 2) && c === 1) ||
        (r === Math.floor(height / 2) && c === width - 2)
      ) {
        type = 'boost';
        label = 'Shrine';
        onEnterEffects.push({
          id: `eff_shrine_${r}_${c}`,
          target: 'player',
          statId: 'mana',
          operation: 'add',
          value: 2,
        });
        onTurnEndEffects.push({
          id: `eff_heal_${r}_${c}`,
          target: 'piece',
          statId: 'hp',
          operation: 'add',
          value: 2,
        });
      } else if (
        (r === Math.floor(height / 2) - 1 && c === Math.floor(width / 2) - 2) ||
        (r === Math.floor(height / 2) + 1 && c === Math.floor(width / 2) + 2)
      ) {
        type = 'obstacle';
        label = 'Pillar';
      } else if (
        (r === Math.floor(height / 2) - 1 && c === Math.floor(width / 2) + 1) ||
        (r === Math.floor(height / 2) + 1 && c === Math.floor(width / 2) - 1)
      ) {
        type = 'hazard';
        label = 'Lava';
        onEnterEffects.push({
          id: `eff_lava_${r}_${c}`,
          target: 'piece',
          statId: 'hp',
          operation: 'subtract',
          value: 3,
        });
      }

      tiles.push({
        id,
        label,
        x: c,
        y: r,
        row: r,
        col: c,
        type,
        spawnPlayerIndex,
        moveCost: 1,
        connections: [],
        onEnterEffects,
        onTurnEndEffects,
      });
    }
  }

  // Compute orthogonal adjacency connections
  for (const t of tiles) {
    const r = t.row!;
    const c = t.col!;
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
        t.connections.push(`tile_${nr}_${nc}`);
      }
    }
  }

  return {
    topology: 'square_grid',
    width,
    height,
    loopTrack: false,
    backgroundOpacity: 0.35,
    tiles,
  };
}

export function generateHexGrid(width: number, height: number): BoardConfig {
  const base = generateSquareGrid(width, height);
  base.topology = 'hex_grid';
  // Recompute 6-neighbor axial/offset hex connections
  for (const t of base.tiles) {
    t.connections = [];
    const r = t.row!;
    const c = t.col!;
    const isOddRow = r % 2 === 1;
    const dirs = isOddRow
      ? [
          [0, -1],
          [0, 1],
          [-1, 0],
          [-1, 1],
          [1, 0],
          [1, 1],
        ]
      : [
          [0, -1],
          [0, 1],
          [-1, -1],
          [-1, 0],
          [1, -1],
          [1, 0],
        ];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
        t.connections.push(`tile_${nr}_${nc}`);
      }
    }
  }
  return base;
}

export function generateTrackBoard(length = 20, loopTrack = false): BoardConfig {
  const tiles: BoardTile[] = [];
  // Arrange tiles around a stadium/oval perimeter in 0..1000 space
  const cx = 500;
  const cy = 500;
  const rx = 390;
  const ry = 320;

  for (let i = 0; i < length; i++) {
    const angle = (i / length) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round(cx + Math.cos(angle) * rx);
    const y = Math.round(cy + Math.sin(angle) * ry);
    const id = `track_${i}`;
    let type: TileType = 'normal';
    let label = `Space ${i + 1}`;
    const onEnterEffects: BoardTile['onEnterEffects'] = [];
    const onTurnEndEffects: BoardTile['onTurnEndEffects'] = [];

    if (i === 0) {
      type = 'spawn';
      label = 'START';
    } else if (i === length - 1 && !loopTrack) {
      type = 'goal';
      label = 'FINISH';
      onEnterEffects.push({
        id: `eff_finish_${i}`,
        target: 'player',
        statId: 'vp',
        operation: 'add',
        value: 10,
      });
    } else if (i % 5 === 0) {
      type = 'checkpoint';
      label = `Gate ${i / 5}`;
      onEnterEffects.push({
        id: `eff_gate_${i}`,
        target: 'player',
        statId: 'vp',
        operation: 'add',
        value: 2,
      });
      onEnterEffects.push({
        id: `eff_gate_gold_${i}`,
        target: 'player',
        statId: 'gold',
        operation: 'add',
        value: 3,
      });
    } else if (i % 4 === 2) {
      type = 'boost';
      label = `Boost ${i + 1}`;
      onEnterEffects.push({
        id: `eff_boost_${i}`,
        target: 'player',
        statId: 'gold',
        operation: 'add',
        value: 2,
      });
    } else if (i % 6 === 3) {
      type = 'hazard';
      label = `Trap ${i + 1}`;
      onEnterEffects.push({
        id: `eff_trap_${i}`,
        target: 'player',
        statId: 'hp',
        operation: 'subtract',
        value: 3,
      });
    } else if (i % 7 === 4) {
      type = 'shop';
      label = `Market ${i + 1}`;
      onEnterEffects.push({
        id: `eff_shop_${i}`,
        target: 'player',
        statId: 'mana',
        operation: 'add',
        value: 2,
      });
    }

    const nextConnections: string[] = [];
    if (i < length - 1) {
      nextConnections.push(`track_${i + 1}`);
    } else if (loopTrack) {
      nextConnections.push('track_0');
    }

    tiles.push({
      id,
      label,
      x,
      y,
      row: 0,
      col: i,
      type,
      moveCost: 1,
      connections: nextConnections,
      onEnterEffects,
      onTurnEndEffects,
    });
  }

  return {
    topology: 'track',
    width: length,
    height: 1,
    loopTrack,
    backgroundOpacity: 0.35,
    tiles,
  };
}

export function generateGraphBoard(): BoardConfig {
  const nodes: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
    type: TileType;
    spawnPlayerIndex?: number;
    connections: string[];
    onEnterEffects: BoardTile['onEnterEffects'];
    onTurnEndEffects: BoardTile['onTurnEndEffects'];
  }> = [
    {
      id: 'node_p1_cap',
      label: 'North Keep (P1)',
      x: 160,
      y: 220,
      type: 'spawn',
      spawnPlayerIndex: 0,
      connections: ['node_mine_nw', 'node_plains_n', 'node_watchtower_w'],
      onEnterEffects: [],
      onTurnEndEffects: [
        { id: 'e1', target: 'player', statId: 'gold', operation: 'add', value: 2 },
      ],
    },
    {
      id: 'node_p2_cap',
      label: 'South Bastion (P2)',
      x: 840,
      y: 780,
      type: 'spawn',
      spawnPlayerIndex: 1,
      connections: ['node_mine_se', 'node_plains_s', 'node_watchtower_e'],
      onEnterEffects: [],
      onTurnEndEffects: [
        { id: 'e2', target: 'player', statId: 'gold', operation: 'add', value: 2 },
      ],
    },
    {
      id: 'node_p3_cap',
      label: 'East Haven (P3)',
      x: 840,
      y: 220,
      type: 'spawn',
      spawnPlayerIndex: 2,
      connections: ['node_plains_n', 'node_watchtower_e', 'node_shrine_ne'],
      onEnterEffects: [],
      onTurnEndEffects: [
        { id: 'e3', target: 'player', statId: 'gold', operation: 'add', value: 2 },
      ],
    },
    {
      id: 'node_p4_cap',
      label: 'West Stronghold (P4)',
      x: 160,
      y: 780,
      type: 'spawn',
      spawnPlayerIndex: 3,
      connections: ['node_watchtower_w', 'node_plains_s', 'node_shrine_sw'],
      onEnterEffects: [],
      onTurnEndEffects: [
        { id: 'e4', target: 'player', statId: 'gold', operation: 'add', value: 2 },
      ],
    },
    {
      id: 'node_mine_nw',
      label: 'Iron Hills',
      x: 330,
      y: 160,
      type: 'boost',
      connections: ['node_p1_cap', 'node_plains_n', 'node_throne'],
      onEnterEffects: [
        { id: 'e5', target: 'player', statId: 'gold', operation: 'add', value: 3 },
      ],
      onTurnEndEffects: [
        { id: 'e6', target: 'player', statId: 'vp', operation: 'add', value: 1 },
      ],
    },
    {
      id: 'node_plains_n',
      label: 'Sunmeadow',
      x: 520,
      y: 230,
      type: 'normal',
      connections: ['node_p1_cap', 'node_mine_nw', 'node_p3_cap', 'node_throne'],
      onEnterEffects: [],
      onTurnEndEffects: [],
    },
    {
      id: 'node_shrine_ne',
      label: 'Crystal Spire',
      x: 700,
      y: 360,
      type: 'shop',
      connections: ['node_p3_cap', 'node_throne', 'node_watchtower_e'],
      onEnterEffects: [
        { id: 'e7', target: 'player', statId: 'mana', operation: 'add', value: 3 },
      ],
      onTurnEndEffects: [
        { id: 'e8', target: 'player', statId: 'vp', operation: 'add', value: 1 },
      ],
    },
    {
      id: 'node_watchtower_w',
      label: 'Dusk Valley',
      x: 240,
      y: 500,
      type: 'hazard',
      connections: ['node_p1_cap', 'node_p4_cap', 'node_throne', 'node_shrine_sw'],
      onEnterEffects: [
        { id: 'e9', target: 'piece', statId: 'hp', operation: 'subtract', value: 2 },
      ],
      onTurnEndEffects: [],
    },
    {
      id: 'node_throne',
      label: 'Imperial Throne',
      x: 500,
      y: 500,
      type: 'goal',
      connections: [
        'node_mine_nw',
        'node_plains_n',
        'node_shrine_ne',
        'node_watchtower_w',
        'node_watchtower_e',
        'node_shrine_sw',
        'node_plains_s',
        'node_mine_se',
      ],
      onEnterEffects: [
        { id: 'e10', target: 'player', statId: 'vp', operation: 'add', value: 2 },
      ],
      onTurnEndEffects: [
        { id: 'e11', target: 'player', statId: 'vp', operation: 'add', value: 3 },
      ],
    },
    {
      id: 'node_watchtower_e',
      label: 'Storm Ridge',
      x: 760,
      y: 500,
      type: 'hazard',
      connections: ['node_p2_cap', 'node_p3_cap', 'node_shrine_ne', 'node_throne'],
      onEnterEffects: [
        { id: 'e12', target: 'piece', statId: 'hp', operation: 'subtract', value: 2 },
      ],
      onTurnEndEffects: [],
    },
    {
      id: 'node_shrine_sw',
      label: 'Runeforge',
      x: 300,
      y: 640,
      type: 'shop',
      connections: ['node_p4_cap', 'node_watchtower_w', 'node_throne'],
      onEnterEffects: [
        { id: 'e13', target: 'player', statId: 'mana', operation: 'add', value: 3 },
      ],
      onTurnEndEffects: [
        { id: 'e14', target: 'player', statId: 'vp', operation: 'add', value: 1 },
      ],
    },
    {
      id: 'node_plains_s',
      label: 'Ashfield',
      x: 480,
      y: 770,
      type: 'normal',
      connections: ['node_p4_cap', 'node_p2_cap', 'node_throne', 'node_mine_se'],
      onEnterEffects: [],
      onTurnEndEffects: [],
    },
    {
      id: 'node_mine_se',
      label: 'Goldheart Peak',
      x: 670,
      y: 840,
      type: 'boost',
      connections: ['node_p2_cap', 'node_plains_s', 'node_throne'],
      onEnterEffects: [
        { id: 'e15', target: 'player', statId: 'gold', operation: 'add', value: 3 },
      ],
      onTurnEndEffects: [
        { id: 'e16', target: 'player', statId: 'vp', operation: 'add', value: 1 },
      ],
    },
  ];

  return {
    topology: 'graph',
    width: 1000,
    height: 1000,
    loopTrack: false,
    backgroundOpacity: 0.35,
    tiles: nodes.map((n, idx) => ({
      ...n,
      row: idx,
      col: idx,
      moveCost: 1,
    })),
  };
}

export const PRESET_GAMES: GameConfig[] = [
  // 1. TACTICAL GRID GAME (Square/Hex)
  {
    id: 'preset_crown_citadel',
    name: 'Crown & Citadel (Tactical Grid)',
    version: '1.2.0',
    genre: 'Tactical Grid Skirmish & Card Battler',
    description:
      'Asymmetric tactical board game on a 7x7 grid. Players deploy Knights and Rangers, cast spell cards using Mana, and battle to hold the central Citadel or reach 12 Victory Points. Contains hidden balance issues (an overpowered spell, an unplayable card cost, and first-player tempo) ready to be diagnosed by simulation.',
    author: 'FairGame Studio',
    board: generateSquareGrid(7, 7),
    playerStats: [
      {
        id: 'hp',
        name: 'Commander HP',
        icon: 'Heart',
        color: '#ef4444',
        initialValue: 20,
        minValue: 0,
        maxValue: 30,
        regenPerTurn: 0,
        description: 'If Commander HP drops to 0, the player is eliminated.',
      },
      {
        id: 'mana',
        name: 'Arcane Mana',
        icon: 'Zap',
        color: '#3b82f6',
        initialValue: 3,
        minValue: 0,
        maxValue: 8,
        regenPerTurn: 2,
        description: 'Resource spent to play Spell & Tactical Cards during your turn.',
      },
      {
        id: 'gold',
        name: 'Treasury Gold',
        icon: 'Coins',
        color: '#eab308',
        initialValue: 4,
        minValue: 0,
        maxValue: 50,
        regenPerTurn: 1,
        description: 'Earned from combat and shrines; fuels mercenary cards.',
      },
      {
        id: 'vp',
        name: 'Victory Points',
        icon: 'Trophy',
        color: '#a855f7',
        initialValue: 0,
        minValue: 0,
        maxValue: 25,
        regenPerTurn: 0,
        description: 'First player to reach 12 VP claims the Crown.',
      },
    ],
    globalVars: [
      {
        id: 'escalation',
        name: 'War Escalation',
        initialValue: 1,
        changePerRound: 1,
        minValue: 1,
        maxValue: 20,
        description: 'Tracks global conflict intensity each full round.',
      },
    ],
    pieces: [
      {
        id: 'piece_vanguard',
        name: 'Citadel Knight',
        symbol: '🛡️',
        color: '#6366f1',
        ownerType: 'all_players',
        spawnCountPerPlayer: 2,
        maxHp: 12,
        attack: 4,
        defense: 2,
        moveRange: 2,
        attackRange: 1,
        apCost: 1,
        movementType: 'orthogonal',
        canCaptureGoal: true,
        respawnOnDeath: true,
        respawnDelayTurns: 2,
        onAttackEffects: [],
        onKillEffects: [
          {
            id: 'kill_vp',
            target: 'player',
            statId: 'vp',
            operation: 'add',
            value: 2,
          },
          {
            id: 'kill_gold',
            target: 'player',
            statId: 'gold',
            operation: 'add',
            value: 2,
          },
        ],
        description: 'Armored frontline unit that captures objectives and respawns in 2 turns.',
      },
      {
        id: 'piece_ranger',
        name: 'Skybow Ranger',
        symbol: '🏹',
        color: '#10b981',
        ownerType: 'all_players',
        spawnCountPerPlayer: 1,
        maxHp: 8,
        attack: 5,
        defense: 1,
        moveRange: 2,
        attackRange: 2,
        apCost: 1,
        movementType: 'omni',
        canCaptureGoal: true,
        respawnOnDeath: true,
        respawnDelayTurns: 3,
        onAttackEffects: [],
        onKillEffects: [
          {
            id: 'kill_vp_r',
            target: 'player',
            statId: 'vp',
            operation: 'add',
            value: 2,
          },
        ],
        description: 'Agile marksman capable of diagonal movement and 2-tile ranged attacks.',
      },
    ],
    decks: [
      {
        id: 'deck_tactics',
        name: 'Grimoire & Tactics Deck',
        color: '#6366f1',
        drawPerTurn: 1,
        reshuffleDiscard: true,
        description: 'Main shared tactical & spell deck drawn each turn.',
      },
    ],
    cards: [
      {
        id: 'card_vampiric_cataclysm',
        deckId: 'deck_tactics',
        name: 'Sovereign Cataclysm',
        copies: 4,
        costStatId: 'mana',
        costAmount: 2,
        targetType: 'enemy_player',
        conditionExpr: 'player.mana >= 2',
        effects: [
          {
            id: 'c_eff_1',
            type: 'modify_enemy_stat',
            statId: 'hp',
            value: -6,
          },
          {
            id: 'c_eff_2',
            type: 'modify_player_stat',
            statId: 'vp',
            value: 3,
          },
        ],
        description:
          'Deals 6 HP damage to an enemy Commander and grants +3 VP for only 2 Mana. (Suspected Overpowered Card!)',
        tags: ['Spell', 'Offense'],
      },
      {
        id: 'card_tactical_march',
        deckId: 'deck_tactics',
        name: 'Forced March',
        copies: 5,
        costStatId: 'mana',
        costAmount: 2,
        targetType: 'friendly_piece',
        effects: [
          {
            id: 'c_eff_march',
            type: 'teleport_to_goal_step',
            value: 2,
          },
          {
            id: 'c_eff_heal',
            type: 'heal_piece',
            value: 2,
          },
        ],
        description: 'Advances a friendly unit 2 steps toward the Citadel and heals 2 HP.',
        tags: ['Movement', 'Tactic'],
      },
      {
        id: 'card_mercenary_bribe',
        deckId: 'deck_tactics',
        name: 'Royal War Bonds',
        copies: 4,
        costStatId: 'gold',
        costAmount: 4,
        targetType: 'self',
        effects: [
          {
            id: 'c_eff_vp',
            type: 'modify_player_stat',
            statId: 'vp',
            value: 2,
          },
          {
            id: 'c_eff_mana',
            type: 'modify_player_stat',
            statId: 'mana',
            value: 2,
          },
        ],
        description: 'Spend 4 Gold to gain +2 VP and +2 Mana.',
        tags: ['Economy'],
      },
      {
        id: 'card_flame_bolt',
        deckId: 'deck_tactics',
        name: 'Searing Bolt',
        copies: 6,
        costStatId: 'mana',
        costAmount: 3,
        targetType: 'enemy_piece',
        effects: [
          {
            id: 'c_eff_dmg',
            type: 'damage_piece',
            value: 5,
          },
        ],
        description: 'Blasts an enemy unit on the board for 5 damage.',
        tags: ['Spell', 'Combat'],
      },
      {
        id: 'card_forbidden_apocalypse',
        deckId: 'deck_tactics',
        name: 'Forbidden Apocalypse',
        copies: 3,
        costStatId: 'mana',
        costAmount: 10, // BUG: Max Mana is 8, so this card can NEVER be played!
        targetType: 'enemy_player',
        effects: [
          {
            id: 'c_eff_apoc',
            type: 'modify_enemy_stat',
            statId: 'hp',
            value: -15,
          },
        ],
        description:
          'Costs 10 Mana to deal 15 Commander Damage. (Wait—check your Mana stat cap!)',
        tags: ['Ultimate', 'Spell'],
      },
    ],
    turnConfig: {
      playerCount: 2,
      maxTurns: 30,
      startingHandSize: 3,
      maxHandSize: 6,
      diceCount: 1,
      diceSides: 6,
      actionPointsPerTurn: 3,
      firstPlayerAdvantageMitigation: false,
      playerStrategies: ['balanced', 'balanced'],
      phases: [
        {
          id: 'ph_upkeep',
          name: 'Upkeep & Mana Regen',
          type: 'upkeep',
          enabled: true,
          description: 'Regenerate Mana/Gold and trigger start-of-turn effects.',
        },
        {
          id: 'ph_draw',
          name: 'Tactical Draw',
          type: 'draw',
          enabled: true,
          deckIdToDraw: 'deck_tactics',
          description: 'Draw cards from the Grimoire & Tactics Deck.',
        },
        {
          id: 'ph_cards',
          name: 'Cast Spells & Orders',
          type: 'play_cards',
          enabled: true,
          maxCardsToPlay: 2,
          description: 'Play up to 2 cards from hand by paying their resource cost.',
        },
        {
          id: 'ph_actions',
          name: 'Command Units (AP)',
          type: 'action_points',
          enabled: true,
          description: 'Spend Action Points to move units toward objectives and attack enemies.',
        },
        {
          id: 'ph_end',
          name: 'End of Turn & Objective Scoring',
          type: 'end_turn',
          enabled: true,
          description: 'Score Citadel control, apply tile effects, and check victory conditions.',
        },
      ],
    },
    winConditions: [
      {
        id: 'wc_vp',
        name: 'Crown Supremacy (12 VP)',
        enabled: true,
        type: 'stat_threshold',
        statId: 'vp',
        operator: '>=',
        targetValue: 12,
        isLossCondition: false,
        description: 'Win immediately upon reaching 12 or more Victory Points.',
      },
      {
        id: 'wc_commander_ko',
        name: 'Commander Defeated (0 HP)',
        enabled: true,
        type: 'stat_threshold',
        statId: 'hp',
        operator: '<=',
        targetValue: 0,
        isLossCondition: true,
        description: 'A player whose Commander HP reaches 0 is eliminated.',
      },
      {
        id: 'wc_last_standing',
        name: 'Last Commander Standing',
        enabled: true,
        type: 'last_player_standing',
        isLossCondition: false,
        description: 'If all opposing players are eliminated, the survivor wins.',
      },
    ],
    rules: [
      {
        id: 'rule_citadel_bounty',
        name: 'Citadel Conquest Bonus',
        enabled: true,
        trigger: 'ON_LAND_TILE',
        conditionType: 'tile_type',
        conditionTileType: 'goal',
        actions: [
          {
            id: 'ra_1',
            type: 'modify_stat',
            statId: 'vp',
            operation: 'add',
            value: 1,
          },
          {
            id: 'ra_2',
            type: 'modify_stat',
            statId: 'mana',
            operation: 'add',
            value: 1,
          },
        ],
        maxTriggersPerTurn: 2,
        description: 'Entering the central Citadel grants an immediate +1 VP and +1 Mana.',
      },
      {
        id: 'rule_combat_fervor',
        name: 'Bloodlust Mana Surge',
        enabled: true,
        trigger: 'ON_COMBAT',
        conditionType: 'always',
        actions: [
          {
            id: 'ra_combat_1',
            type: 'modify_stat',
            statId: 'gold',
            operation: 'add',
            value: 1,
          },
        ],
        maxTriggersPerTurn: 3,
        description: 'Gain +1 Gold whenever one of your units initiates combat.',
      },
    ],
  },

  // 2. TRACK / PATH RACE GAME
  {
    id: 'preset_chrono_circuit',
    name: 'Chrono Circuit (Track Race & Loop)',
    version: '1.0.4',
    genre: 'Roll-and-Move / Card-Driven Circuit Racer',
    description:
      'High-speed 4-player cybernetic race across a 20-space track with Boost pads, Spike Traps, and Checkpoints. Includes an intentional rule bug ("Overdrive Chain Loop") where landing on a Boost triggers another move that can chain infinitely if uncapped!',
    author: 'FairGame Studio',
    board: generateTrackBoard(20, true),
    playerStats: [
      {
        id: 'hp',
        name: 'Hull Integrity',
        icon: 'Shield',
        color: '#10b981',
        initialValue: 18,
        minValue: 0,
        maxValue: 25,
        regenPerTurn: 1,
        description: 'Vehicle hull points. Recharged slowly each turn.',
      },
      {
        id: 'gold',
        name: 'Nitro Credits',
        icon: 'Coins',
        color: '#f59e0b',
        initialValue: 3,
        minValue: 0,
        maxValue: 30,
        regenPerTurn: 1,
        description: 'Used to buy Nitro Boosts and EMP sabotage cards.',
      },
      {
        id: 'mana',
        name: 'Flux Charge',
        icon: 'Zap',
        color: '#06b6d4',
        initialValue: 2,
        minValue: 0,
        maxValue: 10,
        regenPerTurn: 1,
        description: 'Powers cyber-mod cards.',
      },
      {
        id: 'vp',
        name: 'Circuit Trophies',
        icon: 'Trophy',
        color: '#ec4899',
        initialValue: 0,
        minValue: 0,
        maxValue: 20,
        regenPerTurn: 0,
        description: 'Earned by passing Checkpoints and completing laps. Reach 12 to win!',
      },
    ],
    globalVars: [
      {
        id: 'track_heat',
        name: 'Track Heat Level',
        initialValue: 1,
        changePerRound: 1,
        minValue: 1,
        maxValue: 30,
        description: 'Rises every lap round.',
      },
    ],
    pieces: [
      {
        id: 'piece_racer',
        name: 'Chrono Runner',
        symbol: '🏎️',
        color: '#f43f5e',
        ownerType: 'all_players',
        spawnCountPerPlayer: 1,
        maxHp: 15,
        attack: 3,
        defense: 1,
        moveRange: 3,
        attackRange: 1,
        apCost: 1,
        movementType: 'track_forward',
        canCaptureGoal: true,
        respawnOnDeath: true,
        respawnDelayTurns: 1,
        onAttackEffects: [],
        onKillEffects: [
          {
            id: 'racer_kill',
            target: 'player',
            statId: 'vp',
            operation: 'add',
            value: 1,
          },
        ],
        description: 'Primary racing vehicle that moves forward along track connections.',
      },
    ],
    decks: [
      {
        id: 'deck_nitro',
        name: 'Cyber-Rig Deck',
        color: '#06b6d4',
        drawPerTurn: 1,
        reshuffleDiscard: true,
        description: 'Boosters, shields, and sabotage gadgets.',
      },
    ],
    cards: [
      {
        id: 'card_nitro_surge',
        deckId: 'deck_nitro',
        name: 'Hyper-Nitro Surge',
        copies: 6,
        costStatId: 'gold',
        costAmount: 2,
        targetType: 'friendly_piece',
        effects: [
          {
            id: 'eff_nitro_move',
            type: 'push_move_piece',
            value: 3,
          },
          {
            id: 'eff_nitro_vp',
            type: 'modify_player_stat',
            statId: 'vp',
            value: 1,
          },
        ],
        description: 'Surges your racer 3 spaces forward along the track and grants +1 Trophy.',
        tags: ['Speed'],
      },
      {
        id: 'card_emp_blast',
        deckId: 'deck_nitro',
        name: 'EMP Shockwave',
        copies: 5,
        costStatId: 'mana',
        costAmount: 2,
        targetType: 'enemy_player',
        effects: [
          {
            id: 'eff_emp_dmg',
            type: 'modify_enemy_stat',
            statId: 'hp',
            value: -4,
          },
          {
            id: 'eff_emp_steal',
            type: 'steal_stat',
            statId: 'gold',
            value: 2,
          },
        ],
        description: 'Deals 4 Hull damage to an opponent and steals 2 Nitro Credits.',
        tags: ['Sabotage'],
      },
      {
        id: 'card_nanobot_repair',
        deckId: 'deck_nitro',
        name: 'Nanobot Hull Patch',
        copies: 4,
        costStatId: 'gold',
        costAmount: 2,
        targetType: 'self',
        effects: [
          {
            id: 'eff_repair',
            type: 'modify_player_stat',
            statId: 'hp',
            value: 5,
          },
        ],
        description: 'Restores 5 Hull Integrity.',
        tags: ['Defense'],
      },
    ],
    turnConfig: {
      playerCount: 4,
      maxTurns: 25,
      startingHandSize: 2,
      maxHandSize: 5,
      diceCount: 1,
      diceSides: 6,
      actionPointsPerTurn: 1,
      firstPlayerAdvantageMitigation: false,
      playerStrategies: ['rusher', 'aggressive', 'economic', 'balanced'],
      phases: [
        {
          id: 'ph_upkeep',
          name: 'Reactor Upkeep',
          type: 'upkeep',
          enabled: true,
          description: 'Recharge Hull and Credits.',
        },
        {
          id: 'ph_draw',
          name: 'Draw Cyber-Rig Card',
          type: 'draw',
          enabled: true,
          deckIdToDraw: 'deck_nitro',
          description: 'Draw 1 gadget card.',
        },
        {
          id: 'ph_roll',
          name: 'Roll Thrusters & Move',
          type: 'roll_and_move',
          enabled: true,
          description: 'Roll 1d6 and move your racer forward along the track.',
        },
        {
          id: 'ph_cards',
          name: 'Activate Gadgets',
          type: 'play_cards',
          enabled: true,
          maxCardsToPlay: 2,
          description: 'Play up to 2 Cyber-Rig cards.',
        },
        {
          id: 'ph_end',
          name: 'Telemetry Check',
          type: 'end_turn',
          enabled: true,
          description: 'Check lap trophies and hull integrity.',
        },
      ],
    },
    winConditions: [
      {
        id: 'wc_circuit_vp',
        name: 'Grand Prix Champion (12 Trophies)',
        enabled: true,
        type: 'stat_threshold',
        statId: 'vp',
        operator: '>=',
        targetValue: 12,
        isLossCondition: false,
        description: 'First racer to earn 12 Circuit Trophies wins the race.',
      },
      {
        id: 'wc_wrecked',
        name: 'Hull Wrecked (0 HP)',
        enabled: true,
        type: 'stat_threshold',
        statId: 'hp',
        operator: '<=',
        targetValue: 0,
        isLossCondition: true,
        description: 'Racer is eliminated if Hull Integrity drops to 0.',
      },
    ],
    rules: [
      {
        id: 'rule_overdrive_loop',
        name: 'Overdrive Pad Chain (Unbounded Trigger!)',
        enabled: true,
        trigger: 'ON_LAND_TILE',
        conditionType: 'tile_type',
        conditionTileType: 'boost',
        actions: [
          {
            id: 'act_loop_move',
            type: 'move_forward',
            value: 4, // Note: Boost tiles are spaced every 4 tiles (2, 6, 10, 14, 18), so moving +4 lands on another Boost tile infinitely!
          },
          {
            id: 'act_loop_vp',
            type: 'modify_stat',
            statId: 'vp',
            operation: 'add',
            value: 1,
          },
        ],
        maxTriggersPerTurn: 0, // 0 = Unlimited! Will cause an infinite loop whenever a player lands on Boost!
        description:
          'When landing on a Boost space, jump forward 4 spaces and gain +1 Trophy. (WARNING: Since Boost pads are 4 spaces apart and maxTriggersPerTurn is 0, this creates a game-breaking infinite loop!)',
      },
    ],
  },

  // 3. NODE / GRAPH TERRITORY GAME
  {
    id: 'preset_shattered_realms',
    name: 'Shattered Realms (Node Territory Map)',
    version: '1.1.0',
    genre: '4X Node-Graph Territory Control & Strategy',
    description:
      'Strategic conquest across 13 interconnected kingdom provinces. Players muster legions, claim Gold Mines and Arcane Spires, and fight for control of the Imperial Throne.',
    author: 'FairGame Studio',
    board: generateGraphBoard(),
    playerStats: [
      {
        id: 'hp',
        name: 'Kingdom Stability',
        icon: 'Heart',
        color: '#ef4444',
        initialValue: 24,
        minValue: 0,
        maxValue: 30,
        regenPerTurn: 0,
        description: 'Falls when losing battles or suffering raids.',
      },
      {
        id: 'gold',
        name: 'Imperial Gold',
        icon: 'Coins',
        color: '#eab308',
        initialValue: 5,
        minValue: 0,
        maxValue: 40,
        regenPerTurn: 2,
        description: 'Used to fund War Decrees and siege campaigns.',
      },
      {
        id: 'mana',
        name: 'Influence',
        icon: 'Zap',
        color: '#8b5cf6',
        initialValue: 3,
        minValue: 0,
        maxValue: 15,
        regenPerTurn: 1,
        description: 'Diplomatic and arcane power.',
      },
      {
        id: 'vp',
        name: 'Imperial Hegemony (VP)',
        icon: 'Trophy',
        color: '#f59e0b',
        initialValue: 0,
        minValue: 0,
        maxValue: 25,
        regenPerTurn: 0,
        description: 'Reach 15 Hegemony Points to unite the Shattered Realms.',
      },
    ],
    globalVars: [
      {
        id: 'era',
        name: 'Realm Age',
        initialValue: 1,
        changePerRound: 1,
        minValue: 1,
        maxValue: 50,
        description: 'Current historical turn of the conflict.',
      },
    ],
    pieces: [
      {
        id: 'piece_legion',
        name: 'Iron Legion',
        symbol: '⚔️',
        color: '#f59e0b',
        ownerType: 'all_players',
        spawnCountPerPlayer: 2,
        maxHp: 14,
        attack: 5,
        defense: 2,
        moveRange: 1,
        attackRange: 1,
        apCost: 1,
        movementType: 'graph_adjacent',
        canCaptureGoal: true,
        respawnOnDeath: true,
        respawnDelayTurns: 2,
        onAttackEffects: [],
        onKillEffects: [
          {
            id: 'legion_kill_vp',
            target: 'player',
            statId: 'vp',
            operation: 'add',
            value: 2,
          },
        ],
        description: 'Marches along province roads (graph edges) to conquer connected nodes.',
      },
    ],
    decks: [
      {
        id: 'deck_decrees',
        name: 'Imperial Decrees',
        color: '#f59e0b',
        drawPerTurn: 1,
        reshuffleDiscard: true,
        description: 'Statecraft, taxation, and military campaigns.',
      },
    ],
    cards: [
      {
        id: 'card_war_tax',
        deckId: 'deck_decrees',
        name: 'Emergency War Levy',
        copies: 5,
        costStatId: 'mana',
        costAmount: 2,
        targetType: 'self',
        effects: [
          {
            id: 'eff_levy_gold',
            type: 'modify_player_stat',
            statId: 'gold',
            value: 5,
          },
          {
            id: 'eff_levy_vp',
            type: 'modify_player_stat',
            statId: 'vp',
            value: 1,
          },
        ],
        description: 'Spend 2 Influence to collect 5 Gold and +1 Hegemony.',
        tags: ['Economy'],
      },
      {
        id: 'card_imperial_crusade',
        deckId: 'deck_decrees',
        name: 'Banner of Conquest',
        copies: 5,
        costStatId: 'gold',
        costAmount: 4,
        targetType: 'friendly_piece',
        effects: [
          {
            id: 'eff_crusade_step',
            type: 'teleport_to_goal_step',
            value: 1,
          },
          {
            id: 'eff_crusade_atk',
            type: 'boost_piece_attack',
            value: 2,
          },
        ],
        description: 'Advances a Legion toward the Imperial Throne and grants +2 Attack.',
        tags: ['Military'],
      },
      {
        id: 'card_sabotage_supply',
        deckId: 'deck_decrees',
        name: 'Cut Supply Lines',
        copies: 4,
        costStatId: 'gold',
        costAmount: 3,
        targetType: 'enemy_piece',
        effects: [
          {
            id: 'eff_sab_dmg',
            type: 'damage_piece',
            value: 6,
          },
        ],
        description: 'Inflicts 6 attrition damage to a rival Legion.',
        tags: ['Intrigue'],
      },
    ],
    turnConfig: {
      playerCount: 3,
      maxTurns: 30,
      startingHandSize: 3,
      maxHandSize: 6,
      diceCount: 1,
      diceSides: 6,
      actionPointsPerTurn: 2,
      firstPlayerAdvantageMitigation: true,
      playerStrategies: ['balanced', 'rusher', 'aggressive'],
      phases: [
        {
          id: 'ph_upkeep',
          name: 'Harvest & Tribute',
          type: 'upkeep',
          enabled: true,
          description: 'Collect Gold & Influence from provinces.',
        },
        {
          id: 'ph_draw',
          name: 'Council Session (Draw)',
          type: 'draw',
          enabled: true,
          deckIdToDraw: 'deck_decrees',
          description: 'Draw 1 Imperial Decree.',
        },
        {
          id: 'ph_cards',
          name: 'Enact Decrees',
          type: 'play_cards',
          enabled: true,
          maxCardsToPlay: 2,
          description: 'Play up to 2 Imperial Decrees.',
        },
        {
          id: 'ph_actions',
          name: 'March & Siege (AP)',
          type: 'action_points',
          enabled: true,
          description: 'Spend 2 AP to march Legions across connected provinces and battle rivals.',
        },
        {
          id: 'ph_end',
          name: 'Province Control Scoring',
          type: 'end_turn',
          enabled: true,
          description: 'Score Hegemony Points from holding the Imperial Throne, Mines, and Spires.',
        },
      ],
    },
    winConditions: [
      {
        id: 'wc_hegemony',
        name: 'Imperial Hegemony (15 VP)',
        enabled: true,
        type: 'stat_threshold',
        statId: 'vp',
        operator: '>=',
        targetValue: 15,
        isLossCondition: false,
        description: 'Win by reaching 15 Hegemony Points.',
      },
      {
        id: 'wc_throne_tiebreak',
        name: 'Highest Hegemony at Max Turns',
        enabled: true,
        type: 'highest_stat_at_max_turns',
        statId: 'vp',
        isLossCondition: false,
        description: 'If Turn 30 ends, the ruler with the highest VP wins (unless tied).',
      },
    ],
    rules: [
      {
        id: 'rule_throne_claim',
        name: 'Imperial Coronation',
        enabled: true,
        trigger: 'ON_LAND_TILE',
        conditionType: 'tile_type',
        conditionTileType: 'goal',
        actions: [
          {
            id: 'act_throne_vp',
            type: 'modify_stat',
            statId: 'vp',
            operation: 'add',
            value: 2,
          },
        ],
        maxTriggersPerTurn: 1,
        description: 'Marching a Legion into the Imperial Throne immediately awards +2 VP.',
      },
    ],
  },
];
