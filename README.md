# 🏎️ WebSocket Racing - Online Two-Player Game

This is a fun, simple online two-player racing game built with WebSockets, HTML Canvas, and Node.js.

## 🎮 How to Play

### 1. **🚦 Starting the Server:**
- Make sure you have [Node.js](https://nodejs.org/) installed.
- Open your terminal and navigate to the project folder (`websocket-race-game`).
- Install dependencies: `npm install`
- Start the server: `node server.js`
- The server runs by default on port `8080`.

### 2. **🔗 Connecting Players:**
- Open `public/index.html` in your web browser (double-click the file or use a local web server). The game attempts to connect to `ws://localhost:8080`.
- Open the same address in another browser window or on another computer within the same network.
- The game supports exactly two players. The first connected player will be blue, the second one red.

### 3. **⚙️ Game Setup:**
- Once both players connect, Player 1 (blue) will set the number of laps (1-10). The default number is 3 laps.
- A short countdown (3 seconds) begins after confirming the number of laps.

### 4. **🎮 Controls:**
- Use these keys to control your vehicle:
  - **Arrow UP / W:** Accelerate
  - **Arrow DOWN / S:** Brake / Reverse
  - **Arrow LEFT / A:** Steer Left
  - **Arrow RIGHT / D:** Steer Right

### 5. **🏁 Objective:**
- Complete the set number of laps as quickly as possible.
- The track is elliptical. A lap counts when passing the start/finish line (white line) in the correct direction (counter-clockwise, starting on the right side).

### 6. **🚧 Rules & Penalties:**
- **Wide Track:** The track (grey area) is wide enough for overtaking.
- **Off-track Penalty:** Leaving the grey track area significantly slows down your car for a short time. An orange border around your car indicates this penalty.
- **Rear-end Collision Penalty:** Colliding with your opponent from behind triggers a significant slowdown penalty. Overtake safely! Side or frontal collisions aren't penalized but will slow you down.

### 7. **🏅 End of the Game:**
- The game ends when both players complete the set laps.
- Final lap times for both players are displayed after finishing.
- If a player disconnects mid-race, the game immediately ends.
- The server automatically resets approximately 10 seconds after displaying results, preparing for the next race (players must reconnect by reopening `index.html`).

## 🚀 Technologies

- **Backend:** Node.js, `ws` (WebSocket library)
- **Frontend:** HTML, CSS, JavaScript (Canvas API for graphics)
- **Communication:** WebSockets

Good luck and have fun racing! 🏁🎉

