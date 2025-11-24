# Market Bluff (Multiplayer Web Game)

A real-time, browser-based multiplayer bluffing and inspection card game.  
Players take turns acting as the inspector while others act as traders, secretly loading goods into their bags, declaring what they *claim* to be carrying, and negotiating with bribes and threats of inspection.

This project was built as a personal learning project for:

- Real-time multiplayer using websockets
- Basic game state management on the server
- Interactive UI/UX in the browser

---

## Tech Stack

- **Node.js** + **Express** – HTTP server and static file hosting  
- **Socket.IO** – realtime communication between server and clients  
- **Vanilla JS / HTML / CSS** – front-end UI  
- No database required; all game state is kept in memory on the server.

---

## Features

- Create and join rooms via a short room code
- Turn-based rounds with rotating inspector
- Card system with:
  - Legal and contraband goods
  - Gold value and penalty values
- Bag declaration: traders choose which cards to load and what they claim
- Bribery and negotiation:
  - Traders can offer gold bribes with optional messages
  - Inspector can accept or reject bribes
  - Explicit “back down” option for traders
- Inspection and scoring flow:
  - Inspector may inspect or let traders pass
  - End-of-game scoring with gold + goods
- Configurable number of rounds
- Basic reconnection support (return to a running game if you reload)

---

## Running Locally

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- npm (installed with Node)

### Install dependencies

```bash
npm install
