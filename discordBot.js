const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TARGET_CHANNEL_ID = '1551915282014933083'; // Kênh minigame
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

module.exports = function (client) {
    // Khởi tạo ván game đầu tiên ở kênh minigame
    (async () => {
        try {
            const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
            if (channel) {
                const embedStart = new EmbedBuilder()
                    .setColor(0x00FFCC)
                    .setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId)
                    .setDescription('Thời gian đặt cược bắt đầu! Nhấn nút bên dưới để đặt cược nhanh.')
                    .addFields(
                        { name: '⏳ Thời gian', value: currentGame.timeLeft + ' giây', inline: true }
                    )
                    .setTimestamp();
                
                const rowGame = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                );

                const msg = await channel.send({ embeds: [embedStart], components: [rowGame] });
                currentGame.messageId = msg.id;
            }
        } catch (e) {
            console.error('Lỗi khởi động ván đầu tiên:', e);
        }
    })();

    // Vòng lặp game Tài Xỉu
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
                                .setDescription('Sử dụng các nút bên dưới để chọn cửa cược nhanh:')
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

                    try {
                        const msg = await channel.messages.fetch(currentGame.messageId);
                        if (msg) {
                            const embedClosed = new EmbedBuilder()
                                .setColor(0xE74C3C)
                                .setTitle('🔒 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐÃ KHÓA')
                                .setDescription('Hết thời gian đặt cược! Đang tiến hành lắc xúc xắc...')
                                .setTimestamp();
                            await msg.edit({ embeds: [embedClosed], components: [] });
                        }
                    } catch (e) {}

                    setTimeout(async () => {
                        const roll = rollDiceBiased(currentGame.totalBetsTai, currentGame.totalBetsXiu);
                        let dice1 = roll.dice1;
                        let dice2 = roll.dice2;
                        let dice3 = roll.dice3;
                        let totalSum = roll.totalSum;
                        let result = roll.result;

                        updateScoreBoard(result);

                        let winnersList = [];
                        let losersList = [];

                        for (let [userId, betInfo] of currentGame.betsThisRound.entries()) {
                            const user = getOrCreateUser(userId, betInfo.username);
                            user.games_played += 1;
                            user.last_active = new Date();

                            let profit = 0;

                            if (betInfo.choice === result) {
                                const multiplier = (result === 'HOA') ? 4 : 1.8;
                                profit = Math.floor(betInfo.amount * multiplier);
                                user.balance += profit;
                                user.total_win += (profit - betInfo.amount);
                                winnersList.push('• <@!' + userId + '>: **+' + profit.toLocaleString() + ' vàng** (Cược ' + betInfo.choice + ')');
                            } else if (result === 'HOA' && betInfo.choice !== 'HOA') {
                                user.balance += betInfo.amount;
                                profit = 0;
                                winnersList.push('• <@!' + userId + '>: **Hoàn ' + betInfo.amount.toLocaleString() + ' vàng** (Hòa bão)');
                            } else {
                                user.total_loss += betInfo.amount;
                                profit = -betInfo.amount;
                                losersList.push('• <@!' + userId + '>: **-' + betInfo.amount.toLocaleString() + ' vàng** (Cược ' + betInfo.choice + ')');
                            }

                            bets.push({
                                bet_id: 'BET-' + Date.now() + '-' + Math.floor(Math.random()*1000),
                                game_id: currentGame.gameId,
                                discord_id: userId,
                                choice: betInfo.choice,
                                amount: betInfo.amount,
                                result: result,
                                profit: profit,
                                created_at: new Date()
                            });
                        }

                        games.push({
                            game_id: currentGame.gameId,
                            result: result,
                            started_at: new Date(),
                            ended_at: new Date(),
                            status: 'COMPLETED'
                        });

                        let resultColor = result === 'TAI' ? 0xF1C40F : (result === 'XIU' ? 0x3498DB : 0x2ECC71);
                        let resultText = result === 'TAI' ? '🟡 TÀI' : (result === 'XIU' ? '🔵 XỈU' : '⚪ HÒA BÃO');
                        let winnersText = winnersList.length > 0 ? winnersList.join('\n') : 'Không có người chơi thắng ở ván này.';
                        let losersText = losersList.length > 0 ? losersList.join('\n') : 'Không có người chơi thua.';
                        const boardStr = '```\n' + renderBoardString() + '\n
