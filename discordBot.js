const { Client, GatewayIntentBits } = require('discord.js');

// 📌 ID kênh # mini-game của bạn
const TARGET_CHANNEL_ID = '1551915282014933083'; 

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

    client.once('ready', () => {
        console.log(`🤖 Bot Discord đã đăng nhập thành công với tên: ${client.user.tag}`);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // 🛑 Chỉ cho phép bot phản hồi bên trong kênh # mini-game, các kênh khác bot sẽ bỏ qua
        if (message.channel.id !== TARGET_CHANNEL_ID) return;
        
        // Lệnh test hoạt động
        if (message.content === '!ping') {
            message.reply('Pong! Bot đang hoạt động chuẩn xác tại phòng # mini-game!');
        }
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
