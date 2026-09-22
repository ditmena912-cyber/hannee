const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TARGET_CHANNEL_ID = '1551915282014933083'; 
const ADMIN_CHANNEL_ID = '1551915282014933083'; // Bạn có thể thay ID kênh riêng của Admin vào đây nếu muốn
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

function formatTime(date) {
    return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
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

                            const boardStr = '```\n' + renderBoardString() + '\n```';

                            const embedResult = new EmbedBuilder()
                                .setColor(resultColor)
                                .setTitle('🎲 KẾT QUẢ PHIÊN #' + currentGame.gameId)
                                .addFields(
                                    { name: '🎯 Xúc xắc', value: '**' + dice1 + ' - ' + dice2 + ' - ' + dice3 + '**', inline: true },
                                    { name: '⚖️ Tổng điểm', value: '**' + totalSum + ' điểm**', inline: true },
                                    { name: '🏆 Kết quả', value: '**' + resultText + '**', inline: false },
                                    { name: '📊 Bảng Cầu Gần Nhất', value: boardStr, inline: false },
                                    { name: '🎉 Danh Sách Thắng', value: winnersText, inline: false },
                                    { name: '😢 Danh Sách Thua', value: losersText, inline: false }
                                )
                                .setTimestamp();

                            await channel.send({ embeds: [embedResult] });

                            setTimeout(async () => {
                                currentGame.gameId += 1;
                                currentGame.status = 'OPEN';
                                currentGame.timeLeft = 60;
                                currentGame.totalBetsTai = 0;
                                currentGame.totalBetsXiu = 0;
                                currentGame.betsThisRound.clear();

                                if (historyColumns.length >= 20) {
                                    historyColumns = [];
                                }

                                const embedNewGame = new EmbedBuilder()
                                    .setColor(0x00FFCC)
                                    .setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId)
                                    .setDescription('Thời gian đặt cược bắt đầu! Nhấn nút bên dưới để tham gia.')
                                    .addFields(
                                        { name: '⏳ Thời gian', value: currentGame.timeLeft + ' giây', inline: true }
                                    )
                                    .setTimestamp();

                                const rowGame = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                                );

                                const newMsg = await channel.send({ embeds: [embedNewGame], components: [rowGame] });
                                currentGame.messageId = newMsg.id;
                            }, 3000);

                        }, 15000);
                    }
                }
            } catch (err) {
                console.error('[Game Loop Error]:', err.message);
            }
        }, 5000); 
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
                .setDescription('Chào mừng bạn đến với hệ thống Mini-Game Tài Xỉu chuyên nghiệp!')
                .addFields(
                    { 
                        name: '🎲 1. Luật Chơi Tài Xỉu', 
                        value: '• Mỗi phiên cược kéo dài **1 phút (60 giây)**.\n• Bot sẽ lắc 3 viên xúc xắc.\n• **TÀI**: 11-17 điểm | **XỈU**: 4-10 điểm | **HÒA**: 3 viên giống nhau.', 
                        inline: false 
                    },
                    { 
                        name: '🎮 2. Cách Đặt Cược', 
                        value: '• Bấm trực tiếp vào các nút **🟡 CƯỢC TÀI** hoặc **🔵 CƯỢC XỈU** bên dưới khung game để hiện bảng nhập số lượng vàng.', 
                        inline: false 
                    },
                    { 
                        name: '📜 3. Lệnh Hỗ Trợ Khác', 
                        value: '• `/sodu` : Kiểm tra số vàng.\n• `/lichsu` : Xem 5 ván cược gần nhất.\n• `/cau` : Xem bảng cầu.\n• `/nap [số vàng]` / `/rut [số vàng]` : Giao dịch nạp rút qua Admin.', 
                        inline: false 
                    }
                )
                .setTimestamp();
            return message.reply({ embeds: [embedGuide] });
        }

        if (command === '!sodu' || command === '/sodu') {
            return message.reply('💳 Số dư tài khoản của bạn: **' + user.balance.toLocaleString() + ' vàng**');
        }

        if (command === '!nguoidung' || command === '/nguoidung') {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('👤 THÔNG TIN TÀI KHOẢN: ' + message.author.username)
                .addFields(
                    { name: '🆔 Discord ID', value: user.discord_id, inline: true },
                    { name: '💳 Số dư vàng', value: user.balance.toLocaleString() + ' vàng', inline: true },
                    { name: '📈 Tổng thắng', value: user.total_win.toLocaleString() + ' vàng', inline: true },
                    { name: '📉 Tổng thua', value: user.total_loss.toLocaleString() + ' vàng', inline: true },
                    { name: '🎮 Tổng ván chơi', value: user.games_played + ' ván', inline: true }
                );
            return message.reply({ embeds: [embed] });
        }

        if (command === '!nap' || command === '/nap') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ Cú pháp không hợp lệ! Vui lòng dùng: `/nap [số lượng vàng]`');
            }

            const txId = 'NAP-' + Math.floor(100000 + Math.random() * 900000);
            transactions.set(txId, {
                transaction_id: txId,
                discord_id: userId,
                type: 'DEPOSIT',
                amount: amount,
                status: 'PENDING',
                admin_id: null,
                created_at: new Date(),
                completed_at: null
            });

            // Gửi thông báo xác nhận thành công cho người chơi (Không có nút bấm)
            const embedUser = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('💎 GỬI YÊU CẦU NẠP VÀNG THÀNH CÔNG')
                .setDescription('Yêu cầu nạp **' + amount.toLocaleString() + ' vàng** của bạn đã được gửi tới Admin. Vui lòng đợi xử lý.')
                .addFields({ name: '🆔 Mã giao dịch', value: txId, inline: true });
            
            await message.reply({ embeds: [embedUser] });

            // Gửi thông báo kèm nút XÁC NHẬN / TỪ CHỐI vào Kênh của Admin
            try {
                const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
                if (adminChannel) {
                    const rowAdmin = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId('approve_nap_' + txId).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('reject_nap_' + txId).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
                        );

                    const embedAdmin = new EmbedBuilder()
                        .setColor(0xFFD700)
                        .setTitle('💎 YÊU CẦU NẠP VÀNG MỚI (CẦN XỬ LÝ)')
                        .addFields(
                            { name: '🆔 Mã giao dịch', value: txId, inline: true },
                            { name: '👤 Người chơi', value: '' + message.author, inline: true },
                            { name: '💰 Số lượng', value: amount.toLocaleString() + ' vàng', inline: false },
                            { name: '⏳ Trạng thái', value: 'Đang chờ Admin xác nhận', inline: false }
                        );

                    await adminChannel.send({ content: '🔔 Có yêu cầu nạp vàng mới từ <@!' + userId + '>!', embeds: [embedAdmin], components: [rowAdmin] });
                }
            } catch (e) {
                console.error('Không gửi được tin nhắn tới kênh Admin:', e.message);
            }
            return;
        }

        if (command === '!rut' || command === '/rut') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ Cú pháp không hợp lệ! Vui lòng dùng: `/rut [số lượng vàng]`');
            }

            if (user.balance < amount) {
                return message.reply('❌ Số dư không đủ để thực hiện giao dịch rút vàng!');
            }

            const requiredBet = user.total_deposit * 2;
            if (user.total_bet_amount < requiredBet) {
                return message.reply('❌ Bạn chưa đủ điều kiện rút tiền! Cần tổng cược đạt: **' + requiredBet.toLocaleString() + ' vàng**');
            }

            const txId = 'RUT-' + Math.floor(100000 + Math.random() * 900000);
            transactions.set(txId, {
                transaction_id: txId,
                discord_id: userId,
                type: 'WITHDRAW',
                amount: amount,
                status: 'PENDING',
                admin_id: null,
                created_at: new Date(),
                completed_at: null
            });

            // Gửi thông báo xác nhận thành công cho người chơi (Không có nút bấm)
            const embedUser = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle('💸 GỬI YÊU CẦU RÚT VÀNG THÀNH CÔNG')
                .setDescription('Yêu cầu rút **' + amount.toLocaleString() + ' vàng** của bạn đã được chuyển cho Admin duyệt.')
                .addFields({ name: '🆔 Mã giao dịch', value: txId, inline: true });

            await message.reply({ embeds: [embedUser] });

            // Gửi thông báo kèm nút duyệt tới kênh Admin
            try {
                const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID);
                if (adminChannel) {
                    const rowAdmin = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId('approve_rut_' + txId).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('reject_rut_' + txId).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
                        );

                    const embedAdmin = new EmbedBuilder()
                        .setColor(0xFF4500)
                        .setTitle('💸 YÊU CẦU RÚT VÀNG MỚI (CẦN XỬ LÝ)')
                        .addFields(
                            { name: '🆔 Mã giao dịch', value: txId, inline: true },
                            { name: '👤 Người chơi', value: '' + message.author, inline: true },
                            { name: '💰 Số lượng', value: amount.toLocaleString() + ' vàng', inline: false },
                            { name: '⏳ Trạng thái', value: 'Đang chờ Admin xử lý', inline: false }
                        );

                    await adminChannel.send({ content: '🔔 Có yêu cầu rút vàng mới từ <@!' + userId + '>!', embeds: [embedAdmin], components: [rowAdmin] });
                }
            } catch (e) {
                console.error('Không gửi được tin nhắn tới kênh Admin:', e.message);
            }
            return;
        }

        if (command === '!lichsu' || command === '/lichsu') {
            const userBets = bets.filter(b => b.discord_id === userId).slice(-5).reverse();
            let text = userBets.length > 0 
                ? userBets.map(b => '• Ván #' + b.game_id + ' | Cược: **' + b.choice + '** (' + b.amount.toLocaleString() + 'v) | KQ: **' + b.result + '** | Lời: **' + (b.profit >= 0 ? '+' : '') + b.profit.toLocaleString() + 'v**').join('\n')
                : 'Chưa có lịch sử cược nào.';

            const embed = new EmbedBuilder().setColor(0x9900FF).setTitle('📜 LỊCH SỬ CƯỢC GẦN NHẤT').setDescription(text);
            return message.reply({ embeds: [embed] });
        }

        if (command === '!naplichsu' || command === '/naplichsu') {
            const userNaps = Array.from(transactions.values()).filter(t => t.discord_id === userId && t.type === 'DEPOSIT').slice(-5).reverse();
            let text = userNaps.length > 0
                ? userNaps.map(t => '• #' + t.transaction_id + ' | **+' + t.amount.toLocaleString() + ' vàng** | Trạng thái: **' + t.status + '**').join('\n')
                : 'Chưa có lịch sử nạp.';
            const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('💎 LỊCH SỬ NẠP VÀNG').setDescription(text);
            return message.reply({ embeds: [embed] });
        }

        if (command === '!rutlichsu' || command === '/rutlichsu') {
            const userRuts = Array.from(transactions.values()).filter(t => t.discord_id === userId && t.type === 'WITHDRAW').slice(-5).reverse();
            let text = userRuts.length > 0
                ? userRuts.map(t => '• #' + t.transaction_id + ' | **-' + t.amount.toLocaleString() + ' vàng** | Trạng thái: **' + t.status + '**').join('\n')
                : 'Chưa có lịch sử rút.';
            const embed = new EmbedBuilder().setColor(0xFF4500).setTitle('💸 LỊCH SỬ RÚT VÀNG').setDescription(text);
            return message.reply({ embeds: [embed] });
        }

        if (command === '!thongke' || command === '/thongke') {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('📊 THỐNG KÊ NGƯỜI CHƠI: ' + message.author.username)
                .addFields(
                    { name: '💳 Số dư', value: user.balance.toLocaleString() + ' vàng', inline: true },
                    { name: '📥 Tổng nạp', value: user.total_deposit.toLocaleString() + ' vàng', inline: true },
                    { name: '📤 Tổng rút', value: user.total_withdraw.toLocaleString() + ' vàng', inline: true },
                    { name: '🎲 Tổng cược', value: user.total_bet_amount.toLocaleString() + ' vàng', inline: true },
                    { name: '🎮 Tổng ván', value: user.games_played + ' ván', inline: true },
                    { name: '📈 Tổng thắng', value: user.total_win.toLocaleString() + ' vàng', inline: true }
                );
            return message.reply({ embeds: [embed] });
        }

        if (command === '!cau' || command === '/cau') {
            const boardStr = '```\n' + renderBoardString() + '\n```';
            const embed = new EmbedBuilder()
                .setColor(0x9900FF)
                .setTitle('📊 BẢNG CẦU KẾT QUẢ TÀI XỈU')
                .setDescription(boardStr);
            return message.reply({ embeds: [embed] });
        }

        // --- CÁC LỆNH ADMIN ---
        if (command === '!congdiem' || command === '/congdiem') {
            if (!isAdmin(userId)) return message.reply('❌ Không có quyền!');
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!targetUser || isNaN(amount)) return message.reply('⚠️ Cú pháp: `!congdiem @User [số vàng]`');
            const tUser = getOrCreateUser(targetUser.id, targetUser.username);
            tUser.balance += amount;
            return message.reply('✅ Đã cộng **+' + amount.toLocaleString() + ' vàng** cho ' + targetUser + '.');
        }

        if (command === '!trudiem' || command === '/trudiem') {
            if (!isAdmin(userId)) return message.reply('❌ Không có quyền!');
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!targetUser || isNaN(amount)) return message.reply('⚠️ Cú pháp: `!trudiem @User [số vàng]`');
            const tUser = getOrCreateUser(targetUser.id, targetUser.username);
            tUser.balance = Math.max(0, tUser.balance - amount);
            return message.reply('✅ Đã trừ **-' + amount.toLocaleString() + ' vàng** của ' + targetUser + '.');
        }

        if (command === '!xemlichsu' || command === '/xemlichsu') {
            if (!isAdmin(userId)) return message.reply('❌ Không có quyền!');
            const targetUser = message.mentions.users.first();
            if (!targetUser) return message.reply('⚠️ Cú pháp: `!xemlichsu @User`');
            const userBets = bets.filter(b => b.discord_id === targetUser.id).slice(-10).reverse();
            let text = userBets.length > 0 
                ? userBets.map(b => '• Ván #' + b.game_id + ' | ' + b.choice + ' (' + b.amount.toLocaleString() + 'v) | KQ: ' + b.result).join('\n')
                : 'Chưa có lịch sử.';
            return message.reply({ embeds: [new EmbedBuilder().setTitle('Lịch sử của ' + targetUser.username).setDescription(text)] });
        }

        if (command === '!xemtatcapendingnap' || command === '/xemtatcapendingnap') {
            if (!isAdmin(userId)) return message.reply('❌ Không có quyền!');
            const allTxs = Array.from(transactions.values()).slice(-10).reverse();
            let text = allTxs.length > 0
                ? allTxs.map(t => '• [`' + t.transaction_id + '`] <@!' + t.discord_id + '> | ' + t.type + ' | **' + t.amount.toLocaleString() + 'v** | Trạng thái: **' + t.status + '**').join('\n')
                : 'Chưa có giao dịch.';
            return message.reply({ embeds: [new EmbedBuilder().setTitle('Giao dịch gần đây').setDescription(text)] });
        }
    });

    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'btn_mo_cuoc_tai' || customId === 'btn_mo_cuoc_xiu') {
                if (currentGame.status !== 'OPEN') {
                    return interaction.reply({ content: '❌ Ván game đã đóng đặt cược!', ephemeral: true });
                }

                const choiceType = customId.includes('tai') ? 'TAI' : 'XIU';
                const modalId = 'modal_cuoc_' + choiceType.toLowerCase();

                const modal = new ModalBuilder()
                    .setCustomId(modalId)
                    .setTitle('🎯 ĐẶT CƯỢC ' + choiceType);

                const inputAmount = new TextInputBuilder()
                    .setCustomId('input_amount_gold')
                    .setLabel('Nhập số vàng muốn cược (VD: 50000)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Nhập số nguyên dương...')
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(inputAmount));
                return await interaction.showModal(modal);
            }

            // Xử lý nút duyệt Nạp / Rút dành riêng cho Admin
            const parts = customId.split('_');
            const action = parts[0];
            const type = parts[1];
            const txId = parts.slice(2).join('_');
            const tx = transactions.get(txId);

            if (!tx) return interaction.reply({ content: '❌ Giao dịch không tồn tại.', ephemeral: true });
            if (tx.status !== 'PENDING') return interaction.reply({ content: '❌ Giao dịch đã được xử lý trước đó!', ephemeral: true });
            if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ Chỉ Quản trị viên mới có quyền!', ephemeral: true });

            const targetUser = getOrCreateUser(tx.discord_id);

            if (action === 'approve') {
                if (type === 'nap') {
                    targetUser.balance += tx.amount;
                    targetUser.total_deposit += tx.amount;
                    tx.status = 'COMPLETED';
                } else if (type === 'rut') {
                    if (targetUser.balance < tx.amount) {
                        return interaction.update({ content: '❌ Người chơi không đủ số dư để rút!', components: [] });
                    }
                    targetUser.balance -= tx.amount;
                    targetUser.total_withdraw += tx.amount;
                    tx.status = 'COMPLETED';
                }
                tx.admin_id = interaction.user.id;
                tx.completed_at = new Date();

                const oldEmbed = interaction.message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields(
                    oldEmbed.fields.map(field => {
                        if (field.name.includes('Trạng thái')) {
                            return { name: '⏳ Trạng thái', value: '✅ Đã xác nhận thành công bởi <@!' + interaction.user.id + '>', inline: false };
                        }
                        return field;
                    })
                ).setColor(0x00FF00);

                await interaction.update({ 
                    content: '✅ Giao dịch **' + txId + '** đã được **XÁC NHẬN**!', 
                    embeds: [updatedEmbed], 
                    components: [] 
                });
            } else if (action === 'reject') {
                tx.status = 'REJECTED';
                tx.admin_id = interaction.user.id;
                tx.completed_at = new Date();
                if (type === 'rut') targetUser.balance += tx.amount;

                const oldEmbed = interaction.message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(oldEmbed).setFields(
                    oldEmbed.fields.map(field => {
                        if (field.name.includes('Trạng thái')) {
                            return { name: '⏳ Trạng thái', value: '❌ Đã bị từ chối bởi <@!' + interaction.user.id + '>', inline: false };
                        }
                        return field;
                    })
                ).setColor(0xFF0000);

                await interaction.update({ 
                    content: '❌ Giao dịch **' + txId + '** đã bị **TỪ CHỐI**.', 
                    embeds: [updatedEmbed], 
                    components: [] 
                });
            }
        } 
        
        else if (interaction.isModalSubmit()) {
            const userId = interaction.user.id;
            const user = getOrCreateUser(userId, interaction.user.username);
            user.last_active = new Date();

            if (currentGame.status !== 'OPEN') {
                return interaction.reply({ content: '❌ Ván game đã đóng đặt cược!', ephemeral: true });
            }

            const rawInput = interaction.fields.getTextInputValue('input_amount_gold').replace(/[,.\s]/g, '');
            const amount = parseInt(rawInput);

            if (isNaN(amount) || amount <= 0) {
                return interaction.reply({ content: '⚠️ Số vàng nhập vào không hợp lệ!', ephemeral: true });
            }

            if (user.balance < amount) {
                return interaction.reply({ content: '❌ Số dư không đủ! Bạn chỉ có **' + user.balance.toLocaleString() + ' vàng**.', ephemeral: true });
            }

            const isTai = interaction.customId.includes('tai');
            user.balance -= amount;
            user.total_bet_amount += amount;

            if (isTai) currentGame.totalBetsTai += amount;
            else currentGame.totalBetsXiu += amount;

            currentGame.betsThisRound.set(userId, { choice: isTai ? 'TAI' : 'XIU', amount: amount, username: interaction.user.username });

            return interaction.reply({ 
                content: '✅ Bạn đã đặt thành công **' + amount.toLocaleString() + ' vàng** vào cửa **' + (isTai ? 'TÀI' : 'XỈU') + '**! Số dư còn lại: **' + user.balance.toLocaleString() + ' vàng**.', 
                ephemeral: true 
            });
        }
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
