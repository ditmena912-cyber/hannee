const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = (client) => {
    // Cấu hình ID kênh riêng cho Tài Xỉu (không ảnh hưởng kênh boss)
    const TARGET_CHANNEL_ID = '1551915282014933083'; 
    const SUPER_ADMIN_ID = '979587101328834621';
    const adminList = new Set([SUPER_ADMIN_ID]);

    const users = new Map();         
    const transactions = new Map();  
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

        let result = (dice1 === dice2 && dice2 === dice3) ? 'HOA' : (totalSum >= 11 ? 'TAI' : 'XIU');
        return { dice1, dice2, dice3, totalSum, result };
    }

    // Tự động khởi chạy ván game đầu tiên khi bot online
    setTimeout(async () => {
        try {
            const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
            if (channel) {
                const embedStart = new EmbedBuilder()
                    .setColor(0x00FFCC)
                    .setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId)
                    .setDescription('Thời gian đặt cược bắt đầu! Nhấn nút bên dưới để đặt cược nhanh.')
                    .addFields({ name: '⏳ Thời gian', value: currentGame.timeLeft + ' giây', inline: true })
                    .setTimestamp();
                
                const rowGame = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                );

                const msg = await channel.send({ embeds: [embedStart], components: [rowGame] });
                currentGame.messageId = msg.id;
            }
        } catch (e) {}
    }, 5000);

    // Vòng lặp đếm ngược Tài Xỉu
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
                            await msg.edit({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🔒 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐÃ KHÓA').setDescription('Đang tiến hành lắc xúc xắc...')], components: [] });
                        }
                    } catch (e) {}

                    setTimeout(async () => {
                        const roll = rollDiceBiased(currentGame.totalBetsTai, currentGame.totalBetsXiu);
                        updateScoreBoard(roll.result);

                        let winnersList = [], losersList = [];
                        for (let [userId, betInfo] of currentGame.betsThisRound.entries()) {
                            const user = getOrCreateUser(userId, betInfo.username);
                            user.games_played += 1;
                            if (betInfo.choice === roll.result) {
                                let profit = Math.floor(betInfo.amount * (roll.result === 'HOA' ? 4 : 1.8));
                                user.balance += profit;
                                winnersList.push('• <@!' + userId + '>: **+' + profit.toLocaleString() + ' vàng**');
                            } else {
                                user.total_loss += betInfo.amount;
                                losersList.push('• <@!' + userId + '>: **-' + betInfo.amount.toLocaleString() + ' vàng**');
                            }
                        }

                        const embedResult = new EmbedBuilder()
                            .setColor(roll.result === 'TAI' ? 0xF1C40F : 0x3498DB)
                            .setTitle('🎲 KẾT QUẢ PHIÊN #' + currentGame.gameId)
                            .addFields(
                                { name: '🎯 Xúc xắc', value: '**' + roll.dice1 + ' - ' + roll.dice2 + ' - ' + roll.dice3 + ' (' + roll.totalSum + ' điểm)**', inline: false },
                                { name: '🏆 Kết quả', value: '**' + (roll.result === 'TAI' ? '🟡 TÀI' : '🔵 XỈU') + '**', inline: false },
                                { name: '📊 Bảng Cầu', value: '```\n' + renderBoardString() + '\n```', inline: false }
                            );
                        await channel.send({ embeds: [embedResult] });

                        setTimeout(async () => {
                            currentGame.gameId += 1;
                            currentGame.status = 'OPEN';
                            currentGame.timeLeft = 60;
                            currentGame.totalBetsTai = 0;
                            currentGame.totalBetsXiu = 0;
                            currentGame.betsThisRound.clear();
                            if (historyColumns.length >= 20) historyColumns = [];

                            const newMsg = await channel.send({
                                embeds: [new EmbedBuilder().setColor(0x00FFCC).setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId).addFields({ name: '⏳ Thời gian', value: '60 giây', inline: true })],
                                components: [new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                                )]
                            });
                            currentGame.messageId = newMsg.id;
                        }, 3000);
                    }, 15000);
                }
            }
        } catch (err) {}
    }, 5000);

    // Lắng nghe lệnh chat trong kênh minigame
    client.on('messageCreate', async (message) => {
        if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;
        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const user = getOrCreateUser(message.author.id, message.author.username);

        if (command === '!sodu') return message.reply('💳 Số dư: **' + user.balance.toLocaleString() + ' vàng**');
        if (command === '!nap') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp: `!nap [số vàng]`');
            const txId = 'NAP-' + Math.floor(100000 + Math.random() * 900000);
            transactions.set(txId, { discord_id: message.author.id, type: 'nap', amount, status: 'PENDING' });
            return message.reply({ content: '🔔 Chờ Admin xác nhận nạp mã: `' + txId + '`', components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('approve_nap_' + txId).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('reject_nap_' + txId).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
            )] });
        }
        if (command === '!congdiem') {
            if (!isAdmin(message.author.id)) return message.reply('❌ Không có quyền!');
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!targetUser || isNaN(amount)) return message.reply('⚠️ Cú pháp: `!congdiem @User [số vàng]`');
            getOrCreateUser(targetUser.id, targetUser.username).balance += amount;
            return message.reply('✅ Đã cộng vàng thành công!');
        }
    });

    // Xử lý nút bấm và modal cược
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton()) {
            if (interaction.customId === 'btn_mo_cuoc_tai' || interaction.customId === 'btn_mo_cuoc_xiu') {
                if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Hết giờ cược!', ephemeral: true });
                const choice = interaction.customId.includes('tai') ? 'TAI' : 'XIU';
                const modal = new ModalBuilder().setCustomId('modal_cuoc_' + choice.toLowerCase()).setTitle('🎯 ĐẶT CƯỢC ' + choice);
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_amount_gold').setLabel('Nhập số vàng').setStyle(TextInputStyle.Short).setRequired(true)));
                return await interaction.showModal(modal);
            }
            // Xử lý nút duyệt nạp của admin
            const [action, type, txId] = interaction.customId.split('_');
            const tx = transactions.get(txId);
            if (tx && tx.status === 'PENDING' && isAdmin(interaction.user.id)) {
                if (action === 'approve') {
                    getOrCreateUser(tx.discord_id).balance += tx.amount;
                    tx.status = 'COMPLETED';
                    await interaction.update({ content: '✅ Đã duyệt giao dịch ' + txId, components: [] });
                }
            }
        } else if (interaction.isModalSubmit()) {
            if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Hết giờ!', ephemeral: true });
            const amount = parseInt(interaction.fields.getTextInputValue('input_amount_gold'));
            const user = getOrCreateUser(interaction.user.id, interaction.user.username);
            if (isNaN(amount) || amount <= 0 || user.balance < amount) return message.reply({ content: '❌ Không đủ số dư!', ephemeral: true });
            
            const isTai = interaction.customId.includes('tai');
            user.balance -= amount;
            if (isTai) currentGame.totalBetsTai += amount; else currentGame.totalBetsXiu += amount;
            currentGame.betsThisRound.set(interaction.user.id, { choice: isTai ? 'TAI' : 'XIU', amount, username: interaction.user.username });
            return interaction.reply({ content: '✅ Đã cược ' + amount.toLocaleString() + ' vàng!', ephemeral: true });
        }
    });
};
