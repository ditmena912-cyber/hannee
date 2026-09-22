const { Events } = require('discord.js');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`🎮 Bot Minigame đã online với tên: ${client.user.tag}`);
  },
};
