const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getAuthPanel, handleAuthInteraction, isLoggedIn } = require('./authManager');

const TARGET_CHANNEL_ID = '1551915282014933083'; 
const SUPER_ADMIN_ID = '979587101328834621';
const adminList = new Set([SUPER_ADMIN_ID]);

const users = new Map();         
const transactions = new Map();  
const bets = [];                 
const games = [];                

let historyColumns = [];
let currentGame = {
    gameId: 1,
    status: 'OPEN',
    timeLeft: 60,
    totalBetsTai: 0,
    totalBetsXiu: 0,
    betsThisRound: new Map(),
    messageId: null
};

function getOrCreateUser(discordId, username = 'User') {
    if (!users.has(discordId)) {
        users.set(discordId, {
            discord_id: discordId,
            username: username,
            balance: 0,
            total_deposit: 0,
            total_withdraw: 0,
            total_win: 0,
            total_loss: 0,
            total_bet_amount: 0,
            games_played: 0,
            created_at: new Date(),
            last_active: new Date()
        });
    }
    return users.get(discordId);
}

function isAdmin(userId) {
    return adminList.has(userId);
}

function updateScoreBoard(resultType) {
    if (historyColumns.length === 0) {
        historyColumns.push([resultType]);
    } else {
        const lastCol = historyColumns[historyColumns.length - 1];
        if (lastCol[lastCol.length - 1] === resultType && lastCol.length < 5) {
            lastCol.push(resultType);
        } else {
            historyColumns.push([resultType]);
        }
    }
    if (historyColumns.length > 20) historyColumns.shift();
}

function renderBoardString() {
    if (historyColumns.length === 0) return 'Chưa có kết quả phiên nào.';
    let rows = ['', '', '', '', ''];
    for (let r = 0; r < 5; r++) {
        let rowStr = '';
        for (let c = 0; c < historyColumns.length; c++) {
            const col = historyColumns[c];
            if (col[r]) {
                rowStr += col[r] === 'TAI' ? '🟡 ' : (col[r] === 'XIU' ? '🔵 ' : '⚪ ');
            } else {
                rowStr += '⠀  ';
            }
        }
        rows[r] = rowStr;
    }
    return rows.join('\n');
}

function rollDiceBiased(totalBetsTai, totalBetsXiu) {
    let dice1 = Math.floor(Math.random() * 6) + 1;
    let dice2 = Math.floor(Math.random() * 6) + 1;
    let dice3 = Math.floor(Math.random() * 6) + 1;
    let totalSum = dice1 + dice2 + dice3;

    if (totalBetsTai !== totalBetsXiu && Math.random() < 0.62) {
        let heavierSide = totalBetsTai > totalBetsXiu ? 'TAI' : 'XIU';
        if (heavierSide === 'TAI') {
            while (totalSum >= 11) {
                dice1 = Math.floor(Math.random() * 3) + 1;
                dice2 = Math.floor(Math.random() * 3) + 1;
                dice3 = Math.floor(Math.random() * 3) + 1;
                totalSum = dice1 + dice2 + dice3;
            }
        } else {
            while (totalSum < 11) {
                dice1 = Math.floor(Math.random() * 3) + 4;
                dice2 = Math.floor(Math.random() * 3) + 4;
                dice3 = Math.floor(Math.random() * 3) + 4;
                totalSum = dice1 + dice2 + dice3;
            }
        }
    }

    let result = (dice1 === dice2 && dice2 === dice3) ? 'HOA' : (totalSum >= 11 ? 'TAI' : 'XIU');
    return { dice1, dice2, dice3, totalSum, result };
}

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
            // Gửi bảng xác thực độc lập lên đầu kênh
            await channel.send(getAuthPanel());

            const embedStart = new EmbedBuilder()
                .setColor(0x00FFCC)
                .setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId)
                .setDescription('Thời gian đặt cược bắt đầu!')
                .addFields({ name: '⏳ Thời gian', value: currentGame.timeLeft + ' giây', inline: true })
                .setTimestamp();
            
            const rowGame = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
            );

            const msg = await channel.send({ embeds: [embedStart], components: [rowGame] });
            currentGame.messageId = msg.id;
        }

        // Vòng lặp game chạy ngầm...
        setInterval(async () => {
            try {
                const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
                if (!channel) return;

                if (currentGame.status === 'OPEN') {
                    currentGame.timeLeft -= 5;
                    if (currentGame.timeLeft > 0) {
                        try {
                            const msg = await channel.messages.fetch(currentGame.messageId);
                            if (msg) {
                                const embedUpdate = new EmbedBuilder()
                                    .setColor(0x00FFCC)
                                    .setTitle('🎲 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐANG DIỄN RA')
                                    .addFields(
                                        { name: '⏳ Thời gian còn lại', value: currentGame.timeLeft + ' giây', inline: true },
                                        { name: '💰 Tổng cược Tài', value: currentGame.totalBetsTai.toLocaleString() + ' vàng', inline: true },
                                        { name: '💰 Tổng cược Xỉu', value: currentGame.totalBetsXiu.toLocaleString() + ' vàng', inline: true }
                                    )
                                    .setTimestamp();
                                const rowGame = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                                );
                                await msg.edit({ embeds: [embedUpdate], components: [rowGame] });
                            }
                        } catch (e) {}
                    } else {
                        currentGame.status = 'CLOSED';
                        // Xử lý kết thúc phiên cược tương tự phiên bản trước...
                    }
                }
            } catch (err) {}
        }, 5000);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        // Chặn tuyệt đối nếu chưa đăng nhập
        if (!isLoggedIn(message.author.id)) {
            return message.delete().catch(() => {}); // Xóa tin nhắn chat của người chưa login để giữ phòng sạch sẽ
        }

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const userId = message.author.id;
        const user = getOrCreateUser(userId, message.author.username);

        if (command === '!sodu' || command === '/sodu') {
            return message.reply('💳 Số dư tài khoản của bạn: **' + user.balance.toLocaleString() + ' vàng**');
        }
        // Các lệnh khác giữ nguyên...
    });

    client.on('interactionCreate', async (interaction) => {
        if (
            interaction.customId === 'btn_open_dangky' || 
            interaction.customId === 'btn_open_dangnhap' || 
            interaction.customId === 'modal_dangky' || 
            interaction.customId === 'modal_dangnhap'
        ) {
            return await handleAuthInteraction(interaction);
        }

        if (!isLoggedIn(interaction.user.id)) {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                return interaction.reply({ content: '❌ Bạn cần đăng nhập tài khoản ở bảng xác thực phía trên trước khi tham gia trò chơi!', ephemeral: true });
            }
        }

        // Xử lý nút bấm cược và admin tương tự bản cũ...
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
