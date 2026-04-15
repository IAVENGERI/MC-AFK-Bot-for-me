const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mineflayer = require('mineflayer');
const config = require('./config.json');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNearXZ } = goals;
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/ping', (req, res) => {
  res.status(200).send('Bot is alive - ' + new Date().toLocaleString());
});

const PORT = process.env.PORT || 5000;

const RECONNECT_DELAY = 10000;
const RECONNECT_FAIL_DELAY = 300000;
const WATCHDOG_TIMEOUT = 45000;
const SESSION_DURATION = 10800000;

let botInstance = null;
let autoReconnect = true;
let botState = {
  online: false,
  username: config.botUsername,
  server: config.serverHost,
  position: null,
  health: null,
  food: null,
  lastAction: 'Idle',
  sessionStart: null,
};

function broadcast(event, data) {
  io.emit(event, data);
}

function updateState(patch) {
  Object.assign(botState, patch);
  broadcast('state', botState);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createAndRunBot() {
  if (!autoReconnect) return;

  console.log('[System] Attempting to connect to server...');
  updateState({ online: false, position: null, lastAction: 'Connecting...' });

  let hasSuccessfullySpawned = false;
  let isDisconnecting = false;
  let isSneaking = false;
  let lastChatReply = 0;
  let watchdogTimer = null;
  let actionTimer = null;

  const bot = mineflayer.createBot({
    host: config.serverHost,
    port: config.serverPort,
    username: config.botUsername,
    auth: 'offline',
    version: config.serverVersion,
    viewDistance: config.viewDistance || 'normal',
    checkTimeoutInterval: WATCHDOG_TIMEOUT,
  });

  botInstance = bot;
  bot.loadPlugin(pathfinder);

  function resetWatchdog() {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(forceReconnect, WATCHDOG_TIMEOUT);
  }

  function forceReconnect() {
    console.log(`[System] WATCHDOG: No server tick for ${WATCHDOG_TIMEOUT / 1000}s. Forcing reconnect...`);
    bot.end('watchdog_timeout');
  }

  function handleDisconnect(reason) {
    if (isDisconnecting) return;
    isDisconnecting = true;
    botInstance = null;

    console.log(`Bot Disconnected: ${reason}`);
    if (watchdogTimer) clearTimeout(watchdogTimer);
    if (actionTimer) clearTimeout(actionTimer);

    updateState({ online: false, position: null, health: null, food: null, lastAction: 'Disconnected' });

    if (!autoReconnect) {
      console.log('[System] Auto-reconnect disabled. Bot stopped.');
      return;
    }

    if (hasSuccessfullySpawned) {
      console.log(`Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
      setTimeout(createAndRunBot, RECONNECT_DELAY);
    } else {
      console.log(`Server offline? Reconnecting in ${RECONNECT_FAIL_DELAY / 1000 / 60} minutes...`);
      setTimeout(createAndRunBot, RECONNECT_FAIL_DELAY);
    }
  }

  function performRandomAction() {
    if (!bot.entity || !autoReconnect) return;

    const actionId = randomInt(0, 10);
    const actionNames = [
      'Moving randomly', 'Jumping', 'Looking around', 'Fake mining',
      'Toggling sneak', 'Wandering', 'Switching hotbar', 'Looking at player',
      'Idling', 'Breaking grass', 'Tossing item'
    ];

    updateState({ lastAction: actionNames[actionId] });

    if (actionId !== 5 && bot.pathfinder.isMoving()) bot.pathfinder.stop();

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
        if (!bot.pathfinder.isMoving()) {
          const pos = bot.entity.position;
          const targetX = pos.x + randomInt(-16, 16);
          const targetZ = pos.z + randomInt(-16, 16);
          bot.pathfinder.setGoal(new GoalNearXZ(targetX, targetZ, 2));
        }
        break;
      case 6:
        bot.setQuickBarSlot(randomInt(0, 8));
        break;
      case 7:
        const player = bot.nearestEntity((e) => e.type === 'player' && e.username !== bot.username);
        if (player) bot.lookAt(player.position.offset(0, player.height, 0));
        else { performRandomAction(); return; }
        break;
      case 8:
        break;
      case 9:
        const blockToBreak = bot.findBlock({
          matching: (blk) => ['grass', 'short_grass', 'poppy', 'dandelion', 'dead_bush'].includes(blk.name),
          maxDistance: 6,
        });
        if (blockToBreak) {
          bot.lookAt(blockToBreak.position.offset(0.5, 0.5, 0.5), false, () => { bot.dig(blockToBreak); });
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

    const nextDelay = randomInt(2000, 7000);
    actionTimer = setTimeout(performRandomAction, nextDelay);
  }

  bot.on('spawn', () => {
    hasSuccessfullySpawned = true;
    console.log(`${config.botUsername} has spawned!`);

    const defaultMove = new Movements(bot);
    bot.pathfinder.setMovements(defaultMove);

    updateState({
      online: true,
      lastAction: 'Spawned',
      sessionStart: Date.now(),
    });

    actionTimer = setTimeout(() => { performRandomAction(); }, 3000);
    resetWatchdog();

    setTimeout(() => {
      if (autoReconnect) bot.end('proactive_session_reconnect');
    }, SESSION_DURATION);
  });

  bot.on('physicTick', () => {
    resetWatchdog();
    if (bot.entity) {
      const p = bot.entity.position;
      updateState({
        position: { x: p.x.toFixed(1), y: p.y.toFixed(1), z: p.z.toFixed(1) },
        health: bot.health ? Math.round(bot.health) : null,
        food: bot.food ? Math.round(bot.food) : null,
      });
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
      const replies = ["Sorry, I'm AFK.", "brb", "zZzZz...", "?"];
      const reply = replies[randomInt(0, replies.length - 1)];
      setTimeout(() => { bot.chat(reply); }, randomInt(1500, 4500));
    }
  });

  bot.on('error', (err) => {
    console.error('Error:', err.message);
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

io.on('connection', (socket) => {
  socket.emit('state', botState);

  socket.on('start', () => {
    if (botInstance) return;
    autoReconnect = true;
    createAndRunBot();
  });

  socket.on('stop', () => {
    autoReconnect = false;
    if (botInstance) {
      botInstance.end('user_stopped');
    } else {
      updateState({ online: false, lastAction: 'Stopped by user' });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Web interface running on port ${PORT}`);
  createAndRunBot();
});

const https = require('https');

const RENDER_URL = 'https://mc-afk-bot-for-me.onrender.com';  // ← BURAYI KENDİ RENDER LİNKİNLE DEĞİŞTİR!

function selfPing() {
  https.get(RENDER_URL + '/ping', (res) => {
    if (res.statusCode === 200) {
      console.log(`[${new Date().toLocaleTimeString()}] Self-ping başarılı → Render canlı tutuluyor`);
    } else {
      console.log(`[${new Date().toLocaleTimeString()}] Self-ping: Status ${res.statusCode}`);
    }
  }).on('error', (err) => {
    console.log(`[${new Date().toLocaleTimeString()}] Self-ping hatası:`, err.message);
  });
}

// Her 10 dakikada bir self ping at (600000 ms = 10 dakika)
setInterval(selfPing, 600000);

setTimeout(selfPing, 30000);   // 30 saniye sonra ilk ping

console.log('Self-ping sistemi aktif → Her 10 dakikada bir Render canlı tutulacak');
