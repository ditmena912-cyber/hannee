// gameBot.js - File riêng chạy độc lập cho bot Minigame
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const { token } = require('./config.json'); // Token của bot minigame (khác với bot boss nhé)

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load lệnh từ thư mục commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

// Load sự kiện từ thư mục events
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

// Xử lý lệnh Slash Command
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'Có lỗi xảy ra khi chạy lệnh minigame!', ephemeral: true });
  }
});

client.login(token);
