// game/GameManager.js

const { GameRoom } = require('./GameRoom');

class GameManager {
  constructor() {
    this.rooms = new Map(); // roomId -> GameRoom
  }

  createRoom() {
    let id;
    do {
      id = Math.random().toString(36).substring(2, 6).toUpperCase();
    } while (this.rooms.has(id));
    const room = new GameRoom(id);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id) {
    return this.rooms.get(id);
  }

  joinRoom(roomId, socketId, name) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    return room.addPlayer(socketId, name);
  }
  

  removePlayerFromAll(socketId) {
    for (const room of this.rooms.values()) {
      room.removePlayer(socketId);
      if (room.players.length === 0) {
        this.rooms.delete(room.id);
      }
    }
  }

    disconnectPlayerFromAll(socketId) {
    for (const room of this.rooms.values()) {
        room.disconnectPlayer(socketId);
        // we keep empty rooms cleanup behavior optional; for now, do nothing
    }
    }

}

module.exports = GameManager;
