const mineflayer = require('mineflayer');
const config = require('./config.json');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNearXZ } = goals;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// --- WEB SERVER SETUP ---

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json(getBotState());
});

app.post('/api/toggle', (req, res) => {
  if (botEnabled) {
    disableBot();
  } else {
    enableBot();
  }
  res.json({ enabled: botEnabled });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Web] Dashboard running on port ${PORT}`);
});

// --- CONSTANTS ---

const RECONNECT_DELAY = 10000;
const RECONNECT_FAIL_DELAY = 300000;
const WATCHDOG_TIMEOUT = 45000;
const SESSION_DURATION = 10800000;

// --- GLOBAL STATE ---

let botEnabled = true;
let currentBot = null;
let reconnectTimer = null;

let state = {
  status: 'offline',
  action: 'Idle',
  position: null,
  server: config.serverHost,
  username: config.botUsername,
  uptime: null,
  spawnedAt: null,
};

function getBotState() {
  return {
    enabled: botEnabled,
    status: state.status,
    action: state.action,
    position: state.position,
    server: state.server,
    username: state.username,
    uptime: state.spawnedAt ? Math.floor((Date.now() - state.spawnedAt) / 1000) : null,
  };
}

function emitState() {
  io.emit('state', getBotState());
}

function setStatus(s, action) {
  state.status = s;
  if (action !== undefined) state.action = action;
  emitState();
}

function disableBot() {
  botEnabled = false;
  console.log('[Web] Bot disabled by user. Auto-relogin stopped.');
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (currentBot) {
    try { currentBot.end('user_disabled'); } catch (e) {}
    currentBot = null;
  }
  state.position = null;
  state.spawnedAt = null;
  setStatus('disabled', 'Disabled by user');
}

function enableBot() {
  botEnabled = true;
  console.log('[Web] Bot enabled by user. Starting...');
  setStatus('connecting', 'Connecting...');
  createAndRunBot();
}

// --- HELPER ---

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- MAIN BOT FUNCTION ---

function createAndRunBot() {
  if (!botEnabled) return;

  console.log('[System] Attempting to connect to server...');
  setStatus('connecting', 'Connecting...');

  let hasSuccessfullySpawned = false;
  let isDisconnecting = false;
  let isSneaking = false;
  let lastChatReply = 0;
  let watchdogTimer = null;

  const bot = mineflayer.createBot({
    host: config.serverHost,
    port: config.serverPort,
    username: config.botUsername,
    auth: 'offline',
    version: config.serverVersion,
    viewDistance: config.viewDistance || 'normal',
    checkTimeoutInterval: WATCHDOG_TIMEOUT,
  });

  currentBot = bot;

  bot.loadPlugin(pathfinder);

  function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(forceReconnect, WATCHDOG_TIMEOUT);
  }

  function forceReconnect() {
    console.log(`[System] WATCHDOG: No server tick received for ${WATCHDOG_TIMEOUT / 1000}s. Forcing reconnect...`);
    bot.end('watchdog_timeout');
  }

  function handleDisconnect(reason) {
    if (isDisconnecting) return;
    isDisconnecting = true;

    console.log(`⛔️ Bot Disconnected/Failed! Reason: ${reason}`);
    if (watchdogTimer) clearTimeout(watchdogTimer);

    state.position = null;
    state.spawnedAt = null;

    if (!botEnabled) {
      setStatus('disabled', 'Disabled by user');
      return;
    }

    if (hasSuccessfullySpawned) {
      setStatus('reconnecting', `Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
      console.log(`Attempting to reconnect in ${RECONNECT_DELAY / 1000} seconds...`);
      reconnectTimer = setTimeout(createAndRunBot, RECONNECT_DELAY);
    } else {
      setStatus('offline', `Server offline. Retrying in ${RECONNECT_FAIL_DELAY / 1000 / 60} min...`);
      console.log(`[System] Failed to connect. Retrying in ${RECONNECT_FAIL_DELAY / 1000 / 60} minutes...`);
      reconnectTimer = setTimeout(createAndRunBot, RECONNECT_FAIL_DELAY);
    }
  }

  function performRandomAction() {
    if (!bot.entity || !botEnabled) return;

    const actionNames = [
      'Moving around', 'Jumping', 'Looking around', 'Fake mining',
      'Sneaking', 'Wandering', 'Switching hotbar', 'Watching nearby player',
      'Idling', 'Breaking grass', 'Tossing item',
    ];
    const actionId = randomInt(0, 10);
    const actionLabel = actionNames[actionId] || 'Acting';

    state.action = actionLabel;
    if (bot.entity) {
      state.position = {
        x: Math.round(bot.entity.position.x * 10) / 10,
        y: Math.round(bot.entity.position.y * 10) / 10,
        z: Math.round(bot.entity.position.z * 10) / 10,
      };
    }
    emitState();

    console.log(`[Action] ${actionLabel} (ID: ${actionId})`);

    if (actionId !== 5 && bot.pathfinder.isMoving()) {
      bot.pathfinder.stop();
    }

    switch (actionId) {
      case 0:
        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[randomInt(0, 3)];
        const duration = randomInt(100, 300);
        bot.setControlState(direction, true);
        setTimeout(() => { if (bot && bot.entity) bot.setControlState(direction, false); }, duration);
        break;
      case 1:
        bot.setControlState('jump', true);
        bot.setControlState('jump', false);
        break;
      case 2:
        const yaw = Math.random() * Math.PI * 2 - Math.PI;
        const pitch = (Math.random() * (Math.PI / 2)) - (Math.PI / 4);
        bot.look(yaw, pitch, false);
        break;
      case 3:
        const block = bot.findBlock({ matching: (blk) => blk.type !== 0, maxDistance: 3 });
        if (block) {
          bot.lookAt(block.position, false, () => {
            bot.swingArm();
            setTimeout(() => bot.swingArm(), 300);
            setTimeout(() => bot.swingArm(), 600);
          });
        } else { bot.swingArm(); }
        break;
      case 4:
        isSneaking = !isSneaking;
        bot.setControlState('sneak', isSneaking);
        break;
      case 5:
        if (bot.pathfinder.isMoving()) break;
        const pos = bot.entity.position;
        const targetX = pos.x + randomInt(-16, 16);
        const targetZ = pos.z + randomInt(-16, 16);
        bot.pathfinder.setGoal(new GoalNearXZ(targetX, targetZ, 2));
        break;
      case 6:
        bot.setQuickBarSlot(randomInt(0, 8));
        break;
      case 7:
        const player = bot.nearestEntity((e) => e.type === 'player' && e.username !== bot.username);
        if (player) {
          bot.lookAt(player.position.offset(0, player.height, 0));
        } else {
          performRandomAction();
          return;
        }
        break;
      case 8:
        break;
      case 9:
        const blockToBreak = bot.findBlock({
          matching: (blk) => ['grass', 'short_grass', 'poppy', 'dandelion', 'dead_bush'].includes(blk.name),
          maxDistance: 6,
        });
        if (blockToBreak) {
          bot.lookAt(blockToBreak.position.offset(0.5, 0.5, 0.5), false, () => {
            bot.dig(blockToBreak);
          });
        }
        break;
      case 10:
        const mainInventoryItems = bot.inventory.items().filter(item => item.slot >= 9 && item.slot <= 35);
        if (mainInventoryItems.length > 0) {
          const itemToToss = mainInventoryItems[randomInt(0, mainInventoryItems.length - 1)];
          bot.toss(itemToToss.type, null, 1);
        }
        break;
    }

    const nextActionDelay = randomInt(2000, 7000);
    setTimeout(performRandomAction, nextActionDelay);
  }

  // --- EVENTS ---

  bot.on('spawn', () => {
    hasSuccessfullySpawned = true;
    state.spawnedAt = Date.now();
    console.log(`✅ ${config.botUsername} has spawned!`);
    setStatus('online', 'Spawned');

    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);

    setTimeout(() => {
      console.log('Starting random action cycle...');
      performRandomAction();
    }, 3000);

    console.log('[System] Watchdog started.');
    resetWatchdog();

    setTimeout(() => {
      console.log('[System] Proactive 3-hour session reconnect...');
      bot.end('proactive_session_reconnect');
    }, SESSION_DURATION);
  });

  bot.on('physicTick', () => {
    resetWatchdog();
    if (bot.entity) {
      state.position = {
        x: Math.round(bot.entity.position.x * 10) / 10,
        y: Math.round(bot.entity.position.y * 10) / 10,
        z: Math.round(bot.entity.position.z * 10) / 10,
      };
    }
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    const messageLower = message.toLowerCase();
    const botNameLower = config.botUsername.toLowerCase();
    if (messageLower.includes(botNameLower)) {
      const now = Date.now();
      if (now - lastChatReply < 30000) return;
      lastChatReply = now;
      const replies = ["Sorry, I'm AFK.", 'brb', 'zZzZz...', '?'];
      const reply = replies[randomInt(0, replies.length - 1)];
      setTimeout(() => { bot.chat(reply); }, randomInt(1500, 4500));
    }
  });

  bot.on('error', (err) => {
    console.error('⚠️ Error:', err.message);
    handleDisconnect(err.message);
  });

  bot.on('kicked', (reason) => {
    hasSuccessfullySpawned = true;
    handleDisconnect(`Kicked: ${JSON.stringify(reason)}`);
  });

  bot.on('end', (reason) => {
    handleDisconnect(`Connection ended: ${reason}`);
  });
}

// --- SOCKET.IO ---

io.on('connection', (socket) => {
  socket.emit('state', getBotState());

  socket.on('toggle', () => {
    if (botEnabled) {
      disableBot();
    } else {
      enableBot();
    }
    io.emit('state', getBotState());
  });
});

// --- UPTIME BROADCAST ---

setInterval(() => {
  if (state.status === 'online') {
    emitState();
  }
}, 5000);

// --- START ---

createAndRunBot();
