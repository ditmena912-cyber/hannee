const { Events } = require('discord.js');
const { playBaccaratRound } = require('../gameLogic');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isButton()) return;

    if (['bet_player', 'bet_tie', 'bet_banker'].includes(interaction.customId)) {
      let choiceName = interaction.customId === 'bet_player' ? 'PLAYER 🔵' : interaction.customId === 'bet_tie' ? 'TIE 🟢' : 'BANKER 🔴';
      const result = playBaccaratRound();

      let text = `🎲 **KẾT QUẢ VÁN BÀI** 🎲\n`;
      text += `> Bạn chọn: **${choiceName}**\n\n`;
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
  },
};
