const { Client, GatewayIntentBits } = require('discord.js');
const startDiscordBot = require('./discordbot'); // Gọi file game minigame

const NOTIFICATION_CHANNEL_ID = '1552069701843161098';
const TARGET_ROLE_ID = '1551998207116968016';

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
    console.log(`Bot đã đăng nhập thành công với tài khoản: ${client.user.tag}`);

    // Gửi 1 tin nhắn thông báo ở kênh riêng tư
    try {
        const notiChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
        if (notiChannel) {
            await notiChannel.send('Bot đã đăng nhập thành công và hệ thống đã sẵn sàng hoạt động!');
        }
    } catch (err) {
        console.error('Không thể gửi tin nhắn thông báo:', err);
    }

    // Tự động cấp role nếu bot ở trong server và đủ quyền
    client.guilds.cache.forEach(async (guild) => {
        try {
            const member = await guild.members.fetch(client.user.id);
            if (member) {
                // Nếu bạn muốn cấp role cho bot hoặc xử lý role liên quan
                console.log(`Đã kiểm tra server: ${guild.name}`);
            }
        } catch (e) {}
    });

    // Kích hoạt chạy minigame ở file discordbot.js
    startDiscordBot(client);
});

client.login(process.env.GAME_BOT_TOKEN);
