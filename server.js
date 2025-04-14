// server.js
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

// --- Constants for game settings ---
const trackWidthValue = 100;
const trackCenterXValue = 400;
const trackCenterYValue = 300;
const trackRadiusXValue = 250; // Horizontal radius
const trackRadiusYValue = 150; // Vertical radius
// --- End constants ---


let players = {}; // Stores player state { id: { ws, x, y, angle, speed, laps, color, finishTime, input, readyForLap, isLapScoringActive, nitroFuel, ... } }
let gameSettings = {
    lapsToWin: 3,
    trackWidth: trackWidthValue,
    canvasWidth: 800,
    canvasHeight: 600,
    trackCenterX: trackCenterXValue,
    trackCenterY: trackCenterYValue,
    trackRadiusX: trackRadiusXValue,
    trackRadiusY: trackRadiusYValue,
    startLineX: trackCenterXValue,
    startLineY1: trackCenterYValue + trackRadiusYValue - trackWidthValue / 2,
    startLineY2: trackCenterYValue + trackRadiusYValue + trackWidthValue / 2,
    friction: 0.02
};
let gameInterval = null;
let playerCounter = 0; // Use this for generating unique IDs
let gameStarted = false;
let gameFinished = false;
let finishedPlayers = 0;
// Near the top with other global variables
let playersAtStartCount = 0; // Number of players when the race began
let lapChoiceOffered = false;

// --- Nitro Settings ---
const MAX_NITRO_FUEL = 100;
const NITRO_CONSUME_RATE = 2; // Fuel units consumed per tick when active
const NITRO_RECHARGE_RATE = 0.5; // Fuel units recharged per tick when inactive
const NITRO_ACCELERATION_BOOST = 1.8; // Multiplier for acceleration when nitro is active
const NITRO_MAX_SPEED_BOOST = 1.5; // Optional: Multiplier for max speed when nitro is active

const TICK_RATE = 30; // Updates per second

console.log('WebSocket server running on port 8080');

// Keep alive ping setup
const keepAliveInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
        console.log(`Terminating inactive connection for player ${ws.playerId || 'unknown'}`);
        return ws.terminate();
    }
    ws.isAlive = false; // Assume connection is dead until pong is received
    ws.ping(() => {}); // Send ping
  });
}, 30000); // Ping every 30 seconds

wss.on('close', () => {
    clearInterval(keepAliveInterval);
});

wss.on('connection', (ws) => {
  // Keep alive setup for new connection
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // --- Game Full Check ---
  const numExistingPlayers = Object.keys(players).length;
  if (numExistingPlayers >= 2) {
      console.log('Game full, rejecting connection.');
      ws.send(JSON.stringify({ type: 'error', message: 'Game is full.' }));
      ws.close();
      return;
  }
  
  // --- Assign Player ID and Determine Role ---
  playerCounter++; // Use global counter for UNIQUE ID
  const playerId = `player${playerCounter}`;
  ws.playerId = playerId;
  const initialSettings = { ...gameSettings, maxNitroFuel: MAX_NITRO_FUEL };
  ws.send(JSON.stringify({
      type: 'assignId',
      payload: {
          id: playerId,
          settings: initialSettings // Send settings including maxNitroFuel
      }
   }));

  const playerIndex = numExistingPlayers; // 0 if first, 1 if second

  // --- Assign Color and Initial State based on Role (playerIndex) ---
  const playerColor = playerIndex === 0 ? 'blue' : 'red';
  const startX = gameSettings.startLineX - 20;
  const startYOffset = playerIndex === 0 ? -gameSettings.trackWidth / 4 : gameSettings.trackWidth / 4;
  const startY = gameSettings.trackCenterY + gameSettings.trackRadiusY + startYOffset;
  const startAngle = 0;

  // --- Create Player Object ---
  if (players[playerId]) { // Safety check for extremely rare ID collision
      console.error(`CRITICAL ERROR: Player ID ${playerId} collision!`);
      ws.close(); // Reject connection if ID exists
      return;
  }

  players[playerId] = {
      ws: ws,
      id: playerId,
      x: startX,
      y: startY,
      angle: startAngle,
      speed: 0,
      maxSpeed: 5, // Base max speed
      acceleration: 0.1, // Base acceleration
      turnSpeed: 0.05,
      laps: 0,
      color: playerColor,
      finishTime: null,
      readyForLap: false,
      input: { forward: false, backward: false, left: false, right: false, nitro: false }, // Initialize with nitro input
      // Nitro State Variables
      nitroFuel: MAX_NITRO_FUEL,
      maxNitroFuel: MAX_NITRO_FUEL,
      nitroRechargeRate: NITRO_RECHARGE_RATE,
      nitroConsumeRate: NITRO_CONSUME_RATE,
      nitroActive: false // Server-side flag for active state
  };
  console.log(`${playerId} connected (Role ${playerIndex}). Start: (${startX.toFixed(0)}, ${startY.toFixed(0)}), Nitro Fuel: ${players[playerId].nitroFuel}`);

  // --- Send Initial Info to Client ---
  ws.send(JSON.stringify({ type: 'assignId', payload: { id: playerId, settings: gameSettings } }));

  // --- Handle Game State (Waiting/Lap Choice) ---
  if ((numExistingPlayers + 1) === 2 && !lapChoiceOffered && !gameStarted) {
      // ... (lap choice logic remains the same) ...
       lapChoiceOffered = true;
      const firstPlayerId = Object.keys(players).find(id => players[id] && players[id].color === 'blue');
      if (firstPlayerId && players[firstPlayerId].ws.readyState === WebSocket.OPEN) {
           players[firstPlayerId].ws.send(JSON.stringify({ type: 'requestLapChoice' }));
           broadcast({ type: 'status', message: `${firstPlayerId} is choosing the number of laps...` });
      } else {
          console.error("Could not find player1 (blue) or connection closed when requesting lap choice.");
          broadcast({ type: 'status', message: `Error: Waiting for player1 lap choice.` });
      }
  } else if ((numExistingPlayers + 1) === 1) {
       broadcast({ type: 'status', message: `Waiting for Player 2...` });
  }

  // --- Handle Incoming Messages ---
  ws.on('message', (message) => {
      // ... (keep alive and basic parsing logic remains the same) ...
       if (!ws.isAlive) return;
       ws.isAlive = true;

      try {
          const data = JSON.parse(message);
          const currentPlayer = players[playerId];
          if (!currentPlayer) return;

          if (data.type === 'input' && !currentPlayer.finishTime) {
              // Ensure the payload includes the nitro field
              currentPlayer.input = {
                  forward: !!data.payload.forward,
                  backward: !!data.payload.backward,
                  left: !!data.payload.left,
                  right: !!data.payload.right,
                  nitro: !!data.payload.nitro // Make sure nitro state is captured
              };
          }
          else if (data.type === 'setLaps' && currentPlayer.color === 'blue' && !gameStarted) {
              // ... (setLaps logic remains the same) ...
               const laps = parseInt(data.payload.laps, 10);
              if (laps > 0 && laps <= 10) {
                  gameSettings.lapsToWin = laps;
                  console.log(`Game set to ${laps} laps by ${playerId} (Blue).`);
                  broadcast({ type: 'status', message: `Game starting in 3 seconds... (${laps} laps)` });
                  startCountdown();
              } else {
                   if (currentPlayer.ws.readyState === WebSocket.OPEN) {
                       currentPlayer.ws.send(JSON.stringify({ type: 'error', message: 'Invalid lap count (1-10).' }));
                       currentPlayer.ws.send(JSON.stringify({ type: 'requestLapChoice' }));
                   }
              }
          }
      } catch (e) {
          console.error(`Error processing message from ${playerId}:`, e);
      }
  });

  // --- Handle Player Disconnect ---
   ws.on('close', (code, reason) => {
      const disconnectedPlayerId = ws.playerId; // Get ID stored on ws object
      console.log(`${disconnectedPlayerId} disconnected. Code: ${code}, Reason: ${reason}`);
      const wasGameRunning = !!gameInterval;

      // Check if player exists before deleting (might have been cleaned up already)
      if (!players[disconnectedPlayerId]) {
          console.log(`Player ${disconnectedPlayerId} already removed.`);
          return;
      }

      // Store color before deleting for potential logic adjustments
      const disconnectedPlayerColor = players[disconnectedPlayerId].color;
      delete players[disconnectedPlayerId]; // Remove player from the game state

      // DO NOT MODIFY playerCounter HERE
      const remainingPlayerIds = Object.keys(players);
      const numRemainingPlayers = remainingPlayerIds.length;

      lapChoiceOffered = false; // Always reset lap choice offering on disconnect

      if (wasGameRunning) {
           broadcast({ type: 'playerLeft', payload: { id: disconnectedPlayerId } });
           console.log('Player left during game, ending game.');
           clearInterval(gameInterval);
           gameInterval = null;
           gameStarted = false;
           gameFinished = true;
           finishedPlayers = 0;

           const winnerMsg = numRemainingPlayers > 0 ? `${remainingPlayerIds[0]} wins because ${disconnectedPlayerId} disconnected.` : `Game ended because ${disconnectedPlayerId} disconnected.`;
           broadcast({ type: 'gameOver', payload: { message: winnerMsg, results: [] } });

            setTimeout(() => {
              console.log("Resetting server state after player disconnected during game.");
              resetServerState();
              broadcast({ type: 'status', message: 'Server ready. Waiting for players...' });
          }, 5000);

      } else { // Disconnect before game start
           if (numRemainingPlayers === 1) {
              const remainingPlayerId = remainingPlayerIds[0];
              broadcast({ type: 'status', message: `Player ${disconnectedPlayerId} left. Waiting for a new player...` });
              // If the blue player left, the remaining red player needs to wait for a new blue player.
              // If the red player left, the blue player is waiting for a new red player.
              // The logic in connection handling should now correctly assign the role to the next connecting player.
           } else if (numRemainingPlayers === 0) {
               console.log("Last player disconnected before game start. Resetting state.");
               resetServerState();
           }
      }
  });

  // --- Handle WebSocket Errors ---
  ws.on('error', (error) => {
      console.error(`WebSocket error for player ${ws.playerId || 'unknown'}:`, error);
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.terminate();
      }
  });
});

/**
 * Resets the server to its initial state, ready for a new game.
 */
function resetServerState() {
    players = {}; // Clear player data
    // Do NOT reset playerCounter here if you want unique IDs across server restarts
    // playerCounter = 0;
    gameStarted = false;
    gameFinished = false;
    finishedPlayers = 0;
    lapChoiceOffered = false;
    gameSettings.lapsToWin = 3; // Reset laps to default
    if (gameInterval) { // Clear any existing game loop interval
        clearInterval(gameInterval);
        gameInterval = null;
    }
    console.log("Server state has been reset.");
}

function startCountdown() {
  let countdown = 3;
  const countdownInterval = setInterval(() => {
      const currentPlayers = Object.keys(players).length;
      if (currentPlayers < 2) { /* ... cancel ... */ return; }

      if (countdown > 0) {
          broadcast({ type: 'countdown', payload: { count: countdown } });
          countdown--;
      } else {
          clearInterval(countdownInterval);
          const startTime = Date.now();
          playersAtStartCount = currentPlayers;
          finishedPlayers = 0;
          Object.values(players).forEach(p => { if(p) { p.readyForLap = false; p.isLapScoringActive = false; } });
          startGameLoop(startTime);
          gameStarted = true;
          gameFinished = false;

          // ---- Include lapsToWin in gameStart payload ----
          broadcast({
              type: 'gameStart',
              payload: {
                  startTime: startTime,
                  lapsToWin: gameSettings.lapsToWin // Send the final value
              }
          });
          // ---- End Include ----
          console.log(`Game started with ${playersAtStartCount} players for ${gameSettings.lapsToWin} laps at ${startTime}!`);
      }
  }, 1000);
}

/**
 * Starts the main game loop interval.
 */
function startGameLoop(startTime) { // Add startTime parameter
  if (gameInterval) clearInterval(gameInterval);

  // const startTime = Date.now(); // startTime is now passed in

  // --- Define VERTICAL Checkpoint Area Parameters ---
  // Centered horizontally at the top of the track
  const checkpointX = gameSettings.trackCenterX;
  // Centered vertically at the top of the track centerline
  const checkpointY = gameSettings.trackCenterY - gameSettings.trackRadiusY;

  // Define the vertical span (height) and horizontal thickness for activation
  const checkpointHeight = gameSettings.trackWidth + 20; // Span track width + margin vertically
  const checkpointWidth = 30;  // How "thick" the activation zone is horizontally (pixels)

  // Calculate activation boundaries
  const cpX1 = checkpointX - checkpointWidth / 2; // Left edge of activation zone
  const cpX2 = checkpointX + checkpointWidth / 2; // Right edge of activation zone
  const cpY1 = checkpointY - checkpointHeight / 2; // Top edge of activation zone
  const cpY2 = checkpointY + checkpointHeight / 2; // Bottom edge of 

  gameInterval = setInterval(() => {
      const playerIds = Object.keys(players);

      // Stop loop if no players or game is marked as finished
      if (playerIds.length === 0 || gameFinished) {
           if (gameInterval) clearInterval(gameInterval);
           gameInterval = null;
           // Only log stop if it wasn't due to a normal game end
           if(!gameFinished && playerIds.length === 0) {
               console.log("Game loop stopping - no players remaining.");
               resetServerState(); // Reset if loop stops unexpectedly due to no players
           } else if (!gameFinished) {
               // This might happen if endGame was called from elsewhere (e.g., disconnect)
               // console.log("Game loop stopping - gameFinished flag set.");
           }
           return;
      }

      const collisions = []; // Array to hold player data for collision checks

      // --- Update each player ---
      playerIds.forEach(id => {
          const player = players[id];
          if (!player) return; // Skip if player data is missing

          // Add finished players to collision check but don't update physics/laps
          if (player.finishTime !== null) { // Check if finishTime is set
               collisions.push({ id: player.id, x: player.x, y: player.y, angle: player.angle, speed: 0 });
               // Don't update physics, laps, or fuel for finished players
               return;
          }

          // Update physics, boundaries, and laps for active players
          updatePlayer(player); // Includes nitro logic
          checkTrackBoundaries(player);
          if (!player.readyForLap) {
            if (player.x > cpX1 && player.x < cpX2 && player.y > cpY1 && player.y < cpY2) {
                player.readyForLap = true;
                console.log(`${player.id} passed top checkpoint, ready for lap.`);
            }
        }
          checkLapCompletion(player, startTime); // Updates player.laps, player.finishTime, and finishedPlayers

          // Add updated data for collision check
          collisions.push({ id: player.id, x: player.x, y: player.y, angle: player.angle, speed: player.speed });
      });

      // --- Check for collisions between players ---
      checkPlayerCollisions(collisions); // Includes rear-end penalty logic

      // --- NEW Check if all *started* players have finished ---
      // Compare the count of players who finished (incremented in checkLapCompletion)
      // against the number of players who were present when the countdown finished.
      if (playersAtStartCount > 0 && finishedPlayers >= playersAtStartCount && !gameFinished) {
         console.log(`Ending game: ${finishedPlayers} finished out of ${playersAtStartCount} started.`);
         endGame(); // Call endGame when the required number of players have finished
         return; // Exit interval function after calling endGame
      }
      // ---- End NEW Check ----


      const gameState = playerIds.map(id => {
        const p = players[id];
        if (!p) return null;
        return {
            id: p.id,
            x: p.x,
            y: p.y,
            angle: p.angle,
            laps: p.laps,
            color: p.color,
            finishTime: p.finishTime,
            nitroFuel: p.nitroFuel,
            nitroActive: p.nitroActive,
            readyForLap: p.readyForLap // <-- ADD THIS LINE
        };
      }).filter(p => p !== null);

      broadcast({ type: 'gameStateUpdate', payload: gameState });

  }, 1000 / TICK_RATE); // Run at the defined tick rate
}

/**
 * Updates a player's speed, angle, and position based on input and physics, including Nitro.
 * @param {object} player - The player object to update.
 */
function updatePlayer(player) {
  const baseAcceleration = player.acceleration;
  const baseMaxSpeed = player.maxSpeed;
  const friction = gameSettings.friction;

  let currentAcceleration = baseAcceleration;
  let currentMaxSpeed = baseMaxSpeed;

  // --- Nitro Logic ---
  player.nitroActive = false; // Assume nitro is off unless conditions met
  if (player.input.nitro && player.nitroFuel > 0 && player.input.forward) { // Nitro only works when accelerating forward
      player.nitroActive = true;
      currentAcceleration *= NITRO_ACCELERATION_BOOST;
      currentMaxSpeed *= NITRO_MAX_SPEED_BOOST; // Optional: Boost max speed too
      player.nitroFuel -= player.nitroConsumeRate;
      if (player.nitroFuel < 0) player.nitroFuel = 0;
  } else {
      // Recharge nitro if not active and fuel is below max
      if (player.nitroFuel < player.maxNitroFuel) {
          player.nitroFuel += player.nitroRechargeRate;
          if (player.nitroFuel > player.maxNitroFuel) {
               player.nitroFuel = player.maxNitroFuel;
          }
      }
  }

  // --- Acceleration and Braking using potentially boosted values ---
  if (player.input.forward && player.speed < currentMaxSpeed) {
      player.speed += currentAcceleration; // Use potentially boosted acceleration
  }
  if (player.input.backward) {
      player.speed -= baseAcceleration * 0.7; // Braking uses base acceleration
  }

  // --- Friction ---
  if (!player.input.forward && player.speed > 0) {
      player.speed -= friction;
  }
  if (!player.input.backward && player.speed < 0) {
      player.speed += friction;
  }

  // --- Stop if speed is very low ---
  if (Math.abs(player.speed) < friction) {
      player.speed = 0;
  }

  // --- Clamp speed to max limits (using potentially boosted max speed) ---
  player.speed = Math.max(-baseMaxSpeed * 0.5, Math.min(currentMaxSpeed, player.speed)); // Limit reverse speed based on base max speed

  // --- Turning ---
  if (Math.abs(player.speed) > 0.1) {
      const turnDirection = player.speed >= 0 ? 1 : -1;
      // Optional: Reduce turn speed slightly during nitro?
      const currentTurnSpeed = player.nitroActive ? player.turnSpeed * 0.9 : player.turnSpeed;
      if (player.input.left) {
          player.angle -= currentTurnSpeed * turnDirection;
      }
      if (player.input.right) {
          player.angle += currentTurnSpeed * turnDirection;
      }
  }

  // --- Normalize angle ---
  player.angle = normalizeAngle(player.angle);

  // --- Update position ---
  player.x += Math.cos(player.angle) * player.speed;
  player.y += Math.sin(player.angle) * player.speed;
}

/**
 * Checks if a given point (x, y) is within the track boundaries.
 * @param {number} x - The x-coordinate.
 * @param {number} y - The y-coordinate.
 * @returns {boolean} True if the point is on the track, false otherwise.
 */
function isPointOnTrack(x, y) {
    const { trackCenterX, trackCenterY, trackRadiusX, trackRadiusY, trackWidth } = gameSettings;
    const dx = x - trackCenterX;
    const dy = y - trackCenterY;

    // Calculate radii for outer and inner boundaries of the elliptical track
    const outerRadiusX = trackRadiusX + trackWidth / 2;
    const outerRadiusY = trackRadiusY + trackWidth / 2;
    const innerRadiusX = trackRadiusX - trackWidth / 2;
    const innerRadiusY = trackRadiusY - trackWidth / 2;

    // Check if the point is within the outer ellipse
    // (dx/a)^2 + (dy/b)^2 <= 1
    const isInsideOuter = (dx / outerRadiusX)**2 + (dy / outerRadiusY)**2 <= 1;

    // If the inner radius is zero or negative (track is filled), only check outer boundary
     if (innerRadiusX <= 0 || innerRadiusY <= 0) {
         return isInsideOuter;
     }

    // Check if the point is outside the inner ellipse
    // (dx/a)^2 + (dy/b)^2 >= 1
     const isOutsideInner = (dx / innerRadiusX)**2 + (dy / innerRadiusY)**2 >= 1;

    // Point is on track if it's inside the outer boundary AND outside the inner boundary
    return isInsideOuter && isOutsideInner;
}

/**
 * Checks if a player is outside the track boundaries and applies a penalty (slowdown).
 * @param {object} player - The player object to check.
 */
function checkTrackBoundaries(player) {
    if (!isPointOnTrack(player.x, player.y)) {
        // Apply a penalty for being off-track: reduce speed significantly
        player.speed *= 0.85; // Slow down more noticeably than friction
        // Optional: Add a small visual/audio cue on the client-side for going off-track
        // console.log(`${player.id} is off track!`);
    }
}

/**
 * Checks if a player has completed a lap by crossing the finish line correctly
 * *after* passing the top checkpoint. Skips the first lap count.
 * Updates the finished player count.
 * @param {object} player - The player object to check.
 * @param {number} startTime - The timestamp when the game started.
 */
function checkLapCompletion(player, startTime) { // Removed newSector parameter
  // Check if player object or necessary properties exist
  if (!player || typeof player.readyForLap === 'undefined') {
      console.error("Player object missing required properties in checkLapCompletion:", player?.id);
      return;
  }

  const { startLineX, startLineY1, startLineY2, lapsToWin } = gameSettings; // Removed trackCenterX

  // Calculate previous X position for crossing detection
  const prevX = player.x - Math.cos(player.angle) * player.speed;
  // Check direction of movement (generally towards the right)
  const movingRight = Math.cos(player.angle) > 0.1;
  // Check line crossing conditions (position and direction)
  const crossedLineCorrectly =
      player.x >= startLineX &&
      prevX < startLineX &&
      player.y > startLineY1 && player.y < startLineY2 &&
      movingRight;

  // --- Main Lap Logic ---
  // Now only depends on being "ready" (passed checkpoint) and crossing the line
  if (player.readyForLap && crossedLineCorrectly) {

      // --- First Crossing (Formation Lap) ---

      // --- Subsequent Crossings (Scored Laps) ---
     if (player.laps < lapsToWin) {
          player.laps++;                     // Increment lap count
          player.readyForLap = false;        // ****** RESET readiness flag ******
          console.log(`${player.id} completed lap ${player.laps} of ${lapsToWin}`);
          broadcast({ type: 'lapComplete', payload: { id: player.id, laps: player.laps } });

          // Check for Race Finish
          if (player.laps === lapsToWin) {
              if (player.finishTime === null) {
                  player.finishTime = (Date.now() - startTime) / 1000;
                  finishedPlayers++;
                  console.log(`${player.id} finished race! Time: ${player.finishTime.toFixed(2)}s. Total finishers: ${finishedPlayers}/${playersAtStartCount}`);
                  broadcast({ type: 'playerFinished', payload: { id: player.id, time: player.finishTime } });
                  player.speed = 0;
                  player.input = { forward: false, backward: false, left: false, right: false, nitro: false };
              }
          }
      }
      // If player crosses line after finishing, or not ready, do nothing, but readiness was already reset above if lap counted.
  }
}

/**
 * Checks for collisions between active players. Applies a push-back force
 * for all collisions and an additional speed penalty for rear-end collisions.
 * @param {Array<object>} activePlayers - An array of player data {id, x, y, angle, speed}.
 */
function checkPlayerCollisions(activePlayers) {
  const collisionDistance = 15;       // Effective radius of cars for collision
  const collisionDistanceSq = collisionDistance * collisionDistance; // Use squared distance
  const pushForceMultiplier = 0.3;    // How strongly cars push each other apart
  const rearEndAngleThreshold = Math.PI / 4; // Max angle diff (radians, 45 deg) to be considered "behind"
  const minSpeedForPenalty = 1.5;      // Minimum speed of the hitter to apply rear-end penalty
  const rearEndPenaltyFactor = 0.3;   // Multiplier for speed after rear-ending (e.g., 40% of original speed)

  for (let i = 0; i < activePlayers.length; i++) {
      for (let j = i + 1; j < activePlayers.length; j++) {
          const p1Data = activePlayers[i];
          const p2Data = activePlayers[j];

          const player1 = players[p1Data.id];
          const player2 = players[p2Data.id];

          // Skip if player objects are missing
          if (!player1 || !player2) continue;

          // --- Basic Distance Check ---
          const dx = p1Data.x - p2Data.x;
          const dy = p1Data.y - p2Data.y;
          const distanceSq = dx * dx + dy * dy;

          // --- Collision Detected ---
          if (distanceSq < collisionDistanceSq && distanceSq > 0) {
              const distance = Math.sqrt(distanceSq);

              // --- Apply General Push-Back (Regardless of Angle) ---
              // Skip push-back if one player has finished? Optional.
              if (!player1.finishTime && !player2.finishTime) {
                  const overlap = collisionDistance - distance;
                  const pushX = dx / distance;
                  const pushY = dy / distance;
                  const force = overlap * pushForceMultiplier;

                  player1.x += pushX * force / 2;
                  player1.y += pushY * force / 2;
                  player2.x -= pushX * force / 2;
                  player2.y -= pushY * force / 2;

                  // Apply some general speed dampening for any collision
                  player1.speed *= 0.95;
                  player2.speed *= 0.95;
              }

              // --- Check for Specific Rear-End Penalty ---
              // Skip penalty if either player has finished
              if (player1.finishTime || player2.finishTime) continue;

              // Angle from p1's center to p2's center
              const angleToP2 = Math.atan2(dy, dx);
              // Angle from p2's center to p1's center
              const angleToP1 = Math.atan2(-dy, -dx); // Or angleToP2 + Math.PI

              // Difference between p1's facing angle and the direction TO p2
              const angleDiff1 = normalizeAngle(player1.angle - angleToP1); // Corrected: P1 facing towards P2? Use angleToP2? No, angleToP1 is correct vector FROM p2
                                                                           // Let's rethink: angle from P1 *towards* P2. That's atan2(p2.y-p1.y, p2.x-p1.x) = atan2(-dy, -dx) = angleToP1
              const angleDiff_P1_Faces_P2 = normalizeAngle(player1.angle - angleToP1);


              // Difference between p2's facing angle and the direction TO p1
              const angleDiff_P2_Faces_P1 = normalizeAngle(player2.angle - angleToP2);


              // Check if Player 1 rear-ended Player 2
              // Condition: P1 is facing towards P2 (small angleDiff_P1_Faces_P2) AND P1 has minimum speed
               if (Math.abs(angleDiff_P1_Faces_P2) < rearEndAngleThreshold && player1.speed > minSpeedForPenalty) {
                  console.log(`${player1.id} rear-ended ${player2.id}! Applying penalty.`);
                  player1.speed *= rearEndPenaltyFactor; // Penalize Player 1
              }
              // Check if Player 2 rear-ended Player 1
              // Condition: P2 is facing towards P1 (small angleDiff_P2_Faces_P1) AND P2 has minimum speed
              else if (Math.abs(angleDiff_P2_Faces_P1) < rearEndAngleThreshold && player2.speed > minSpeedForPenalty) {
                  console.log(`${player2.id} rear-ended ${player1.id}! Applying penalty.`);
                  player2.speed *= rearEndPenaltyFactor; // Penalize Player 2
              }
              // Optional: Log other types of collisions
              // else {
              //    console.log(`Collision between ${player1.id} and ${player2.id} (Side/Head-on)`);
              // }
          }
      }
  }
}
/**
 * Normalizes an angle to be within the range -PI to PI radians.
 * @param {number} angle - The angle in radians.
 * @returns {number} The normalized angle.
 */
function normalizeAngle(angle) {
    while (angle <= -Math.PI) {
        angle += 2 * Math.PI;
    }
    while (angle > Math.PI) {
        angle -= 2 * Math.PI;
    }
    return angle;
}

/**
 * Ends the current game, calculates results, and schedules a server reset.
 */
function endGame() {
    // Prevent multiple calls to endGame
    if (gameFinished) return;

    console.log("Game has ended!");
    gameFinished = true; // Set flag to stop game loop and prevent re-entry
    gameStarted = false;
    if (gameInterval) { // Clear the game loop interval
        clearInterval(gameInterval);
        gameInterval = null;
    }

    // --- Calculate and Sort Results ---
    // Include players who are still connected OR have a finish time recorded
    const finalPlayers = Object.values(players).filter(p => p && (p.ws.readyState === WebSocket.OPEN || p.finishTime !== null));

    const results = finalPlayers
        .map(p => ({
            id: p.id,
            time: p.finishTime, // Will be null for players who didn't finish
            color: p.color
        }))
        .sort((a, b) => {
            // Sort primarily by finish time (ascending, nulls last)
            if (a.time === null && b.time === null) return 0; // Both DNF, keep relative order (or sort by laps later if needed)
            if (a.time === null) return 1;  // a is DNF, b finished, so a comes after b
            if (b.time === null) return -1; // b is DNF, a finished, so a comes before b
            return a.time - b.time;         // Both finished, sort by time
        });

    // --- Broadcast Game Over ---
    broadcast({ type: 'gameOver', payload: { results: results } });
    console.log("Final results:", results);

    // --- Schedule Server Reset ---
    // Wait before resetting to allow clients to display results
    setTimeout(() => {
         console.log("Resetting server state for a new game session.");
         resetServerState(); // Perform full reset
         // Notify potential waiting clients that the server is ready again
         broadcast({ type: 'status', message: 'Server ready. Waiting for players...' });
    }, 15000); // 15-second delay before reset
}

/**
 * Sends data to all connected WebSocket clients.
 * @param {object} data - The data object to send (will be JSON.stringify'd).
 */
function broadcast(data) {
     const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        // Send only to clients that are currently open and alive
        if (client.readyState === WebSocket.OPEN && client.isAlive) {
            try {
                 client.send(message);
            } catch (e) {
                 console.error(`Error sending broadcast message to client ${client.playerId || 'unknown'}:`, e);
                 // Optional: Terminate client if sending fails repeatedly?
                 // client.terminate();
            }
        }
    });
}