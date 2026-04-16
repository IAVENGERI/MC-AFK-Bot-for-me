# Human-Like Minecraft AFK Bot

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Built with](https://img.shields.io/badge/Built%20with-Node.js-green.svg)
![Mineflayer](https://img.shields.io/badge/Mineflayer-v4.29.0-brightgreen)

This is an advanced AFK bot built with **Mineflayer**, designed to keep Minecraft servers (especially free-hosting services like Aternos) alive 24/7.

Unlike simple AFK bots, this one **simulates real human player behavior** to avoid detection by anti-AFK plugins.

---

## 🚀 Key Features

This bot is packed with advanced logic to appear "human":

* 🤖 **Human-like Behavior:** Performs a wide array of random actions: walking, jumping, looking around, crouching, switching hotbar slots, breaking grass, and even tossing "junk" items from its inventory.
* 🚶 **Smart Pathfinder:** Uses `mineflayer-pathfinder` to wander in the vicinity, complete with obstacle avoidance and jumping.
* 👋 **Social Interaction:** The bot listens to chat. If its name is mentioned, it will respond with a random "AFK" message after a human-like delay.
* ♻️ **Intelligent Auto-Reconnect:**
    * **In-Game Disconnect:** If kicked, timed out, or the server restarts, the bot automatically tries to reconnect every **10 seconds**.
    * **Server Offline:** If the bot is started while the server is offline, it will retry every **5 minutes** to avoid spamming connection attempts.
* 🧊 **Connection Watchdog:** Includes an internal "watchdog" to detect frozen connections (silent timeouts). If the server stops responding, the bot will force a reconnect.
* ⏱️ **Proactive Reconnect:** Automatically disconnects and reconnects every 3 hours to simulate a real player taking a break. This clears memory and avoids suspicion from a single, uninterrupted 24/7 session.
* 🔧 **Easy Configuration:** All key settings are managed in a single, well-commented `config.json` file.

---

## 📦 Prerequisites

* **Node.js** (v16 or newer recommended)
* **npm** (comes bundled with Node.js)

---

## ⚙️ Installation & Setup

### 1. Get the Project

Download the project as a ZIP or use Git to clone it:

```bash
git clone https://github.com/yourbestregard/minecraft-afk-bot.git
```

### 2. Navigate to Project Folder

```bash
cd minecraft-afk-bot
```

### 3. Install Dependencies

Run this command to install **mineflayer** and **mineflayer-pathfinder**:

```bash
npm install
```

### 4. Configure the Bot

Open `config.json` and edit it to match your server details. The file is commented to guide you.

| Key  | Description | Example |
| ------------- | ------------- | ------------- |
| `serverHost`  | Your server's IP or domain.  | "server.aternos.me"  |
| `serverPort`  | The server's port. Use 25565 if unsure.  | 49215  |
| `serverVersion`  | **REQUIRED!** The server's Minecraft version.  | "1.20.1"  |
| `botUsername`  | The name your bot will use in-game.  | "ServerGuard"  |
| `viewDistance`  | Bot's view distance (optional, 1 is fine).  | 1  |

**IMPORTANT:** You `must` set `serverVersion` correctly. Auto-detection often fails with hosting services like Aternos and will cause a protocol error.

---

## ▶️ How to Run

Once configured, start the bot from your terminal:

```bash
npm start
```

The bot will attempt to connect. If the server is online, it will join and start its AFK routine. If the server is offline, it will wait 5 minutes before retrying.

You can run this on a server or in a terminal manager (like screen or tmux) to keep it running 24/7.

---

## 📜 License

This project is licensed under the **MIT License.**

This means you are free to use, copy, modify, and distribute this code for personal or commercial projects, as long as you include the original copyright and license notice (the LICENSE file) in your copy.

---

## ✨ Acknowledgements

This project is licensed under the **MIT License.**

- [Mineflayer](https://github.com/PrismarineJS/mineflayer)
- [Mineflayer-Pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder)
