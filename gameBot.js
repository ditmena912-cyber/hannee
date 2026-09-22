// gameBot.js - File riêng chạy độc lập cho bot Minigame
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events } = require('discord.js');
const { token } = require('./config.json');
const { playBaccarat } = require('./gameLogic');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`🎮 Bot Minigame đã chạy độc lập với tên: ${c.user.tag}`);
});

// Lệnh mở bàn chơi /baccarat
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'baccarat') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bet_player').setLabel('🔵 Cửa Player').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bet_tie').setLabel('🟢 Cửa Tie').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bet_banker').setLabel('🔴 Cửa Banker').setStyle(ButtonStyle.Danger),
    );

    await interaction.reply({
      content: '🎰 **BÀN BACCARAT RIÊNG BIỆT ĐÃ MỞ!** Chọn cửa đặt cược:',
      components: [row],
    });
  }

  if (interaction.isButton() && ['bet_player', 'bet_tie', 'bet_banker'].includes(interaction.customId)) {
    const choice = interaction.customId === 'bet_player' ? 'PLAYER 🔵' : interaction.customId === 'bet_tie' ? 'TIE 🟢' : 'BANKER 🔴';
    const result = playBaccarat();

    let text = `🎲 **KẾT QUẢ VÁN BÀI** 🎲\n`;
    text += `> Bạn chọn: **${choice}**\n\n`;
    text += `👤 **Player:** [\({result.playerHand.join(', ')}] 👉 **\){result.playerScore} điểm**\n`;
    text += `🏦 **Banker:** [\({result.bankerHand.join(', ')}] 👉 **\){result.bankerScore} điểm**\n\n`;

    if (result.winner === 'PLAYER' && interaction.customId === 'bet_player') {
      text += `🎉 **Bạn đã THẮNG ở cửa Player!**`;
    } else if (result.winner === 'BANKER' && interaction.customId === 'bet_banker') {
      text += `🎉 **Bạn đã THẮNG ở cửa Banker!**`;
    } else if (result.winner === 'TIE' && interaction.customId === 'bet_tie') {
      text += `🏆 **NỔ HŨ! Trúng cửa HÒA!**`;
    } else {
      text += `😢 **Bạn đã THUA ván này!**`;
    }

    await interaction.update({ content: text, components: [] });
  }
});

client.login(token);
