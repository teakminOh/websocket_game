const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusMessage = document.getElementById('status-message');
const lapCounter = document.getElementById('lap-counter');
const playerInfo = document.getElementById('player-info');
const penaltyIndicator = document.getElementById('penalty-indicator');
const lapChoiceDiv = document.getElementById('lap-choice');
const lapsInput = document.getElementById('lapsInput');
const setLapsButton = document.getElementById('setLapsButton');
const resultsDiv = document.getElementById('results');
const resultsList = document.getElementById('results-list');
const nitroContainer = document.getElementById('nitro-container');
const nitroBarFill = document.getElementById('nitro-bar-fill');
let maxNitroFuel = 100; // Default value, will be updated by server


// Nastavenie WebSocket
// Ak server beží lokálne: 'ws://localhost:8080'
// Ak server beží na rovnakom stroji/doméne ako HTML:
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.hostname}:8080`; // Predpokladá port 8080
let ws;

let clientId = null;
let clientStartTime = null; // To store the server's start time
let timerUpdateIntervalId = null; // Interval ID for updating timers
let gameState = {}; // { playerId: { x, y, angle, laps, color, finishTime, isPenalty }, ... }
let gameSettings = {}; // Načítané zo servera
const keysPressed = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    nitro: false
};
let animationFrameId = null;
let lastSentInputTime = 0;
const inputSendInterval = 1000 / 20; // Posielať input max 20x za sekundu

function connectWebSocket() {
    statusMessage.textContent = 'Pripájam sa k serveru...';
    resultsDiv.style.display = 'none'; // Skryť výsledky pri novom pripojení
    lapChoiceDiv.style.display = 'none'; // Skryť výber kôl

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket pripojenie otvorené');
        statusMessage.textContent = 'Pripojený. Čakám na štart hry...';
        // Začneme renderovací cyklus, aj keď hra ešte nebeží, aby sme videli aspoň trať
        if (!animationFrameId) {
            gameLoop();
        }
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // console.log("Received message:", data); // Debug log

            switch (data.type) {
              case 'assignId':
                clientId = data.payload.id;
                gameSettings = data.payload.settings; // Uložíme nastavenia trate
                // Store the max nitro fuel received from server
                maxNitroFuel = gameSettings.maxNitroFuel || 100; // Use server value or default
                console.log(`Priradené ID: ${clientId}`);
                console.log("Nastavenia hry:", gameSettings);
                statusMessage.textContent = `Pripojený ako ${clientId}. Čakám na druhého hráča...`;
                // updateLapDisplay(); // Aktualizujeme zobrazenie počtu kôl
                nitroContainer.style.display = 'block'; // Show the nitro bar container
                updateNitroBar(); // Initial update (likely full)
                break;
                case 'requestLapChoice':
                    if (clientId === Object.keys(gameState)[0] || Object.keys(gameState).length < 2) { // Mal by to dostať len prvý hráč
                        lapChoiceDiv.style.display = 'block';
                        statusMessage.textContent = 'Vyber počet kôl pre hru.';
                    }
                    break;
                case 'status':
                    statusMessage.textContent = data.message;
                    break;
                case 'countdown':
                    statusMessage.textContent = `Štart o ${data.payload.count}...`;
                    lapChoiceDiv.style.display = 'none'; // Skryť výber kôl
                    break;
                    case 'gameStart':
                      statusMessage.textContent = 'ŠTART!';
                      resultsDiv.style.display = 'none'; // Hide results if they were shown
  
                      // Store the start time received from the server
                      clientStartTime = data.payload.startTime;
                      console.log("Race started at server time:", clientStartTime);
  
                      // --- Update lapsToWin from gameStart payload ---
                      if (typeof data.payload.lapsToWin !== 'undefined') {
                          gameSettings.lapsToWin = data.payload.lapsToWin; // Update local setting
                          console.log(`Race starting with ${gameSettings.lapsToWin} laps.`);
                          // updateLapDisplay(); // REMOVED as requested - laps shown in player info
                      } else {
                          console.warn("gameStart message did not include lapsToWin.");
                          // Update UI with default or existing value if available
                          // updateLapDisplay(); // Or keep it to show default if needed
                      }
                      // ---- End Update ----
  
                      // Start a dedicated interval for updating timers & player info
                      if (timerUpdateIntervalId) clearInterval(timerUpdateIntervalId); // Clear previous interval
                      timerUpdateIntervalId = setInterval(updatePlayerInfoAndTimers, 100); // Update timers/info 10x per second
                      break; // End of case 'gameStart'
                  case 'gameStateUpdate':
                    // Update gameState (no change needed here for timers)
                    gameState = data.payload.reduce((acc, p) => {
                        if (p) acc[p.id] = p;
                        return acc;
                    }, {});
                    // Update lap display (could potentially be merged into timer update)
                    // updateLapDisplay();
                    // Update other UI elements
                    updatePenaltyIndicator();
                    updateNitroBar();
                    // NOTE: Timer updates are now handled by the separate interval
                    // updatePlayerInfoAndTimers(); // Don't call here anymore
                    break;
                 case 'lapComplete':
                    if (data.payload.id === clientId) {
                        console.log(`Dokončil si kolo ${data.payload.laps}`);
                        // Zvukový efekt?
                    }
                    // gameState už bude aktualizovaný ďalším gameStateUpdate
                    break;
                case 'playerFinished':
                     // gameState už bude aktualizovaný ďalším gameStateUpdate
                     console.log(`Hráč ${data.payload.id} dokončil preteky s časom ${data.payload.time.toFixed(2)}s`);
                     break;
                case 'penalty':
                    if (clientId) { // Zobrazíme správu len hráčovi, ktorý dostal penalizáciu
                         // Penalty indicator sa aktualizuje cez gameStateUpdate
                         console.log("Penalizácia:", data.message);
                         // Mohli by sme zobraziť dočasnú správu
                    }
                    break;
                case 'gameOver':
                  statusMessage.textContent = 'Hra skončila!';
                  displayResults(data.payload.results);
                  stopGameLoop();
                  if (timerUpdateIntervalId) clearInterval(timerUpdateIntervalId); // Stop timer interval
                  timerUpdateIntervalId = null;
                  nitroContainer.style.display = 'none';
                  // Update timers one last time to show final results correctly
                  updatePlayerInfoAndTimers();
                  setTimeout(resetClientState, 10000); // Give more time for results
                  setTimeout(connectWebSocket, 16000); // Delay reconnect accordingly
                  break;
  
                case 'playerLeft':
                  statusMessage.textContent = `Hráč ${data.payload.id} sa odpojil. Hra skončila.`;
                  stopGameLoop();
                  if (timerUpdateIntervalId) clearInterval(timerUpdateIntervalId); // Stop timer interval
                  timerUpdateIntervalId = null;
                  nitroContainer.style.display = 'none';
                  // Update timers one last time
                  updatePlayerInfoAndTimers();
                  setTimeout(resetClientState, 5000);
                  setTimeout(connectWebSocket, 6000);
                  break;

                case 'error':
                    console.error('Chyba od servera:', data.message);
                    statusMessage.textContent = `Chyba: ${data.message}`;
                    ws.close(); // Zatvoríme spojenie pri chybe
                    break;
            }
        } catch (e) {
            console.error('Chyba pri spracovaní správy od servera:', e);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket chyba:', error);
        statusMessage.textContent = 'Chyba pripojenia k serveru.';
        stopGameLoop();
        resetClientState();
         // Skúsime sa pripojiť znova po chvíli
        setTimeout(connectWebSocket, 5000);
    };

    ws.onclose = () => {
        console.log('WebSocket pripojenie zatvorené');
        if (!resultsDiv.style.display || resultsDiv.style.display === 'none') { // Ak hra neskončila normálne
             statusMessage.textContent = 'Spojenie so serverom bolo prerušené. Skúšam znova...';
        }
        stopGameLoop();
        resetClientState();
        // Skúsime sa pripojiť znova po chvíli, ak hra neskončila normálne
         if (!resultsDiv.style.display || resultsDiv.style.display === 'none') {
            setTimeout(connectWebSocket, 5000);
         }
    };
}

function updateNitroBar() {
  const myPlayerState = gameState[clientId];
  if (myPlayerState && typeof myPlayerState.nitroFuel !== 'undefined' && nitroBarFill && maxNitroFuel > 0) {
      const currentFuel = myPlayerState.nitroFuel;
      const fuelPercentage = Math.max(0, Math.min(100, (currentFuel / maxNitroFuel) * 100));
      nitroBarFill.style.width = `${fuelPercentage}%`;
  } else if (nitroBarFill) {
      // Handle cases where state isn't available yet or max is 0
      nitroBarFill.style.width = '0%';
  }
}
function updatePlayerInfoAndTimers() {
  if (!playerInfo) return; // Make sure element exists

  let infoText = "";
  const now = Date.now(); // Get current time for elapsed calculation

  // Sort players maybe? Optional. By ID? By Lap?
  const sortedPlayerIds = Object.keys(gameState).sort(); // Sort by ID for consistent order

  // Get the number of laps to win FROM THE RECEIVED gameSettings object
  const lapsToWin = gameSettings.lapsToWin || '?'; // Use stored setting or '?' if unavailable

  sortedPlayerIds.forEach(pId => {
      const p = gameState[pId];
      if (!p) return;

      let displayTime;

      if (p.finishTime !== null) {
          // Player finished, display their final time
          displayTime = formatTime(p.finishTime);
      } else if (clientStartTime !== null) {
          // Race started, player hasn't finished, show running time
          const elapsedTimeSeconds = (now - clientStartTime) / 1000;
          displayTime = formatTime(elapsedTimeSeconds);
      } else {
          // Race hasn't started yet
          displayTime = formatTime(0); // Show 00:00.00
      }

      // Build the HTML string for this player, using the lapsToWin variable
      infoText += `<div class="player-timer-entry">`
               + `<span style="color:${p.color}; font-weight:bold;">${p.id}:</span> `
               // Use the lapsToWin variable here
               + `<span>Kolo ${p.laps}/${lapsToWin} | Čas: ${displayTime}</span>`
               + `</div>`;
  });

  playerInfo.innerHTML = infoText || "Waiting for players..."; // Update the player info div
}
function resetClientState() {
  clientId = null;
  gameState = {};
  clientStartTime = null; // <-- RESET START TIME
  if (timerUpdateIntervalId) clearInterval(timerUpdateIntervalId); // Clear timer interval
  timerUpdateIntervalId = null;
  keysPressed.forward = false;
  keysPressed.backward = false;
  keysPressed.left = false;
  keysPressed.right = false;
  keysPressed.nitro = false;
  lapCounter.textContent = "Kolo: - / -";
  playerInfo.textContent = "";
  penaltyIndicator.style.display = 'none';
  lapChoiceDiv.style.display = 'none';
  resultsDiv.style.display = 'none';
  nitroContainer.style.display = 'none';
  if (nitroBarFill) {
      nitroBarFill.style.width = '100%';
  }
  // We don't need to explicitly reset readyForLap here,
  // as gameState is cleared, and it defaults to false in gameLoop check.

  if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  } else {
      console.error("Canvas or context not initialized during reset.");
  }
}

function drawCheckpoint(isReady) {
  if (!gameSettings || !gameSettings.trackCenterX) return;

  // --- Use coordinates consistent with the server's VERTICAL checkpoint ---
  const checkpointX = gameSettings.trackCenterX; // X position of the line
  const checkpointTopY = gameSettings.trackCenterY - gameSettings.trackRadiusY - (gameSettings.trackWidth / 2); // Top edge of track at top-center
  const checkpointBottomY = gameSettings.trackCenterY - gameSettings.trackRadiusY + (gameSettings.trackWidth / 2); // Bottom edge of track at top-center

  // Set color based on the local player's readyForLap status
  ctx.strokeStyle = isReady ? 'lime' : 'red'; // Green if ready, Red if not
  ctx.lineWidth = 4; // Make it visible
  ctx.setLineDash([10, 5]); // Make it dashed

  // --- Draw VERTICAL line ---
  ctx.beginPath();
  ctx.moveTo(checkpointX, checkpointTopY);    // Start at top edge of track
  ctx.lineTo(checkpointX, checkpointBottomY); // End at bottom edge of track
  ctx.stroke();
  // --- End Draw ---

  ctx.setLineDash([]); // Reset line dash
}

function sendInput() {
    if (ws && ws.readyState === WebSocket.OPEN && clientId && (!gameState[clientId] || !gameState[clientId].finishTime)) {
        const now = Date.now();
        // Posielame stav kláves len ak sa zmenil alebo prešiel interval
         // Vždy posielame pre plynulosť na serveri
        // if (now - lastSentInputTime > inputSendInterval) { // Odstránené pre plynulejšie ovládanie
            // console.log("Sending input:", keysPressed); // Debug log
            ws.send(JSON.stringify({ type: 'input', payload: keysPressed }));
            // lastSentInputTime = now; // Odstránené
        // }
    }
}

function formatTime(totalSeconds) {
  if (totalSeconds === null || typeof totalSeconds === 'undefined') {
      return "--:--.--";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const milliseconds = Math.floor((totalSeconds * 1000) % 1000);

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0').substring(0, 2)}`;
}

// function updateLapDisplay() {
//     const myPlayerState = gameState[clientId];
//     if (myPlayerState && gameSettings.lapsToWin) {
//         lapCounter.textContent = `Kolo: ${myPlayerState.laps} / ${gameSettings.lapsToWin}`;
//     } else if (gameSettings.lapsToWin) {
//          lapCounter.textContent = `Kolo: - / ${gameSettings.lapsToWin}`;
//     } else {
//         lapCounter.textContent = "Kolo: - / -";
//     }

//     // Zobrazenie info o ostatných hráčoch (len kolá)
//     let infoText = "";
//     Object.values(gameState).forEach(p => {
//         if (p.id !== clientId) {
//             infoText += `<span style="color:${p.color};">Súper (${p.id}): Kolo ${p.laps}</span><br>`;
//         }
//     });
//     playerInfo.innerHTML = infoText;
// }

function updatePenaltyIndicator() {
     const myPlayerState = gameState[clientId];
    if (myPlayerState && myPlayerState.isPenalty) {
        penaltyIndicator.style.display = 'block';
    } else {
        penaltyIndicator.style.display = 'none';
    }
}


function drawTrack() {
    if (!gameSettings || !gameSettings.trackCenterX) return; // Ak ešte nemáme nastavenia

    const { canvasWidth, canvasHeight, trackCenterX, trackCenterY, trackRadiusX, trackRadiusY, trackWidth, startLineX, startLineY1, startLineY2 } = gameSettings;

    // Pozadie (tráva) - už je v CSS, ale môžeme prekresliť
    ctx.fillStyle = '#5cb85c';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Telo trate (šedá)
    ctx.fillStyle = '#aaaaaa';
    ctx.strokeStyle = '#888888'; // Okraj trate
    ctx.lineWidth = 2;

    const outerRadiusX = trackRadiusX + trackWidth / 2;
    const outerRadiusY = trackRadiusY + trackWidth / 2;
    const innerRadiusX = trackRadiusX - trackWidth / 2;
    const innerRadiusY = trackRadiusY - trackWidth / 2;

    ctx.beginPath();
    ctx.ellipse(trackCenterX, trackCenterY, outerRadiusX, outerRadiusY, 0, 0, 2 * Math.PI);
    // Ak chceme "dieru" pre vnútornú časť trate:
     if (innerRadiusX > 0 && innerRadiusY > 0) {
        // Nakreslíme vnútornú elipsu opačným smerom, aby sa vyrezala
         ctx.ellipse(trackCenterX, trackCenterY, innerRadiusX, innerRadiusY, 0, 0, 2 * Math.PI, true); // true = proti smeru hodinových ručičiek
    }
    ctx.fill();

    // Nakreslíme aj okraje trate zvlášť (ak chceme inú farbu/hrúbku)
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(trackCenterX, trackCenterY, outerRadiusX, outerRadiusY, 0, 0, 2 * Math.PI);
    ctx.stroke();
     if (innerRadiusX > 0 && innerRadiusY > 0) {
        ctx.beginPath();
        ctx.ellipse(trackCenterX, trackCenterY, innerRadiusX, innerRadiusY, 0, 0, 2 * Math.PI);
        ctx.stroke();
    }


    // Štartovacia / Cieľová čiara
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(startLineX, startLineY1);
    ctx.lineTo(startLineX, startLineY2);
    ctx.stroke();
}


function drawPlayer(player) { // 'player' here is the object received in gameStateUpdate
  const playerWidth = 20;
  const playerHeight = 10;
  // const isMyPlayer = player.id === clientId; // We don't need this check for flames anymore

  ctx.save(); // Save context state
  ctx.translate(player.x, player.y); // Move origin to player center
  ctx.rotate(player.angle); // Rotate context to player angle

  // --- Draw Nitro Flames (Based ONLY on Server State for THIS player) ---
  // Check the nitroActive flag received from the server for this specific player object
  if (player.nitroActive) {
      const flameLength = 15 + Math.random() * 5; // Add some flicker
      const flameWidth = playerHeight * 0.8;
      ctx.fillStyle = 'orange';
      ctx.beginPath();
      // Simple triangle flame shape coming out the back (-playerWidth / 2)
      ctx.moveTo(-playerWidth / 2, 0); // Point slightly behind center back
      ctx.lineTo(-playerWidth / 2 - flameLength, -flameWidth / 2); // Back top point of flame
      ctx.lineTo(-playerWidth / 2 - flameLength, flameWidth / 2); // Back bottom point of flame
      ctx.closePath();
      ctx.fill();
      // Smaller red inner flame
      ctx.fillStyle = 'red';
       ctx.beginPath();
      ctx.moveTo(-playerWidth / 2, 0);
      ctx.lineTo(-playerWidth / 2 - flameLength * 0.6, -flameWidth / 4);
      ctx.lineTo(-playerWidth / 2 - flameLength * 0.6, flameWidth / 4);
      ctx.closePath();
      ctx.fill();
  }

  // --- Draw Car Body ---
  ctx.fillStyle = player.color || 'gray';
  ctx.fillRect(-playerWidth / 2, -playerHeight / 2, playerWidth, playerHeight);

  // --- Draw Front Indicator ---
  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.moveTo(playerWidth / 2, 0);
  ctx.lineTo(playerWidth / 4, -playerHeight / 2);
  ctx.lineTo(playerWidth / 4, playerHeight / 2);
  ctx.closePath();
  ctx.fill();

   // --- Draw Penalty Indicator (if applicable - assuming isPenalty is sent from server) ---
   // Note: We removed the penalty timer logic earlier. If you re-add penalties,
   // make sure the server sends an `isPenalty` flag in gameStateUpdate.
   /*
   if (player.isPenalty && Math.floor(Date.now() / 200) % 2 === 0) {
       ctx.strokeStyle = 'orange';
       ctx.lineWidth = 2;
       ctx.strokeRect(-playerWidth / 2 - 2, -playerHeight / 2 - 2, playerWidth + 4, playerHeight + 4);
   }
   */


  ctx.restore(); // Restore previous context state
}
// --- Game Loop (no changes needed for timers here anymore) ---
function gameLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawTrack();

  const myPlayerState = gameState[clientId];
  const amIReadyForLap = myPlayerState ? myPlayerState.readyForLap : false;
  drawCheckpoint(amIReadyForLap);

  Object.values(gameState).forEach(player => {
      if (player) drawPlayer(player);
  });

  sendInput(); // Send input state
  animationFrameId = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
     if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
     }
}

function displayResults(results) {
    resultsList.innerHTML = ''; // Vyčistíme predchádzajúce výsledky
    if (results && results.length > 0) {
        results.forEach((result, index) => {
             const li = document.createElement('li');
             const timeString = result.time !== null ? `${result.time.toFixed(2)}s` : 'Nedokončil';
             const playerState = Object.values(gameState).find(p => p.id === result.id);
             const color = playerState ? playerState.color : 'black';
             li.innerHTML = `${index + 1}. <span style="color:${color}; font-weight:bold;">${result.id}</span>: ${timeString}`;
             resultsList.appendChild(li);
        });
    } else {
        resultsList.innerHTML = '<li>Žiadne výsledky (alebo chyba).</li>';
    }
    resultsDiv.style.display = 'block';
}

window.addEventListener('keydown', (e) => {
  // let inputChanged = false; // Optimization removed for simplicity/responsiveness
  switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
          keysPressed.forward = true;
          break;
      case 'ArrowDown':
      case 's':
      case 'S':
          keysPressed.backward = true;
          break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
          keysPressed.left = true;
          break;
      case 'ArrowRight':
      case 'd':
      case 'D':
          keysPressed.right = true;
          break;
      case ' ': // Spacebar for Nitro
          keysPressed.nitro = true; // <-- ADD THIS
          e.preventDefault(); // Prevent spacebar from scrolling the page
          break;
  }
  // Send input immediately on keydown for responsiveness
  // sendInput(); // Removed immediate send, relying on gameLoop's sendInput
});

window.addEventListener('keyup', (e) => {
  // let inputChanged = false; // Optimization removed
  switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
          keysPressed.forward = false;
          break;
      case 'ArrowDown':
      case 's':
      case 'S':
          keysPressed.backward = false;
          break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
          keysPressed.left = false;
          break;
      case 'ArrowRight':
      case 'd':
      case 'D':
          keysPressed.right = false;
          break;
      case ' ': // Spacebar for Nitro
          keysPressed.nitro = false; // <-- ADD THIS
          e.preventDefault();
          break;
  }
});


// Listener pre tlačidlo nastavenia kôl
setLapsButton.addEventListener('click', () => {
    const laps = parseInt(lapsInput.value, 10);
    if (laps > 0 && laps <= 10) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'setLaps', payload: { laps: laps } }));
            lapChoiceDiv.style.display = 'none'; // Skryjeme po odoslaní
        }
    } else {
        alert('Zadaj platný počet kôl (1-10).');
    }
});


// Štart pripojenia
connectWebSocket();