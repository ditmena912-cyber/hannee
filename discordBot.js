const { Client, GatewayIntentBits } = require('discord.js');

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

    // Lắng nghe tin nhắn hoặc lệnh từ Discord
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        
        // Ví dụ lệnh kiểm tra bot
        if (message.content === '!ping') {
            message.reply('Pong! Bot chạy chung với Web Service cực mượt!');
        }
    });

    // Đăng nhập bot bằng token bảo mật từ biến môi trường
    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
