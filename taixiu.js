const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TARGET_CHANNEL_ID = '1551915282014933083'; // ID kênh chơi Tài Xỉu
const ADMIN_CHANNEL_ID = '1551915282014933083';  // ID kênh nhận thông báo duyệt nạp
const SUPER_ADMIN_ID = '979587101328834621';     // ID Admin tối cao (có toàn quyền)

const superAdmins = new Set([SUPER_ADMIN_ID]);
const subAdmins = new Set(); // Admin phụ (không thể thêm/xóa admin khác)

const users = new Map();         
const transactions = new Map();  
let historyColumns = [];         // Lưu trữ lịch sử bảng cầu ma trận chuẩn

let currentGame = {
    gameId: 1,
    status: 'OPEN', // OPEN, LOCKED, FINISHED
    timeLeft: 60,
    totalBetsTai: 0,
    totalBetsXiu: 0,
    betsThisRound: new Map(), 
    userHistory: new Map(),   
    messageId: null
};

function getOrCreateUser(discordId, username = 'User') {
    if (!users.has(discordId)) {
        users.set(discordId, {
            discord_id: discordId,
            username: username,
            balance: 10000, 
            total_deposit: 0,
            total_withdraw: 0,
            total_win: 0,
            total_loss: 0,
            total_bet_amount: 0,
            games_played: 0,
            created_at: new Date()
        });
    }
    return users.get(discordId);
}

function isSuperAdmin(userId) {
    return superAdmins.has(userId);
}

function isAdmin(userId) {
    return superAdmins.has(userId) || subAdmins.has(userId);
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
    if (historyColumns.length > 10) historyColumns.shift();
}

function renderBoardString() {
    if (historyColumns.length === 0) return '⚪ Chưa có dữ liệu phiên trước.';
    let rows = ['', '', '', '', ''];
    for (let r = 0; r < 5; r++) {
        let rowStr = '';
        for (let c = 0; c < historyColumns.length; c++) {
            const col = historyColumns[c];
            if (col[r]) {
                if (col[r] === 'TAI') rowStr += '🟡 ';
                else if (col[r] === 'XIU') rowStr += '🔵 ';
                else rowStr += '🟢 '; 
            } else {
                rowStr += '⚪ ';
            }
        }
        rows[r] = rowStr;
    }
    return rows.join('\n');
}

function rollDice() {
    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const dice3 = Math.floor(Math.random() * 6) + 1;
    const totalSum = dice1 + dice2 + dice3;
    let result = (dice1 === dice2 && dice2 === dice3) ? 'HOA' : (totalSum >= 11 ? 'TAI' : 'XIU');
    return { dice1, dice2, dice3, totalSum, result };
}

client.once('ready', async () => {
    console.log('🎲 Hệ thống Mini-Game Tài Xỉu đã sẵn sàng hoạt động!');
    setTimeout(startNewGameCycle, 3000);
});

async function startNewGameCycle() {
    try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel) return;

        currentGame.status = 'OPEN';
        currentGame.timeLeft = 60;
        currentGame.totalBetsTai = 0;
        currentGame.totalBetsXiu = 0;
        currentGame.betsThisRound.clear();

        const embed = new EmbedBuilder()
            .setColor(0x00FFCC)
            .setTitle(`🎲 PHIÊN CƯỢC #${currentGame.gameId} ĐANG DIỄN RA`)
            .setDescription('Sử dụng các nút bên dưới để chọn cửa cược nhanh:')
            .addFields(
                { name: '⏳ Thời gian còn lại', value: `${currentGame.timeLeft} giây`, inline: true },
                { name: '💰 Tổng cược Tài', value: `${currentGame.totalBetsTai.toLocaleString()} vàng`, inline: true },
                { name: '💰 Tổng cược Xỉu', value: `${currentGame.totalBetsXiu.toLocaleString()} vàng`, inline: true },
                { name: '📊 Bảng Cầu Gần Nhất', value: '```\n' + renderBoardString() + '\n```', inline: false }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_tai').setLabel('CƯỢC TÀI').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_xiu').setLabel('CƯỢC XỈU').setStyle(ButtonStyle.Danger)
        );

        const msg = await channel.send({ embeds: [embed], components: [row] });
        currentGame.messageId = msg.id;
    } catch (e) {
        console.error('Lỗi khởi tạo phiên:', e);
    }
}

setInterval(async () => {
    try {
        const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
        if (!channel || !currentGame.messageId) return;
        const msg = await channel.messages.fetch(currentGame.messageId).catch(() => null);
        if (!msg) return;

        if (currentGame.status === 'OPEN') {
            currentGame.timeLeft -= 5;
            if (currentGame.timeLeft > 0) {
                const embedUpdate = new EmbedBuilder()
                    .setColor(0x00FFCC)
                    .setTitle(`🎲 PHIÊN CƯỢC #${currentGame.gameId} ĐANG DIỄN RA`)
                    .setDescription('Sử dụng các nút bên dưới để chọn cửa cược nhanh:')
                    .addFields(
                        { name: '⏳ Thời gian còn lại', value: `${currentGame.timeLeft} giây`, inline: true },
                        { name: '💰 Tổng cược Tài', value: `${currentGame.totalBetsTai.toLocaleString()} vàng`, inline: true },
                        { name: '💰 Tổng cược Xỉu', value: `${currentGame.totalBetsXiu.toLocaleString()} vàng`, inline: true },
                        { name: '📊 Bảng Cầu Gần Nhất', value: '```\n' + renderBoardString() + '\n
