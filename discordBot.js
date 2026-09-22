const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getAuthPanel, handleAuthInteraction, isLoggedIn } = require('./authManager');

// Đã cập nhật ID kênh công khai mới
const TARGET_CHANNEL_ID = '1552069701843161098'; 
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
        const lastType = lastCol[lastCol.length - 1];

        if (lastType === resultType && lastCol.length < 5) {
            lastCol.push(resultType);
        } else {
            historyColumns.push([resultType]);
        }
    }

    if (historyColumns.length > 20) {
        historyColumns.shift();
    }
}

function renderBoardString() {
    if (historyColumns.length === 0) return 'Chưa có kết quả phiên nào.';
    
    let rows = ['', '', '', '', ''];
    for (let r = 0; r < 5; r++) {
        let rowStr = '';
        for (let c = 0; c < historyColumns.length; c++) {
            const col = historyColumns[c];
            if (col[r]) {
                if (col[r] === 'TAI') rowStr += '🟡 ';
                else if (col[r] === 'XIU') rowStr += '🔵 ';
                else rowStr += '⚪ ';
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

    let result = '';
    if (dice1 === dice2 && dice2 === dice3) {
        result = 'HOA';
    } else {
        result = totalSum >= 11 ? 'TAI' : 'XIU';
    }

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
            // Gửi bảng xác thực lên kênh công khai
            await channel.send(getAuthPanel());
        }
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const userId = message.author.id;
        const user = getOrCreateUser(userId, message.author.username);
        user.last_active = new Date();

        if (command === '!huongdan' || command === '/huongdan') {
            const embedGuide = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle('📖 HƯỚNG DẪN CHƠI & LỆNH HỆ THỐNG')
                .addFields(
                    { name: '🎲 1. Luật Chơi Tài Xỉu', value: '• Mỗi phiên cược kéo dài **1 phút**.\n• **TÀI**: 11-17 điểm | **XỈU**: 4-10 điểm | **HÒA**: 3 viên giống nhau.' },
                    { name: '🎮 2. Cách Đặt Cược', value: '• Vào phòng chơi riêng tư và bấm nút đặt cược.' }
                );
            return message.reply({ embeds: [embedGuide] });
        }

        if (command === '!sodu' || command === '/sodu') {
            return message.reply('💳 Số dư tài khoản của bạn: **' + user.balance.toLocaleString() + ' vàng**');
        }

        if (command === '!nap' || command === '/nap') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp: `/nap [số lượng vàng]`');

            const txId = 'NAP-' + Math.floor(100000 + Math.random() * 900000);
            transactions.set(txId, { transaction_id: txId, discord_id: userId, type: 'DEPOSIT', amount: amount, status: 'PENDING', admin_id: null, created_at: new Date() });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('approve_nap_' + txId).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('reject_nap_' + txId).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
            );

            const embedNap = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('💎 YÊU CẦU NẠP VÀNG')
                .addFields(
                    { name: '🆔 Mã giao dịch', value: txId, inline: true },
                    { name: '👤 Người chơi', value: '' + message.author, inline: true },
                    { name: '💰 Số lượng', value: amount.toLocaleString() + ' vàng', inline: false }
                );

            return message.reply({ content: '🔔 Có yêu cầu nạp mới cần Admin xử lý!', embeds: [embedNap], components: [row] });
        }

        // Lệnh Admin
        if (command === '!congdiem' && isAdmin(userId)) {
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!targetUser || isNaN(amount)) return message.reply('⚠️ Cú pháp: `!congdiem @User [số vàng]`');
            getOrCreateUser(targetUser.id, targetUser.username).balance += amount;
            return message.reply('✅ Đã cộng +' + amount.toLocaleString() + ' vàng cho ' + targetUser);
        }
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
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
