const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAuthPanel, handleAuthInteraction } = require('./authManager');

const TARGET_CHANNEL_ID = '1552069701843161098'; // ID kênh công khai
const SUPER_ADMIN_ID = '979587101328834621';
const adminList = new Set([SUPER_ADMIN_ID]);

function startDiscordBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildPresences
        ]
    });

    client.once('ready', async () => {
        console.log('🤖 Bot Tài Xỉu đã sẵn sàng: ' + client.user.tag);

        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (channel) {
            // Gửi bảng xác thực ra kênh công khai
            await channel.send(getAuthPanel());
        }
    });

    client.on('interactionCreate', async (interaction) => {
        // Chuyển toàn bộ các tương tác đăng nhập, đăng ký, modal và đăng xuất cho authManager xử lý
        if (
            interaction.customId === 'btn_open_dangky' || 
            interaction.customId === 'btn_open_dangnhap' || 
            interaction.customId === 'btn_dangxuat' ||
            interaction.customId === 'modal_dangky' || 
            interaction.customId === 'modal_dangnhap'
        ) {
            return await handleAuthInteraction(interaction);
        }
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
