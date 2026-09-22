const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('baccarat')
    .setDescription('Mở bàn chơi Baccarat giải trí!'),
  async execute(interaction) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('bet_player').setLabel('🔵 Cửa Player').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('bet_tie').setLabel('🟢 Cửa Tie (Hòa)').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('bet_banker').setLabel('🔴 Cửa Banker').setStyle(ButtonStyle.Danger),
      );

    await interaction.reply({
      content: '🎰 **BÀN CƯỢC BACCARAT ĐÃ MỞ!**\nBạn chọn cửa nào cho ván này?',
      components: [row],
    });
  },
};
