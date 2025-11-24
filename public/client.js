// public/client.js

const socket = io();

let currentState = null;
let selectedHandCards = new Set();
let currentRoomId = null;
let nameInput, roomCodeInput, createBtn, joinBtn, loginError;
let loginScreen, gameScreen;
let playersList, roomIdEl, roundEl, maxRoundsEl, sheriffNameEl, selfNameEl, selfRoleEl, selfGoldEl;
let phaseBanner, phaseContent, handContainer, stallContainer;
let chatMessagesEl, chatInputEl, chatSendBtn, readyBtn, startBtn;

function iconForGood(typeId) {
  switch (typeId) {
    case 'apple': return '🍎';
    case 'cheese': return '🧀';
    case 'bread': return '🍞';
    case 'chicken': return '🐔';
    case 'pepper': return '🌶️';
    case 'silk': return '🧵';
    case 'mead': return '🍺';
    case 'crossbow': return '🏹';
    default: return '📦';
  }
}

function prettyGoodName(id) {
  if (!id) return '';
  return id[0].toUpperCase() + id.slice(1);
}


document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  attachLoginHandlers();
  attachChatHandlers();
  // tryAutoReconnect(); // ❌ disable automatic reconnect
});

function setupReconnectButton() {
  const btn = document.getElementById('reconnect-btn');
  if (!btn) return;

  let roomId, name;
  try {
    roomId = localStorage.getItem('sheriff-room');
    name = localStorage.getItem('sheriff-name');
  } catch (e) {}

  if (!roomId || !name) return; // nothing to reconnect to

  btn.style.display = 'inline-block';
  btn.onclick = () => {
    socket.emit('reconnectToRoom', { roomId, name });
  };
}

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  attachLoginHandlers();
  attachChatHandlers();
  setupReconnectButton();   // instead of tryAutoReconnect()
});

function tryAutoReconnect() {
  try {
    const roomId = localStorage.getItem('sheriff-room');
    const name = localStorage.getItem('sheriff-name');
    if (roomId && name) {
      socket.emit('reconnectToRoom', { roomId, name });
    }
  } catch (e) {
    // ignore
  }
}

socket.on('reconnectResult', (res) => {
  if (!res.ok) {
    // if reconnection failed, clear saved info so it doesn't spam reconnect
    try {
      localStorage.removeItem('sheriff-room');
      localStorage.removeItem('sheriff-name');
    } catch (e) {}
    // we just stay on the login screen
    console.log('Reconnection failed:', res.reason);
  } else {
    console.log('Reconnected successfully');
    // stateUpdate will arrive right after from server, which will switch UI to game screen
  }
});

function cacheElements() {
  loginScreen = document.getElementById('login-screen');
  gameScreen = document.getElementById('game-screen');
  nameInput = document.getElementById('name-input');
  roomCodeInput = document.getElementById('room-code-input');
  createBtn = document.getElementById('create-room-btn');
  joinBtn = document.getElementById('join-room-btn');
  loginError = document.getElementById('login-error');

  playersList = document.getElementById('players-list');
  roomIdEl = document.getElementById('room-id');
  roundEl = document.getElementById('round-number');
  maxRoundsEl = document.getElementById('max-rounds');
  sheriffNameEl = document.getElementById('sheriff-name');
  selfNameEl = document.getElementById('self-name');
  selfRoleEl = document.getElementById('self-role');
  selfGoldEl = document.getElementById('self-gold');

  phaseBanner = document.getElementById('phase-banner');
  phaseContent = document.getElementById('phase-content');
  handContainer = document.getElementById('hand-cards');
  stallContainer = document.getElementById('stall-cards');
  chatMessagesEl = document.getElementById('chat-messages');
  chatInputEl = document.getElementById('chat-input');
  chatSendBtn = document.getElementById('chat-send-btn');
  readyBtn = document.getElementById('ready-btn');
  startBtn = document.getElementById('start-btn');
}

function attachLoginHandlers() {
  createBtn.onclick = () => {
    const name = (nameInput.value || '').trim() || 'Player';
    socket.emit('createRoom', { name });
  };

  joinBtn.onclick = () => {
    const name = (nameInput.value || '').trim() || 'Player';
    const code = (roomCodeInput.value || '').trim().toUpperCase();
    if (!code) {
      loginError.textContent = 'Enter a room code';
      return;
    }
    socket.emit('joinRoom', { roomId: code, name });
  };
}

function attachChatHandlers() {
  chatSendBtn.onclick = sendChat;
  chatInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
  });
}

function sendChat() {
  const text = (chatInputEl.value || '').trim();
  if (!text || !currentState) return;
  socket.emit('chatMessage', { roomId: currentState.roomId, text });
  chatInputEl.value = '';
}

// Socket listeners

socket.on('errorMessage', (msg) => {
  console.error(msg);
  loginError.textContent = msg;
});

socket.on('stateUpdate', (state) => {
  currentState = state;
  currentRoomId = state.roomId;

  // save for reconnection
  try {
    localStorage.setItem('sheriff-room', state.roomId);
    localStorage.setItem('sheriff-name', state.self.name);
  } catch (e) {
    // ignore if storage is unavailable
  }

  renderGame(state);
});

// Render

function renderGame(state) {
  loginScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  roomIdEl.textContent = state.roomId;
  roundEl.textContent = state.round;
  maxRoundsEl.textContent = state.maxRounds;
  sheriffNameEl.textContent = state.sheriffName || 'TBD';
  selfNameEl.textContent = state.self.name;
  selfGoldEl.textContent = state.self.gold;

  const isSheriff = state.self.id === state.sheriffId;
  selfRoleEl.textContent = isSheriff ? 'Sheriff' : 'Merchant';

  // lobby controls visibility
  if (state.phase === 'lobby') {
    readyBtn.classList.remove('hidden');
    startBtn.classList.remove('hidden');
  } else {
    readyBtn.classList.add('hidden');
    startBtn.classList.add('hidden');
  }

  readyBtn.onclick = () => {
    socket.emit('toggleReady', { roomId: state.roomId });
  };

  startBtn.onclick = () => {
    socket.emit('startGame', { roomId: state.roomId });
  };

  renderPlayers(state);
  renderEventLog(state);
  renderPhase(state);
    if (state.phase === 'end') {
    try {
        localStorage.removeItem('sheriff-room');
        localStorage.removeItem('sheriff-name');
    } catch (e) {}
    }
  renderCards(state);
  renderChat(state);
}

function renderPlayers(state) {
  playersList.innerHTML = '';
  state.players.forEach(p => {
    const li = document.createElement('li');
    if (p.isSelf) li.classList.add('self');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = p.name + ` (${p.gold}g)`;

    const rightSpan = document.createElement('span');
    if (p.isSheriff) {
      const badge = document.createElement('span');
      badge.textContent = 'Sheriff';
      badge.classList.add('badge');
      rightSpan.appendChild(badge);
    } else {
      const stallInfo = document.createElement('span');
      stallInfo.textContent = `${p.stallCount} goods`;
      rightSpan.appendChild(stallInfo);
    }

    if (state.phase === 'lobby') {
      const readyBadge = document.createElement('span');
      readyBadge.textContent = p.ready ? 'Ready' : 'Not Ready';
      readyBadge.classList.add('badge');
      readyBadge.style.marginLeft = '0.3rem';
      rightSpan.appendChild(readyBadge);
    }

    li.appendChild(nameSpan);
    li.appendChild(rightSpan);
    playersList.appendChild(li);
  });
}

function renderEventLog(state) {
  const panel = document.getElementById('players-panel');
  if (!panel) return;

  let existing = document.getElementById('event-log');
  if (existing) existing.remove();

  const log = document.createElement('div');
  log.id = 'event-log';
  log.innerHTML = `<h4>Events</h4>`;

  const list = document.createElement('ul');
  list.style.listStyle = 'none';
  list.style.paddingLeft = '0';
  list.style.margin = '0';

  (state.events || []).forEach(ev => {
    const li = document.createElement('li');
    li.style.fontSize = '0.8rem';
    li.style.opacity = '0.9';
    li.style.marginBottom = '0.25rem';
    li.textContent = ev.text;
    list.appendChild(li);
  });

  log.appendChild(list);
  panel.appendChild(log);
}



function renderPhase(state) {
  const phase = state.phase;
  let text = '';
  if (phase === 'lobby') text = 'Lobby: toggle Ready. Leader starts when everyone is ready (min 3 players).';
  if (phase === 'market') text = 'Market Phase: adjust your hand, then click "Done with Market".';
  if (phase === 'packing') text = 'Packing Phase: select cards for your bag and declare one legal good.';
  if (phase === 'inspection') text = 'Inspection Phase: Sheriff chooses to inspect or let merchants pass.';
  if (phase === 'end') text = 'Game Over: check final scores below.';

  phaseBanner.textContent = text;
  phaseContent.innerHTML = '';

  if (phase === 'lobby') {
    renderLobbyControls(state);
  } else if (phase === 'market') {
    renderMarketControls(state);
  } else if (phase === 'packing') {
    renderPackingControls(state);
  } else if (phase === 'inspection') {
    renderInspectionControls(state);
  } else if (phase === 'end') {
    renderEndScores(state);
  }
}

function renderLobbyControls(state) {
  const container = document.createElement('div');
  const isLeader = state.self.id === state.leaderId;

  // Rounds UI
  let roundsHtml;
  if (isLeader) {
    roundsHtml = `
      <div class="rounds-config">
        <label for="rounds-input">Rounds:</label>
        <input id="rounds-input"
               type="number"
               min="1"
               max="10"
               value="${state.maxRounds}"
               style="width:60px; margin-left:0.5rem;">
      </div>
    `;
  } else {
    roundsHtml = `<p>Rounds: <strong>${state.maxRounds}</strong></p>`;
  }

  // Players list
  let playersHtml = '<h4>Players</h4><ul class="player-list">';
  state.players.forEach(p => {
    const youTag = p.isSelf ? ' (you)' : '';
    const leaderTag = p.id === state.leaderId ? ' [Leader]' : '';
    const readyTag = p.ready ? ' ✅ Ready' : ' ⏳ Not ready';
    playersHtml += `<li>${p.name}${youTag}${leaderTag} - ${readyTag}</li>`;
  });
  playersHtml += '</ul>';

  container.innerHTML = `
    ${roundsHtml}
    ${playersHtml}
  `;

  // Ready / Unready button
  const readyBtn = document.createElement('button');
  readyBtn.textContent = state.self.ready ? 'Unready' : 'Ready';
  readyBtn.onclick = () => {
    socket.emit('toggleReady', { roomId: state.roomId });
  };
  container.appendChild(readyBtn);

  // Start Game button for leader
  if (isLeader) {
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Game';
    startBtn.style.marginLeft = '0.5rem';
    const everyoneReady = state.players.every(p => p.ready);
    const enoughPlayers = state.players.length >= 3;
    startBtn.disabled = !(everyoneReady && enoughPlayers);
    startBtn.onclick = () => {
      socket.emit('startGame', { roomId: state.roomId });
    };
    container.appendChild(startBtn);
  }

  phaseContent.appendChild(container);

  // Wire rounds input → setMaxRounds
  if (isLeader) {
    const roundsInput = document.getElementById('rounds-input');
    if (roundsInput) {
      roundsInput.onchange = () => {
        const value = parseInt(roundsInput.value, 10);
        if (!value || value < 1 || value > 10) return;
        socket.emit('setMaxRounds', {
          roomId: state.roomId,
          value
        });
      };
    }
  }
}


function renderMarketControls(state) {
  const container = document.createElement('div');
  container.innerHTML = `
    <p>For now, market phase is simplified: click "Done" to continue (hands auto-refilled between rounds).</p>
  `;
  const btn = document.createElement('button');
  btn.textContent = 'Done with Market';
  btn.onclick = () => {
    socket.emit('marketDone', { roomId: state.roomId });
  };
  container.appendChild(btn);
  phaseContent.appendChild(container);
}

function renderPackingControls(state) {
  if (state.self.id === state.sheriffId) {
    const info = document.createElement('p');
    info.textContent = 'You are the Sheriff. Wait for merchants to pack their bags.';
    phaseContent.appendChild(info);
    return;
  }
  const container = document.createElement('div');
  const label = document.createElement('p');
  label.textContent = 'Select 1–5 cards from your hand as your bag, then declare ONE legal good type.';
  container.appendChild(label);

  const select = document.createElement('select');
  ['apple', 'cheese', 'bread', 'chicken'].forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id[0].toUpperCase() + id.slice(1);
    select.appendChild(opt);
  });

  const btn = document.createElement('button');
  btn.textContent = 'Submit Bag';
  btn.onclick = () => {
    const cardIds = Array.from(selectedHandCards);
    if (cardIds.length === 0 || cardIds.length > 5) {
      alert('Select between 1 and 5 cards.');
      return;
    }
    socket.emit('setBag', {
      roomId: state.roomId,
      cardIds,
      declaredGood: select.value
    });
    selectedHandCards.clear();
  };

  container.appendChild(select);
  container.appendChild(btn);
  phaseContent.appendChild(container);
}

function renderInspectionControls(state) {
  const container = document.createElement('div');

  // Sheriff view
  if (state.self.id === state.sheriffId) {
  container.innerHTML = `<p>You are the Sheriff. Review bribes or inspect.</p>`;

  const list = document.createElement('div');

  state.players.forEach(p => {
    if (p.id === state.sheriffId) return;

    const row = document.createElement('div');
    row.style.marginBottom = '0.5rem';

    const bribe = state.bribes && state.bribes[p.id];
    const result = state.bribeResults && state.bribeResults[p.id];
    const pending = (state.pendingInspections || []).includes(p.id);

    // NEW: claimed content
    let claimText = '';
    if (p.declaredCount && p.declaredGood) {
      claimText = ` (claims ${p.declaredCount}× ${prettyGoodName(p.declaredGood)})`;
    }

    // ---- existing logic, now augmented with claimText ----
    if (!pending) {
      let text = `<strong>${p.name}</strong>${claimText} ✓ `;

      if (result?.status === 'accepted') {
        text += `Bribe accepted (${result.amount}g). Bag passed safely.`;
      } else if (result?.status === 'rejected') {
        text += `Resolved after inspection / rejecting bribe.`;
      } else if (result?.status === 'back_down') {
        text += `Backed down from bribing; decision completed.`;
      } else if (result?.status === 'passed') {
        text += `Let pass without bribe. Bag passed safely.`;
      } else {
        text += `Resolved.`;
      }

      row.innerHTML = text;
      list.appendChild(row);
      return;
    }

    if (bribe) {
      row.innerHTML = `
        <strong>${p.name}</strong>${claimText} offers <strong>${bribe.amount}g</strong>
        ${bribe.message ? `with a message: "${bribe.message}"` : ""}
      `;
      // ... keep your existing Accept / Reject buttons here ...
      // (no change except the claimText insertion)
      const acceptBtn = document.createElement('button');
      acceptBtn.textContent = 'Accept';
      acceptBtn.style.marginLeft = '0.5rem';
      acceptBtn.onclick = () => {
        socket.emit('acceptBribe', {
          roomId: state.roomId,
          merchantId: p.id
        });
      };

      const rejectBtn = document.createElement('button');
      rejectBtn.textContent = 'Reject';
      rejectBtn.style.marginLeft = '0.25rem';
      rejectBtn.onclick = () => {
        socket.emit('rejectBribe', {
          roomId: state.roomId,
          merchantId: p.id
        });
      };

      row.appendChild(acceptBtn);
      row.appendChild(rejectBtn);
    } else {
      let prefix = `<strong>${p.name}</strong>${claimText}`;
      if (result?.status === 'rejected') {
        prefix += ` (last bribe of ${result.amount}g rejected)`;
      } else if (result?.status === 'back_down') {
        prefix += ` (backed down from bribing)`;
      }
      row.innerHTML = prefix;

      const inspectBtn = document.createElement('button');
      inspectBtn.textContent = 'Inspect';
      inspectBtn.style.marginLeft = '0.5rem';
      inspectBtn.onclick = () => {
        socket.emit('sheriffDecision', {
          roomId: state.roomId,
          merchantId: p.id,
          action: 'inspect'
        });
      };

      const passBtn = document.createElement('button');
      passBtn.textContent = 'Let Pass';
      passBtn.style.marginLeft = '0.25rem';
      passBtn.onclick = () => {
        socket.emit('sheriffDecision', {
          roomId: state.roomId,
          merchantId: p.id,
          action: 'let_pass'
        });
      };

      row.appendChild(inspectBtn);
      row.appendChild(passBtn);
    }

    list.appendChild(row);
  });

  container.appendChild(list);
    } else {
    // Merchant view
    const myId = state.self.id;
    const myBribe = state.bribes && state.bribes[myId];
    const myResult = state.bribeResults && state.bribeResults[myId];
    const stillPending = (state.pendingInspections || []).includes(myId);
    const myClaim =
  state.self.declaredGood && state.self.declaredCount
    ? `You claimed <strong>${state.self.declaredCount}× ${prettyGoodName(state.self.declaredGood)}</strong> in your bag.`
    : '';

    // If sheriff has already finished with us
    if (!stillPending && myResult && myResult.status === 'accepted') {
      container.innerHTML = `
        <p>The Sheriff accepted your bribe of <strong>${myResult.amount}g</strong>.
        Your bag passed safely!</p>
      `;
    } else if (!stillPending && myResult && myResult.status === 'rejected') {
      container.innerHTML = `
        <p>The Sheriff rejected your bribe of <strong>${myResult.amount}g</strong>
        and has already resolved your bag.</p>
      `;
    } else if (!stillPending && myResult && myResult.status === 'back_down') {
      container.innerHTML = `
        <p>You backed down from bribing and the Sheriff has resolved your bag.</p>
      `;
    } else if (!stillPending && myResult && myResult.status === 'passed') {
      container.innerHTML = `
        <p>The Sheriff let your bag pass safely without a bribe.</p>
      `;
    } else if (myBribe) {
      // We have an active bribe waiting on sheriff
      container.innerHTML = `
        <p>You offered a bribe of <strong>${myBribe.amount}g</strong>.
        Waiting for the Sheriff to accept or reject...</p>
      `;

    } else {
      // No active bribe → can make one or back down
      let prefix = `<p>The Sheriff is deciding your fate. Offer a bribe or back down?</p>`;
      
      if (myResult && myResult.status === 'rejected') {
        prefix = `
          <p>The Sheriff rejected your last bribe of <strong>${myResult.amount}g</strong>.
          You can try another offer or back down and wait.</p>
        `;
      } else if (myResult && myResult.status === 'back_down') {
        prefix = `
          <p>You backed down from bribing. You can stay quiet or change your mind and make an offer.</p>
        `;
      }

            container.innerHTML = `
        ${prefix}   <!-- this prints your two lines of text -->
                <p style="font-size:0.85rem; opacity:0.85;">${myClaim}</p>
        <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
            <input id="bribe-amount" type="number" min="1" max="${state.self.gold}"
                placeholder="Gold..." style="width:80px; padding:0.3rem;">
            <input id="bribe-msg" type="text" placeholder="Optional message..."
                style="flex:1; padding:0.3rem;">
            <button id="offer-bribe-btn">Offer Bribe</button>
            <button id="back-down-btn" type="button">Back Down</button>
        </div>
        `;

      setTimeout(() => {
        const amountEl = document.getElementById('bribe-amount');
        const msgEl = document.getElementById('bribe-msg');
        const offerBtn = document.getElementById('offer-bribe-btn');
        const backDownBtn = document.getElementById('back-down-btn');

        if (offerBtn) {
          offerBtn.onclick = () => {
            const amount = parseInt(amountEl.value);
            const message = msgEl.value;

            if (!amount || amount <= 0) {
              alert('Enter a valid gold amount.');
              return;
            }
            if (amount > state.self.gold) {
              alert("You don't have that much gold!");
              return;
            }

            socket.emit('offerBribe', {
              roomId: state.roomId,
              amount,
              message
            });
          };
        }

        if (backDownBtn) {
          backDownBtn.onclick = () => {
            socket.emit('backDown', {
              roomId: state.roomId
            });
          };
        }
      });
    }
  }

  phaseContent.appendChild(container);
}

function renderEndScores(state) {
  const container = document.createElement('div');
  container.innerHTML = '<h3>Final Scores</h3>';

  const scores = state.finalScores || [];
  if (!scores.length) {
    const p = document.createElement('p');
    p.textContent = 'No scores available.';
    container.appendChild(p);
    phaseContent.appendChild(container);
    return;
  }

  const table = document.createElement('table');
  table.classList.add('scores-table');

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Rank', 'Player', 'Gold', 'Goods', 'Bonus', 'Total'].forEach(label => {
    const th = document.createElement('th');
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  scores.forEach((s, idx) => {
    const tr = document.createElement('tr');
    const cells = [idx + 1, s.name, s.gold, s.goodsValue, s.bonus, s.total];
    cells.forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });

    if (s.bonusesDetail && s.bonusesDetail.length) {
      tr.title = s.bonusesDetail.join(', ');
    }

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.appendChild(table);

  const hint = document.createElement('p');
  hint.style.marginTop = '0.5rem';
  hint.style.fontSize = '0.8rem';
  hint.textContent = 'Hover over a row to see king/queen bonus details.';
  container.appendChild(hint);

  phaseContent.appendChild(container);
}


function renderCards(state) {
  handContainer.innerHTML = '';
  stallContainer.innerHTML = '';

  const isPacking = state.phase === 'packing' && state.self.id !== state.sheriffId;

  // Hand cards
  state.self.hand.forEach(card => {
    const el = document.createElement('div');
    el.classList.add('game-card');
    el.classList.add(card.type === 'legal' ? 'legal' : 'contraband');

    const emoji = iconForGood(card.typeId);
    const typeLabel = card.type === 'legal' ? 'Legal' : 'Contraband';

    el.innerHTML = `
  <div class="card-header">
    <span class="card-emoji">${emoji}</span>
    <span class="card-title">${card.name}</span>
  </div>
  <div class="card-footer">
    <span class="card-type-pill">${typeLabel}</span>
    <span class="card-value-pill">${card.value}g</span>
    <span class="card-penalty-pill">⚖ ${card.penalty}g</span>
  </div>
`;

// Nice tooltip on hover:
el.title = `Value: ${card.value}g · Penalty: ${card.penalty}g`;


    if (isPacking) {
      el.onclick = () => {
        if (selectedHandCards.has(card.cardId)) {
          selectedHandCards.delete(card.cardId);
          el.classList.remove('selected');
        } else {
          if (selectedHandCards.size >= 5) {
            alert('Max 5 cards in bag');
            return;
          }
          selectedHandCards.add(card.cardId);
          el.classList.add('selected');
        }
      };
    } else {
      el.onclick = null;
    }

    handContainer.appendChild(el);
  });

  // Stall cards
  state.self.stall.forEach(card => {
    const el = document.createElement('div');
    el.classList.add('game-card');
    el.classList.add(card.type === 'legal' ? 'legal' : 'contraband');

    const emoji = iconForGood(card.typeId);
    const typeLabel = card.type === 'legal' ? 'Legal' : 'Contraband';

    el.innerHTML = `
  <div class="card-header">
    <span class="card-emoji">${emoji}</span>
    <span class="card-title">${card.name}</span>
  </div>
  <div class="card-footer">
    <span class="card-type-pill">${typeLabel}</span>
    <span class="card-value-pill">${card.value}g</span>
    <span class="card-penalty-pill">⚖ ${card.penalty}g</span>
  </div>
`;

el.title = `Value: ${card.value}g · Penalty: ${card.penalty}g`;


    stallContainer.appendChild(el);
  });
}


function renderChat(state) {
  chatMessagesEl.innerHTML = '';
  state.chat.forEach(msg => {
    const div = document.createElement('div');
    div.classList.add('chat-message');
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('name');
    nameSpan.textContent = msg.from + ': ';
    const textSpan = document.createElement('span');
    textSpan.textContent = msg.text;
    div.appendChild(nameSpan);
    div.appendChild(textSpan);
    chatMessagesEl.appendChild(div);
  });
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}
