// server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const GameManager = require('./game/GameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const gameManager = new GameManager();

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  socket.on('createRoom', ({ name }) => {
    const room = gameManager.createRoom();
    const player = room.addPlayer(socket.id, name || 'Player');
    socket.join(room.id);
    sendStateToRoom(room.id);
  });

    socket.on('reconnectToRoom', ({ roomId, name }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) {
        socket.emit('reconnectResult', { ok: false, reason: 'room_not_found' });
        return;
    }

    const player = room.reconnectPlayerByName(name, socket.id);
    if (!player) {
        socket.emit('reconnectResult', { ok: false, reason: 'player_not_found' });
        return;
    }

    socket.join(room.id);
    sendStateToRoom(room.id);
    socket.emit('reconnectResult', { ok: true });
    });

  socket.on('joinRoom', ({ roomId, name }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) {
      socket.emit('errorMessage', 'Room not found');
      return;
    }
    const player = room.addPlayer(socket.id, name || 'Player');
    if (!player) {
      socket.emit('errorMessage', 'Unable to join room');
      return;
    }
    socket.join(room.id);
    sendStateToRoom(room.id);
  });

  socket.on('toggleReady', ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.toggleReady(socket.id);
    sendStateToRoom(room.id);
  });

  socket.on('startGame', ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    if (!room.canStart(socket.id)) {
      socket.emit('errorMessage', 'Cannot start game yet');
      return;
    }
    room.startGame();
    sendStateToRoom(room.id);
  });

    socket.on('setMaxRounds', ({ roomId, value }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.setMaxRounds(socket.id, value);
    sendStateToRoom(roomId);
    });

  socket.on('marketDone', ({ roomId }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.finishMarketForPlayer(socket.id);
    sendStateToRoom(room.id);
  });

  socket.on('setBag', ({ roomId, cardIds, declaredGood }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.setBag(socket.id, cardIds, declaredGood);
    sendStateToRoom(room.id);
  });

  socket.on('sheriffDecision', ({ roomId, merchantId, action }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.sheriffDecision(socket.id, merchantId, action);
    sendStateToRoom(room.id);
  });

  socket.on('offerBribe', ({ roomId, amount, message }) => {
  const room = gameManager.getRoom(roomId);
  if (!room) return;
  room.offerBribe(socket.id, amount, message);
  sendStateToRoom(roomId);
    });

    socket.on('acceptBribe', ({ roomId, merchantId }) => {
  const room = gameManager.getRoom(roomId);
  if (!room) return;
  room.acceptBribe(socket.id, merchantId);
  sendStateToRoom(roomId);
    });

    socket.on('rejectBribe', ({ roomId, merchantId }) => {
  const room = gameManager.getRoom(roomId);
  if (!room) return;
  room.rejectBribe(socket.id, merchantId);
  sendStateToRoom(roomId);
    });

    socket.on('backDown', ({ roomId }) => {
  const room = gameManager.getRoom(roomId);
  if (!room) return;
  room.backDown(socket.id);
  sendStateToRoom(roomId);
    });


  socket.on('chatMessage', ({ roomId, text }) => {
    const room = gameManager.getRoom(roomId);
    if (!room) return;
    room.addChatMessage(socket.id, text);
    sendStateToRoom(room.id);
  });

  socket.on('disconnect', () => {
  console.log('Disconnected:', socket.id);
  gameManager.disconnectPlayerFromAll(socket.id);
    });
});

function sendStateToRoom(roomId) {
  const room = gameManager.getRoom(roomId);
  if (!room) return;
  room.players.forEach(p => {
    const view = room.buildViewFor(p.id);
    if (view) {
      io.to(p.id).emit('stateUpdate', view);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
