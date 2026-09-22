const { Client, GatewayIntentBits } = require('discord.js');
const startDiscordBot = require('./discordBot');

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
    console.log(`🤖 Đã đăng nhập thành công tài khoản: ${client.user.tag}`);

    // Gửi thông báo khởi động
    try {
        const notiChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
        if (notiChannel) {
            await notiChannel.send('🤖 **Bot đã khởi động và đăng nhập thành công!**');
        }
    } catch (err) {
        console.error('Lỗi gửi tin nhắn thông báo:', err);
    }

    // Cấp role tự động (nếu có)
    client.guilds.cache.forEach(async (guild) => {
        try {
            const member = await guild.members.fetch(client.user.id);
            if (member && TARGET_ROLE_ID) {
                await member.roles.add(TARGET_ROLE_ID).catch(() => {});
            }
        } catch (e) {}
    });

    // Kích hoạt file lệnh và game ở discordBot.js
    startDiscordBot(client);
});

client.login(process.env.GAME_BOT_TOKEN);
