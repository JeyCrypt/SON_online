// game/Player.js

class Player {
  constructor(socketId, name) {
    this.id = socketId;
    this.name = name;
    this.gold = 50; // starting gold
    this.hand = [];
    this.stall = [];
    this.bag = [];
    this.declaredGood = null;
    this.declaredCount = 0;
    this.ready = false;
    this.connected = true;
  }
}

module.exports = Player;
