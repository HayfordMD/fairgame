import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Upload,
  Download,
  AlertTriangle,
  Sparkles,
  Copy,
} from 'lucide-react';
import {
  CardDefinition,
  CardEffect,
  CardTargetType,
  DeckDefinition,
  GameConfig,
} from '../types/game';
import { importCardsFromCSV } from '../utils/importers';

interface CardsAndDecksTabProps {
  config: GameConfig;
  onUpdateConfig: (patch: Partial<GameConfig>) => void;
}

export const CardsAndDecksTab: React.FC<CardsAndDecksTabProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [selectedCardId, setSelectedCardId] = useState<string>(
    config.cards[0]?.id || ''
  );
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const selectedCard =
    config.cards.find((c) => c.id === selectedCardId) || config.cards[0] || null;

  const statMap = new Map(config.playerStats.map((s) => [s.id, s]));

  const handleAddDeck = () => {
    const newDeck: DeckDefinition = {
      id: `deck_${Date.now().toString().slice(-4)}`,
      name: `Deck ${config.decks.length + 1}`,
      color: '#ec4899',
      drawPerTurn: 1,
      reshuffleDiscard: true,
      description: 'Custom card deck.',
    };
    onUpdateConfig({ decks: [...config.decks, newDeck] });
  };

  const handleAddCard = () => {
    const newId = `card_${Date.now().toString().slice(-4)}`;
    const defaultCostStat =
      config.playerStats.find((s) => s.id === 'mana' || s.id === 'gold')?.id ||
      config.playerStats[0]?.id ||
      'mana';
    const newCard: CardDefinition = {
      id: newId,
      deckId: config.decks[0]?.id || 'deck_default',
      name: `New Tactical Card ${config.cards.length + 1}`,
      copies: 4,
      costStatId: defaultCostStat,
      costAmount: 2,
      targetType: 'self',
      effects: [
        {
          id: `ce_${Date.now()}`,
          type: 'modify_player_stat',
          statId: 'vp',
          value: 2,
        },
      ],
      description: 'Grants +2 Victory Points when played.',
      tags: ['Custom'],
    };
    onUpdateConfig({ cards: [...config.cards, newCard] });
    setSelectedCardId(newId);
  };

  const handleDuplicateCard = (card: CardDefinition) => {
    const copyId = `card_${Date.now().toString().slice(-4)}`;
    const cloned: CardDefinition = {
      ...card,
      id: copyId,
      name: `${card.name} (Copy)`,
      effects: card.effects.map((e, i) => ({
        ...e,
        id: `ce_dup_${Date.now()}_${i}`,
      })),
    };
    onUpdateConfig({ cards: [...config.cards, cloned] });
    setSelectedCardId(copyId);
  };

  const handleUpdateCard = (id: string, patch: Partial<CardDefinition>) => {
    onUpdateConfig({
      cards: config.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  };

  const handleDeleteCard = (id: string) => {
    const remaining = config.cards.filter((c) => c.id !== id);
    onUpdateConfig({ cards: remaining });
    setSelectedCardId(remaining[0]?.id || '');
  };

  const handleUploadCardsCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const imported = importCardsFromCSV(
          reader.result,
          config.decks[0]?.id || 'deck_1'
        );
        if (imported.length > 0) {
          onUpdateConfig({ cards: [...config.cards, ...imported] });
          setSelectedCardId(imported[0].id);
          setUploadNotice(`Imported ${imported.length} card(s) from ${file.name}`);
          setTimeout(() => setUploadNotice(null), 4000);
        }
      }
    };
    reader.readAsText(file);
  };

  const downloadSampleCardsCSV = () => {
    const sample = `name,copies,cost_stat,cost_amount,target,effect_type,effect_stat,effect_value,condition,formula,description\nArcane Surge,4,mana,2,self,modify_player_stat,vp,2,player.mana >= 2,,Gain 2 VP\nMeteor Strike,3,mana,4,enemy_player,modify_enemy_stat,hp,-5,,player.vp += 1,Deal 5 damage to enemy Commander and gain 1 VP\nSwift Advance,5,gold,2,friendly_piece,teleport_to_goal_step,vp,2,,,Advance unit 2 spaces toward Goal`;
    const blob = new Blob([sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_cards.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalDeckCards = config.cards.reduce((sum, c) => sum + c.copies, 0);

  return (
    <div className="space-y-6">
      {uploadNotice && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 px-4 py-2.5 rounded-xl text-xs font-medium">
          ✓ {uploadNotice}
        </div>
      )}

      {/* Decks Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Decks ({config.decks.length})</span>
            <span className="text-xs font-normal text-slate-400">
              • Total Physical Cards in Pool: {totalDeckCards}
            </span>
          </div>

          {config.decks.map((d, idx) => (
            <div
              key={d.id}
              className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <input
                type="text"
                value={d.name}
                onChange={(e) => {
                  const next = [...config.decks];
                  next[idx] = { ...d, name: e.target.value };
                  onUpdateConfig({ decks: next });
                }}
                className="bg-transparent text-slate-100 font-medium w-36 focus:outline-none"
              />
              <span className="text-slate-500">Draw/Turn:</span>
              <input
                type="number"
                min={0}
                max={5}
                value={d.drawPerTurn}
                onChange={(e) => {
                  const next = [...config.decks];
                  next[idx] = {
                    ...d,
                    drawPerTurn: Math.max(0, parseInt(e.target.value, 10) || 0),
                  };
                  onUpdateConfig({ decks: next });
                }}
                className="w-10 bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-100"
              />
            </div>
          ))}
          <button
            onClick={handleAddDeck}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add Deck
          </button>
        </div>

        {/* CSV Import / Template */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium cursor-pointer border border-slate-700">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Upload Cards CSV</span>
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleUploadCardsCSV}
            />
          </label>
          <button
            onClick={downloadSampleCardsCSV}
            className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs border border-slate-800 flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> CSV Template
          </button>
          <button
            onClick={handleAddCard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> New Card
          </button>
        </div>
      </div>

      {/* Main Card Gallery + Card Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Visual Tabletop Cards Grid */}
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[640px] overflow-y-auto pr-1">
          {config.cards.map((card) => {
            const isSelected = selectedCard?.id === card.id;
            const costStat = statMap.get(card.costStatId);
            const exceedsCap =
              costStat !== undefined && card.costAmount > costStat.maxValue;

            return (
              <div
                key={card.id}
                onClick={() => setSelectedCardId(card.id)}
                className={`group relative rounded-xl p-4 border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-gradient-to-b from-indigo-950/70 to-slate-900 border-indigo-400 shadow-lg'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Top Bar: Cost Pill + Copies Badge */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                        exceedsCap
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {card.costAmount} {costStat?.name || card.costStatId}
                      {exceedsCap && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                    </span>
                    <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                      ×{card.copies} in deck
                    </span>
                  </div>

                  {/* Card Title */}
                  <h4 className="text-sm font-bold text-slate-100 mb-1">
                    {card.name}
                  </h4>

                  {/* Warning if cost exceeds stat maxValue */}
                  {exceedsCap && (
                    <div className="mb-2 px-2 py-1 rounded bg-rose-950/80 border border-rose-500/40 text-[11px] text-rose-300">
                      ⚠️ Cost ({card.costAmount}) exceeds {costStat.name} Max Cap (
                      {costStat.maxValue})!
                    </div>
                  )}

                  {/* Effects Summary Pills */}
                  <div className="space-y-1 my-2">
                    {card.effects.map((eff) => (
                      <div
                        key={eff.id}
                        className="text-xs bg-slate-950/90 border border-slate-800/90 rounded px-2 py-1 text-slate-300 font-medium"
                      >
                        • {eff.type.replace(/_/g, ' ')}{' '}
                        {eff.statId ? `(${eff.statId.toUpperCase()})` : ''}:{' '}
                        <span
                          className={
                            eff.value >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }
                        >
                          {eff.value >= 0 ? `+${eff.value}` : eff.value}
                        </span>
                      </div>
                    ))}
                    {card.formulaExpr && (
                      <div className="text-[11px] font-mono bg-indigo-950/50 border border-indigo-500/30 rounded px-2 py-1 text-indigo-200">
                        ƒ: {card.formulaExpr}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Target: {card.targetType.replace('_', ' ')}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDuplicateCard(card);
                      }}
                      className="p-1 hover:text-indigo-300"
                      title="Duplicate Card"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCard(card.id);
                      }}
                      className="p-1 hover:text-rose-400"
                      title="Delete Card"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Detailed Card Architect Inspector */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5">
          {selectedCard ? (
            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Card Configuration & Effect Builder
                  </h3>
                  <p className="text-slate-400">
                    Edit cost, conditions, effects, and custom script formulas
                  </p>
                </div>
                <span className="font-mono text-slate-500">{selectedCard.id}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">Card Name</label>
                  <input
                    type="text"
                    value={selectedCard.name}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, { name: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Copies in Deck
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={selectedCard.copies}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, {
                        copies: Math.max(1, parseInt(e.target.value, 10) || 1),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100 font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Cost Stat</label>
                  <select
                    value={selectedCard.costStatId}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, {
                        costStatId: e.target.value,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    {config.playerStats.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Max {s.maxValue})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Cost Amount</label>
                  <input
                    type="number"
                    min={0}
                    value={selectedCard.costAmount}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, {
                        costAmount: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Target Type</label>
                  <select
                    value={selectedCard.targetType}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, {
                        targetType: e.target.value as CardTargetType,
                      })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100"
                  >
                    <option value="self">Self (Active Player)</option>
                    <option value="enemy_player">Enemy Player</option>
                    <option value="friendly_piece">Friendly Unit</option>
                    <option value="enemy_piece">Enemy Unit</option>
                    <option value="any_tile">Board Space</option>
                  </select>
                </div>
              </div>

              {/* Card Effects List */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">
                    Card Effects ({selectedCard.effects.length})
                  </span>
                  <button
                    onClick={() =>
                      handleUpdateCard(selectedCard.id, {
                        effects: [
                          ...selectedCard.effects,
                          {
                            id: `ce_${Date.now()}`,
                            type: 'modify_player_stat',
                            statId: 'vp',
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

                {selectedCard.effects.map((eff, idx) => (
                  <div
                    key={eff.id}
                    className="flex flex-wrap items-center gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800"
                  >
                    <select
                      value={eff.type}
                      onChange={(e) => {
                        const next = [...selectedCard.effects];
                        next[idx] = {
                          ...eff,
                          type: e.target.value as CardEffect['type'],
                        };
                        handleUpdateCard(selectedCard.id, { effects: next });
                      }}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    >
                      <option value="modify_player_stat">
                        Modify Self Player Stat
                      </option>
                      <option value="modify_enemy_stat">
                        Modify Enemy Player Stat
                      </option>
                      <option value="steal_stat">Steal Stat from Enemy</option>
                      <option value="damage_piece">Deal Damage to Enemy Unit</option>
                      <option value="heal_piece">Heal Friendly Unit</option>
                      <option value="boost_piece_attack">
                        Boost Friendly Unit Attack
                      </option>
                      <option value="push_move_piece">
                        Move Friendly Unit Forward (+Steps)
                      </option>
                      <option value="teleport_to_goal_step">
                        Advance Unit Toward Goal (+Steps)
                      </option>
                      <option value="draw_cards">Draw Extra Cards</option>
                    </select>

                    {(eff.type === 'modify_player_stat' ||
                      eff.type === 'modify_enemy_stat' ||
                      eff.type === 'steal_stat') && (
                      <select
                        value={eff.statId || 'vp'}
                        onChange={(e) => {
                          const next = [...selectedCard.effects];
                          next[idx] = { ...eff, statId: e.target.value };
                          handleUpdateCard(selectedCard.id, { effects: next });
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

                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">Val:</span>
                      <input
                        type="number"
                        value={eff.value}
                        onChange={(e) => {
                          const next = [...selectedCard.effects];
                          next[idx] = {
                            ...eff,
                            value: parseFloat(e.target.value) || 0,
                          };
                          handleUpdateCard(selectedCard.id, { effects: next });
                        }}
                        className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-100 font-semibold"
                      />
                    </div>

                    <button
                      onClick={() =>
                        handleUpdateCard(selectedCard.id, {
                          effects: selectedCard.effects.filter((_, i) => i !== idx),
                        })
                      }
                      className="text-slate-500 hover:text-rose-400 ml-auto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Custom Condition & Formula Scripting */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Play Condition Expression (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. player.gold >= 3 && turn >= 2"
                    value={selectedCard.conditionExpr || ''}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, {
                        conditionExpr: e.target.value || undefined,
                      })
                    }
                    className="w-full font-mono bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-indigo-200"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-slate-400 mb-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    Custom Formula Script (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. player.vp += 1; enemy.hp -= 3"
                    value={selectedCard.formulaExpr || ''}
                    onChange={(e) =>
                      handleUpdateCard(selectedCard.id, {
                        formulaExpr: e.target.value || undefined,
                      })
                    }
                    className="w-full font-mono bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-emerald-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  Card Rules Text / Description
                </label>
                <textarea
                  rows={2}
                  value={selectedCard.description}
                  onChange={(e) =>
                    handleUpdateCard(selectedCard.id, {
                      description: e.target.value,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200"
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Select or add a card to configure its properties.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
