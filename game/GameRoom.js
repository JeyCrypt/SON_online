// game/GameRoom.js

const Player = require('./Player');
const { buildDeck, LEGAL_GOODS } = require('./cards');

const PHASES = {
  LOBBY: 'lobby',
  MARKET: 'market',
  PACKING: 'packing',
  INSPECTION: 'inspection',
  END: 'end'
};

// helper map: id -> good info (for bonuses & names)
const LEGAL_GOODS_BY_ID = {};
LEGAL_GOODS.forEach(g => {
  LEGAL_GOODS_BY_ID[g.id] = g;
});

class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = [];
    this.leaderId = null;
    this.phase = PHASES.LOBBY;
    this.sheriffIndex = 0;
    this.round = 1;
    this.maxRounds = 2; // can tweak later
    this.deck = buildDeck();
    this.discard = [];
    this.chat = [];
    this.pendingInspections = new Set();
    this.finalScores = null; // <--- new
    this.bribes = {}; // { merchantId: { amount, message } }
    this.bribeResults = {}; // { merchantId: { status: 'accepted'|'rejected', amount } }
    this.events = [];       // array of { id, text, ts }
    this.lastEventId = 0;
  }

  offerBribe(merchantId, amount, message, stallCardIds = [], bagCardIds = []) {
  const m = this.getPlayer(merchantId);
  if (!m) return;
  if (amount <= 0 || amount > m.gold) return;

  // Clean inputs
  const stallIds = (stallCardIds || []).map(id => parseInt(id, 10)).filter(x => !isNaN(x));
  const bagIds   = (bagCardIds   || []).map(id => parseInt(id, 10)).filter(x => !isNaN(x));

  // ---- Build log line ----
  let logText = `${m.name} offered a bribe of ${amount}g`;

  if (stallIds.length) logText += ` + ${stallIds.length} good(s) from stall`;
  if (bagIds.length)   logText += ` + ${bagIds.length} card(s) from bag`;

  if (message && message.trim()) {
    logText += ` with message: "${message.trim()}"`;
  }

  this.logEvent(logText + '.');

  // ---- Clear old result (your existing logic) ----
  delete this.bribeResults[merchantId];

  // ---- Store the bribe details (extended version) ----
  this.bribes[merchantId] = {
    amount,
    message: message?.slice(0, 200) || '',
    stallCards: stallIds,
    bagCards: bagIds
  };
  }

  acceptBribe(sheriffId, merchantId) {
  const sheriff = this.currentSheriff();
  if (!sheriff || sheriff.id !== sheriffId) return;

  const bribe = this.bribes[merchantId];
  if (!bribe) return;

  const m = this.getPlayer(merchantId);
  if (!m) return;

  // transfer gold
  m.gold -= bribe.amount;
  sheriff.gold += bribe.amount;

  // 🔥 TRANSFER OFFERED GOODS (if any)

  // from stall
  const stallIds = bribe.stallCards || [];
  if (stallIds.length) {
    const remainingStall = [];
    m.stall.forEach(card => {
      if (stallIds.includes(card.cardId)) {
        sheriff.stall.push(card);
      } else {
        remainingStall.push(card);
      }
    });
    m.stall = remainingStall;
  }

  // from bag
  const bagIds = bribe.bagCards || [];
  if (bagIds.length) {
    const remainingBag = [];
    m.bag.forEach(card => {
      if (bagIds.includes(card.cardId)) {
        sheriff.stall.push(card);   // sheriff keeps these
      } else {
        remainingBag.push(card);
      }
    });
    m.bag = remainingBag;
    // keep declaredCount in sync
    m.declaredCount = m.bag.length;
  }

  // bag passes safely
  this.letBagPass(m);

  // record result so merchant (and sheriff) can see it
  this.bribeResults[merchantId] = {
    status: 'accepted',
    amount: bribe.amount
  };

  this.logEvent(`${sheriff.name} accepted a bribe of ${bribe.amount}g from ${m.name}. Bag passed safely.`);

  delete this.bribes[merchantId];
  this.pendingInspections.delete(merchantId);

  if (this.pendingInspections.size === 0) {
    this.endRoundOrGame();
  }
    }


  rejectBribe(sheriffId, merchantId) {
  const sheriff = this.currentSheriff();
  if (!sheriff || sheriff.id !== sheriffId) return;

  const bribe = this.bribes[merchantId];
  if (!bribe) return;

  const m = this.getPlayer(merchantId);
  if (!m) return;

  this.bribeResults[merchantId] = {
    status: 'rejected',
    amount: bribe.amount
  };

  this.logEvent(`${sheriff.name} rejected a bribe of ${bribe.amount}g from ${m.name}.`);

  delete this.bribes[merchantId];
  }
    

    disconnectPlayer(socketId) {
    const p = this.getPlayer(socketId);
    if (p) {
        p.connected = false;
    }
    }

    reconnectPlayerByName(name, newSocketId) {
  // find a *disconnected* player with this name
  const p = this.players.find(
    pl => pl.name === name && pl.connected === false
  );
  if (!p) return null;

  p.id = newSocketId;
  p.connected = true;
  return p;
    }


    // NEW: merchant explicitly backs down (no bribe)
    backDown(merchantId) {
    const m = this.getPlayer(merchantId);
    if (!m) return;

    delete this.bribes[merchantId]; // no active bribe anymore
    this.bribeResults[merchantId] = {
        status: 'back_down',
        amount: 0
    };

    this.logEvent(`${m.name} backed down from bribing.`);

    }


  addPlayer(socketId, name) {
    if (this.phase !== PHASES.LOBBY) return null;
    if (this.players.find(p => p.id === socketId)) return null;
    const player = new Player(socketId, name);
    this.players.push(player);
    if (!this.leaderId) this.leaderId = socketId;
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.id === socketId);
    if (idx !== -1) {
      this.players.splice(idx, 1);
      if (this.leaderId === socketId && this.players.length > 0) {
        this.leaderId = this.players[0].id;
      }
    }
  }

  logEvent(text) {
    this.events.push({
      id: ++this.lastEventId,
      text,
      ts: Date.now()
    });
    // keep only last 50 events so it doesn't grow forever
    if (this.events.length > 50) {
      this.events.shift();
    }
  }


  getPlayer(id) {
    return this.players.find(p => p.id === id);
  }

  toggleReady(playerId) {
    const p = this.getPlayer(playerId);
    if (!p || this.phase !== PHASES.LOBBY) return;
    p.ready = !p.ready;
  }

  canStart(playerId) {
    if (playerId !== this.leaderId) return false;
    if (this.players.length < 3) return false;
    return this.players.every(p => p.ready);
  }

  setMaxRounds(playerId, value) {
    // Only leader can change it, and only in lobby
    if (playerId !== this.leaderId) return;
    if (this.phase !== PHASES.LOBBY) return;

    const n = parseInt(value, 10);
    if (!Number.isInteger(n)) return;
    if (n < 1 || n > 10) return; // clamp allowed range

    this.maxRounds = n;
  }

  startGame() {
    this.bribes = {}; this.bribeResults = {};
    this.phase = PHASES.MARKET;
    this.players.forEach(p => {
      this.drawCards(p, 6);
      p.gold = 50;
    });
  }

  drawCards(player, count) {
    for (let i = 0; i < count; i++) {
      if (this.deck.length === 0) break;
      player.hand.push(this.deck.pop());
    }
  }

  finishMarketForPlayer(playerId) {
  if (!this._marketDone) this._marketDone = new Set();

  const p = this.getPlayer(playerId);
  if (p) {
    this.logEvent(`${p.name} is done with the market.`);
  }

  this._marketDone.add(playerId);

  if (this._marketDone.size === this.players.length) {
    this.phase = PHASES.PACKING;
    this._marketDone = null;
  }
 }

  setBag(playerId, cardIds, declaredGood) {
    const p = this.getPlayer(playerId);
    if (!p || this.phase !== PHASES.PACKING) return;

      const newHand = [];
      const bag = [];
      p.hand.forEach(card => {
        if (cardIds.includes(card.cardId)) {
          bag.push(card);
        } else {
          newHand.push(card);
        }
    });

    p.hand = newHand;
    p.bag = bag;
    p.declaredGood = declaredGood;
    p.declaredCount = bag.length;

    this.logEvent(
    `${p.name} packed ${p.declaredCount}× ${friendlyName(p.declaredGood)} in their bag.`
    );

    if (!this._packingDone) this._packingDone = new Set();
    this._packingDone.add(playerId);

    const sheriff = this.players[this.sheriffIndex];
    const merchants = this.players.filter(pl => pl.id !== sheriff.id);
    const allMerchantsPacked = merchants.every(m => this._packingDone.has(m.id));

    if (allMerchantsPacked) {
      this.phase = PHASES.INSPECTION;
      this.pendingInspections = new Set(merchants.map(m => m.id));
      this._packingDone = null;
    }
 }


  currentSheriff() {
    return this.players[this.sheriffIndex];
  }

  sheriffDecision(sheriffId, merchantId, action) {
    const sheriff = this.currentSheriff();
    if (!sheriff || sheriff.id !== sheriffId) return;
    if (this.phase !== PHASES.INSPECTION) return;

    const merchant = this.getPlayer(merchantId);
    if (!merchant || !this.pendingInspections.has(merchantId)) return;

    if (action === 'inspect') {
    this.inspectBag(sheriff, merchant);
    } else if (action === 'let_pass') {
    this.letBagPass(merchant);
    this.bribeResults[merchantId] = { status: 'passed', amount: 0 };
    this.logEvent(`${sheriff.name} let ${merchant.name}'s bag pass safely.`);
    } else if (action === 'let_pass') {
      this.letBagPass(merchant);
      this.bribeResults[merchantId] = {
      status: 'passed',
      amount: 0
     };
     this.logEvent(`${sheriff.name} let ${merchant.name}'s bag pass safely.`);
    }

    this.pendingInspections.delete(merchantId);
    if (this.pendingInspections.size === 0) {
      this.endRoundOrGame();
    }
  }

  inspectBag(sheriff, merchant) {
    let honest = true;
    merchant.bag.forEach(card => {
      if (card.type === 'contraband' || card.name !== friendlyName(merchant.declaredGood)) {
        honest = false;
      }
    });

    if (honest) {

      // ✅ NEW: event log for truthful merchant
      this.logEvent(`${sheriff.name} inspected ${merchant.name}'s bag — ${merchant.name} was truthful. The Sheriff paid penalties.`);

      let totalPenalty = 0;
      merchant.bag.forEach(card => {
        if (card.type === 'legal') totalPenalty += card.penalty;
      });
      sheriff.gold -= totalPenalty;
      merchant.gold += totalPenalty;
      merchant.stall.push(...merchant.bag);
      merchant.bag = [];
    } else {

      // ✅ NEW: event log for catching contraband
      this.logEvent(`${sheriff.name} inspected ${merchant.name}'s bag and caught contraband!`);

      const remainingBag = [];
      merchant.bag.forEach(card => {
        const isIllegal = card.type === 'contraband' || card.name !== friendlyName(merchant.declaredGood);
        if (isIllegal) {
          merchant.gold -= card.penalty;
          sheriff.gold += card.penalty;
          this.discard.push(card);
        } else {
          remainingBag.push(card);
        }
      });
      merchant.stall.push(...remainingBag);
      merchant.bag = [];
    }

    merchant.declaredGood = null;
    merchant.declaredCount = 0;
  }

  letBagPass(merchant) {
    merchant.stall.push(...merchant.bag);
    merchant.bag = [];
    merchant.declaredGood = null;
    merchant.declaredCount = 0;
  }

  endRoundOrGame() {
    this.round += 1;
    this.sheriffIndex = (this.sheriffIndex + 1) % this.players.length;

     this.logEvent(`Round ${this.round} begins. Sheriff is ${this.currentSheriff().name}.`);

    if (this.round > this.maxRounds) {
      this.phase = PHASES.END;
      this.finalScores = this.computeScores();   // <--- compute final scores here
    } else {
  this.phase = PHASES.MARKET;

  // reset bribe-related state for new round
  this.bribes = {};
  this.bribeResults = {};
  this.pendingInspections = new Set();

  // Refill hands to 6
  this.players.forEach(p => {
    const needed = 6 - p.hand.length;
    if (needed > 0) this.drawCards(p, needed);
         });
    }
  }

  // FINAL SCORING:
  // total = gold + value of all goods in stall + king/queen bonuses
  // with proper king/queen handling per legal good (ties share bonuses)
  computeScores() {
    const playerStats = new Map();

    // Base stats: gold + goods value + counts of each legal good
    this.players.forEach(p => {
      const stats = {
        id: p.id,
        name: p.name,
        gold: p.gold,
        goodsValue: 0,
        bonus: 0,
        bonusesDetail: [],
        legalCounts: {}
      };
      LEGAL_GOODS.forEach(g => {
        stats.legalCounts[g.id] = 0;
      });

      p.stall.forEach(card => {
        stats.goodsValue += card.value;
        const gid = card.typeId;
        if (gid && LEGAL_GOODS_BY_ID[gid]) {
          stats.legalCounts[gid] = (stats.legalCounts[gid] || 0) + 1;
        }
      });

      playerStats.set(p.id, stats);
    });

    // King / Queen bonuses for each legal good
    LEGAL_GOODS.forEach(good => {
      const goodId = good.id;
      const kingBonus = good.kingBonus || 0;
      const queenBonus = good.queenBonus || 0;

      const counts = this.players.map(p => {
        const s = playerStats.get(p.id);
        return {
          playerId: p.id,
          name: p.name,
          count: s.legalCounts[goodId] || 0
        };
      });

      counts.sort((a, b) => b.count - a.count);
      const maxCount = counts[0]?.count || 0;
      if (maxCount === 0) return; // nobody has this good

      const kingCandidates = counts.filter(c => c.count === maxCount);

      if (kingCandidates.length > 1) {
        // tie for king: split king+queen; no separate queen
        const share = Math.floor((kingBonus + queenBonus) / kingCandidates.length);
        if (share > 0) {
          kingCandidates.forEach(c => {
            const s = playerStats.get(c.playerId);
            s.bonus += share;
            s.bonusesDetail.push(`${good.name} King tie (+${share})`);
          });
        }
        return;
      }

      // single king
      const king = kingCandidates[0];
      if (kingBonus > 0) {
        const sK = playerStats.get(king.playerId);
        sK.bonus += kingBonus;
        sK.bonusesDetail.push(`${good.name} King (+${kingBonus})`);
      }

      // queen
      const remaining = counts.filter(c => c.playerId !== king.playerId && c.count > 0);
      if (!remaining.length || queenBonus <= 0) return;

      const secondCount = remaining[0].count;
      const queenCandidates = remaining.filter(c => c.count === secondCount);
      const shareQ = Math.floor(queenBonus / queenCandidates.length);
      if (shareQ > 0) {
        queenCandidates.forEach(c => {
          const sQ = playerStats.get(c.playerId);
          sQ.bonus += shareQ;
          sQ.bonusesDetail.push(`${good.name} Queen${queenCandidates.length > 1 ? ' tie' : ''} (+${shareQ})`);
        });
      }
    });

    // Build final sorted list
    const scores = Array.from(playerStats.values()).map(s => ({
      id: s.id,
      name: s.name,
      gold: s.gold,
      goodsValue: s.goodsValue,
      bonus: s.bonus,
      total: s.gold + s.goodsValue + s.bonus,
      bonusesDetail: s.bonusesDetail
    }));

    scores.sort((a, b) => b.total - a.total);
    return scores;
  }

  addChatMessage(playerId, text) {
    const p = this.getPlayer(playerId);
    if (!p) return;
    const msg = {
      from: p.name,
      text: text.slice(0, 300),
      ts: Date.now()
    };
    this.chat.push(msg);
    if (this.chat.length > 50) {
      this.chat.shift();
    }
  }

  buildViewFor(playerId) {
    const self = this.getPlayer(playerId);
    if (!self) return null;
    const sheriff = this.currentSheriff();
    const isSheriffView = sheriff && sheriff.id === playerId;

    return {
      roomId: this.id,
      phase: this.phase,
      round: this.round,
      maxRounds: this.maxRounds,
      sheriffId: sheriff ? sheriff.id : null,
      sheriffName: sheriff ? sheriff.name : null,
      leaderId: this.leaderId,
      self: {
        id: self.id,
        name: self.name,
        gold: self.gold,
        hand: self.hand,
        stall: self.stall,
        bag: self.bag,
        declaredGood: self.declaredGood,
        declaredCount: self.declaredCount,
        ready: self.ready
      },
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        gold: p.gold,
        stallCount: p.stall.length,
        isSheriff: sheriff && sheriff.id === p.id,
        isSelf: p.id === self.id,
        ready: p.ready,
        // show declaredGood / declaredCount to:
        //  - the sheriff (for everyone)
        //  - the player themselves (so they see what they claimed)
        declaredGood: (isSheriffView || p.id === self.id) ? p.declaredGood : null,
        declaredCount: (isSheriffView || p.id === self.id) ? p.declaredCount : 0
        })),
      chat: this.chat,
      pendingInspections: Array.from(this.pendingInspections || []),
      finalScores: this.finalScores,  // <--- send scores to client when game is over
      bribes: this.bribes,
      bribeResults: this.bribeResults,
      events: this.events.slice(-15)  // last 15 events
    };
  }
}

function friendlyName(typeId) {
  switch (typeId) {
    case 'apple': return 'Apple';
    case 'cheese': return 'Cheese';
    case 'bread': return 'Bread';
    case 'chicken': return 'Chicken';
    default: return '';
  }
}

module.exports = {
  GameRoom,
  PHASES
};
