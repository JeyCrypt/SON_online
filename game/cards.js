// game/cards.js

// Added kingBonus and queenBonus to each legal good
const LEGAL_GOODS = [
  { id: 'apple',   name: 'Apple',   type: 'legal', value: 2, penalty: 2, count: 48, kingBonus: 20, queenBonus: 10 },
  { id: 'cheese',  name: 'Cheese',  type: 'legal', value: 3, penalty: 2, count: 36, kingBonus: 15, queenBonus: 10 },
  { id: 'bread',   name: 'Bread',   type: 'legal', value: 3, penalty: 2, count: 36, kingBonus: 15, queenBonus: 10 },
  { id: 'chicken', name: 'Chicken', type: 'legal', value: 4, penalty: 2, count: 24, kingBonus: 10, queenBonus: 5 }
];

const CONTRABAND_GOODS = [
  { id: 'pepper',   name: 'Pepper',   type: 'contraband', value: 6, penalty: 4, count: 18 },
  { id: 'silk',     name: 'Silk',     type: 'contraband', value: 7, penalty: 4, count: 12 },
  { id: 'mead',     name: 'Mead',     type: 'contraband', value: 7, penalty: 4, count: 12 },
  { id: 'crossbow', name: 'Crossbow', type: 'contraband', value: 9, penalty: 4, count: 10 }
];

function buildDeck() {
  const deck = [];
  const all = [...LEGAL_GOODS, ...CONTRABAND_GOODS];
  all.forEach(cardType => {
    for (let i = 0; i < cardType.count; i++) {
      deck.push({
        cardId: `${cardType.id}-${i}`,
        typeId: cardType.id,
        name: cardType.name,
        type: cardType.type,
        value: cardType.value,
        penalty: cardType.penalty
      });
    }
  });
  shuffle(deck);
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

module.exports = {
  buildDeck,
  LEGAL_GOODS,
  CONTRABAND_GOODS
};
