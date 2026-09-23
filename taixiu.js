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
const SUPER_ADMIN_ID = '979587101328834621';     // ID Admin tối cao

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
                { name: '📊 Bảng Cầu Gần Nhất', value: `\`\`\`\n${renderBoardString()}\n\`\`\``, inline: false }
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
                        { name: '📊 Bảng Cầu Gần Nhất', value: `\`\`\`\n${renderBoardString()}\n\`\`\``, inline: false }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_tai').setLabel('CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_xiu').setLabel('CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                );
                await msg.edit({ embeds: [embedUpdate], components: [row] }).catch(() => {});
            } else {
                currentGame.status = 'LOCKED';
                const embedLock = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle(`🔒 PHIÊN CƯỢC #${currentGame.gameId} ĐÃ KHÓA`)
                    .setDescription('Hết thời gian đặt cược! Đang tiến hành lắc xúc xắc...')
                    .addFields(
                        { name: '⏳ Trạng thái', value: '🔒 **ĐÃ KHÓA CƯỢC**', inline: true },
                        { name: '💰 Tổng cược TÀI', value: `${currentGame.totalBetsTai.toLocaleString()} vàng`, inline: true },
                        { name: '💰 Tổng cược XỈU', value: `${currentGame.totalBetsXiu.toLocaleString()} vàng`, inline: true }
                    );
                await msg.edit({ embeds: [embedLock], components: [] }).catch(() => {});

                setTimeout(async () => {
                    const roll = rollDice();
                    updateScoreBoard(roll.result);

                    let winnersList = [];
                    let losersList = [];
                    const timeString = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

                    for (let [userId, bet] of currentGame.betsThisRound.entries()) {
                        const user = getOrCreateUser(userId, bet.username);
                        user.games_played += 1;
                        user.total_bet_amount += bet.amount;

                        let historyList = currentGame.userHistory.get(userId) || [];
                        if (historyList.length >= 10) historyList.pop();

                        let record = {
                            roundId: currentGame.gameId,
                            choice: bet.choice,
                            amount: bet.amount,
                            result: roll.result,
                            profit: 0,
                            time: timeString
                        };

                        if (bet.choice === roll.result) {
                            let reward = Math.floor(bet.amount * (roll.result === 'HOA' ? 8 : 1.95));
                            user.balance += reward;
                            let profit = reward - bet.amount;
                            user.total_win += profit;
                            record.profit = `+${reward}`;
                            winnersList.push(`• **\({bet.username}**: +\){reward.toLocaleString()} vàng [${bet.amount.toLocaleString()} cược]`);
                            historyList.unshift(record);
                        } else {
                            user.total_loss += bet.amount;
                            record.profit = `-${bet.amount}`;
                            losersList.push(`• **\({bet.username}**: -\){bet.amount.toLocaleString()} vàng [${bet.choice}]`);
                            historyList.unshift(record);
                        }
                        currentGame.userHistory.set(userId, historyList);
                    }

                    const resultTextDisplay = roll.result === 'TAI' ? '🟡 TÀI' : (roll.result === 'XIU' ? '🔵 XỈU' : '🟢 HÒA (BÃO)');

                    const embedResult = new EmbedBuilder()
                        .setColor(roll.result === 'TAI' ? 0xF1C40F : (roll.result === 'XIU' ? 0x3498DB : 0x2ECC71))
                        .setTitle(`🎲 KẾT QUẢ PHIÊN #${currentGame.gameId}`)
                        .addFields(
                            { name: '🎯 Xúc xắc', value: `**\({roll.dice1} -\){roll.dice2} -${roll.dice3}**`, inline: true },
                            { name: '⚖️ Tổng điểm', value: `**${roll.totalSum} điểm**`, inline: true },
                            { name: '🏆 Kết quả', value: `**${resultTextDisplay}**`, inline: false },
                            { name: '📊 Bảng Cầu Gần Nhất', value: `\`\`\`\n${renderBoardString()}\n\`\`\``, inline: false },
                            { name: '🎉 Danh Sách Thắng', value: winnersList.length > 0 ? winnersList.join('\n') : 'Không có người chơi thắng ở ván này.', inline: false },
                            { name: '😢 Danh Sách Thua', value: losersList.length > 0 ? losersList.join('\n') : 'Không có người chơi thua.', inline: false }
                        )
                        .setTimestamp();

                    await channel.send({ embeds: [embedResult] });

                    setTimeout(() => {
                        currentGame.gameId += 1;
                        startNewGameCycle();
                    }, 3000);

                }, 3000);
            }
        }
    } catch (e) {}
}, 5000);

client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;
    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    const user = getOrCreateUser(message.author.id, message.author.username);

    if (cmd === '!sodu') return message.reply(`💳 Số dư: **${user.balance.toLocaleString()} vàng**`);
    if (cmd === '!cau') return message.reply(`📊 **Bảng Cầu Tài Xỉu:**\n\`\`\`\n${renderBoardString()}\n\`\`\``);

    if (cmd === '!lichsu' || cmd === '!thongke') {
        const history = currentGame.userHistory.get(message.author.id) || [];
        const embedHistory = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`📊 THÔNG TIN TÀI KHOẢN & LỊCH SỬ CƯỢC`)
            .addFields(
                { name: '👤 Người chơi', value: `${message.author.username}`, inline: true },
                { name: '💳 Số dư hiện tại', value: `**${user.balance.toLocaleString()} vàng**`, inline: true },
                { name: '🎮 Tổng ván đã chơi', value: `${user.games_played} ván`, inline: true },
                { name: '💰 Tổng tiền đã cược', value: `${user.total_bet_amount.toLocaleString()} vàng`, inline: true },
                { name: '📈 Tổng thắng', value: `+${user.total_win.toLocaleString()} vàng`, inline: true },
                { name: '📉 Tổng thua', value: `-${user.total_loss.toLocaleString()} vàng`, inline: true }
            );

        if (history.length > 0) {
            let histText = history.slice(0, 5).map(h => 
                `• Phiên **#\({h.roundId}** | Cược: **\){h.amount.toLocaleString()}** [\({h.choice}] | Kết quả: **\){h.result}** | Lợi nhuận: **\({h.profit}** | ⏰ *\){h.time}*`
            ).join('\n');
            embedHistory.addFields({ name: '📜 5 Ván Cược Gần Nhất', value: histText, inline: false });
        } else {
            embedHistory.addFields({ name: '📜 5 Ván Cược Gần Nhất', value: 'Chưa có lịch sử đặt cược nào.', inline: false });
        }
        return message.reply({ embeds: [embedHistory] });
    }

    if (cmd === '!nap') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp đúng: `!nap [số vàng]`');
        
        const txId = 'NAP' + Math.floor(100000 + Math.random() * 900000);
        transactions.set(txId, { userId: message.author.id, username: message.author.username, amount, status: 'PENDING' });

        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => message.channel);
        const embedAdmin = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`🔔 YÊU CẦU NẠP VÀNG MỚI [#${txId}]`)
            .addFields(
                { name: '👤 Người chơi', value: `\({message.author} (\){message.author.username})`, inline: true },
                { name: '💰 Số vàng nạp', value: `**${amount.toLocaleString()} vàng**`, inline: true },
                { name: '📌 Trạng thái', value: '⏳ **Đang chờ Admin duyệt**', inline: false }
            )
            .setTimestamp();

        const rowAdmin = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_nap_${txId}`).setLabel('✅ Xác Nhận').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_nap_${txId}`).setLabel('❌ Từ Chối').setStyle(ButtonStyle.Danger)
        );

        await adminChannel.send({ embeds: [embedAdmin], components: [rowAdmin] });
        return message.reply(`✅ Đã gửi yêu cầu nạp **\({amount.toLocaleString()} vàng** (Mã: \`\){txId}\`) đến Admin.`);
    }

    if (cmd === '!rut') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp đúng: `!rut [số vàng]`');
        if (user.balance < amount) return message.reply('❌ Số dư không đủ để rút!');
        user.balance -= amount;
        user.total_withdraw += amount;
        return message.reply(`✅ Yêu cầu rút **${amount.toLocaleString()} vàng** thành công!`);
    }

    // --- QUẢN TRỊ ADMIN ---
    if (cmd === '!themadmin') {
        if (!isSuperAdmin(message.author.id)) return message.reply('❌ Chỉ Admin tối cao mới có quyền này!');
        const target = message.mentions.users.first();
        if (!target) return message.reply('⚠️ Cú pháp: `!themadmin @User`');
        subAdmins.add(target.id);
        return message.reply(`✅ Đã cấp quyền **Admin phụ** cho ${target.username}!`);
    }

    if (cmd === '!xoaadmin') {
        if (!isSuperAdmin(message.author.id)) return message.reply('❌ Chỉ Admin tối cao mới có quyền này!');
        const target = message.mentions.users.first();
        if (!target) return message.reply('⚠️ Cú pháp: `!xoaadmin @User`');
        if (superAdmins.has(target.id)) return message.reply('❌ Không thể xóa Admin tối cao!');
        subAdmins.delete(target.id);
        return message.reply(`✅ Đã tước quyền Admin của ${target.username}!`);
    }

    if (cmd === '!congdiem') {
        if (!isAdmin(message.author.id)) return message.reply('❌ Bạn không có quyền!');
        const target = message.mentions.users.first();
        const amt = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply('⚠️ Cú pháp: `!congdiem @User [số vàng]`');
        getOrCreateUser(target.id, target.username).balance += amt;
        return message.reply(`✅ Đã cộng **\({amt.toLocaleString()} vàng** cho\){target.username}!`);
    }

    if (cmd === '!trudiem') {
        if (!isAdmin(message.author.id)) return message.reply('❌ Bạn không có quyền!');
        const target = message.mentions.users.first();
        const amt = parseInt(args[2]);
        const reason = args.slice(3).join(' ');
        if (!target || isNaN(amt) || !reason) return message.reply('⚠️ Cú pháp: `!trudiem @User [số vàng] [Lý do trừ]`');

        const targetUser = getOrCreateUser(target.id, target.username);
        if (targetUser.balance < amt) return message.reply(`❌ Số dư của ${target.username} không đủ!`);

        targetUser.balance -= amt;
        try { await target.send(`⚠️ Tài khoản bị trừ **\({amt.toLocaleString()} vàng**.\n📌 **Lý do:**\){reason}`); } catch (e) {}
        return message.reply(`✅ Đã trừ **\({amt.toLocaleString()} vàng** của\){target.username}.\n📌 **Lý do:** ${reason}`);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('accept_nap_') || interaction.customId.startsWith('reject_nap_')) {
            if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ Không có quyền!', ephemeral: true });

            const isAccept = interaction.customId.startsWith('accept_nap_');
            const txId = interaction.customId.replace(isAccept ? 'accept_nap_' : 'reject_nap_', '');
            const tx = transactions.get(txId);

            if (!tx || tx.status !== 'PENDING') return interaction.reply({ content: '⚠️ Giao dịch không tồn tại hoặc đã xử lý!', ephemeral: true });

            if (isAccept) {
                tx.status = 'APPROVED';
                const targetUser = getOrCreateUser(tx.userId, tx.username);
                targetUser.balance += tx.amount;
                targetUser.total_deposit += tx.amount;

                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x2ECC71)
                    .setFields(
                        { name: '👤 Người chơi', value: `<@${tx.userId}>`, inline: true },
                        { name: '💰 Số vàng nạp', value: `**${tx.amount.toLocaleString()} vàng**`, inline: true },
                        { name: '📌 Trạng thái', value: `✅ **ĐÃ XÁC NHẬN bởi ${interaction.user.username}**`, inline: false }
                    );
                await interaction.update({ embeds: [updatedEmbed], components: [] });
            } else {
                tx.status = 'REJECTED';
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xE74C3C)
                    .setFields(
                        { name: '👤 Người chơi', value: `<@${tx.userId}>`, inline: true },
                        { name: '💰 Số vàng nạp', value: `**${tx.amount.toLocaleString()} vàng**`, inline: true },
                        { name: '📌 Trạng thái', value: `❌ **ĐÃ BỊ TỪ CHỐI bởi ${interaction.user.username}**`, inline: false }
                    );
                await interaction.update({ embeds: [updatedEmbed], components: [] });
            }
            return;
        }

        if (interaction.customId === 'btn_tai' || interaction.customId === 'btn_xiu') {
            if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Phiên cược đã khóa!', ephemeral: true });
            const choice = interaction.customId === 'btn_tai' ? 'TAI' : 'XIU';
            const modal = new ModalBuilder()
                .setCustomId(`modal_datcuoc_${choice}`)
                .setTitle(`🎯 ĐẶT CƯỢC CỬA ${choice}`);

            const inputAmount = new TextInputBuilder()
                .setCustomId('amount_input')
                .setLabel('Nhập số vàng muốn cược')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ví dụ: 10000')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputAmount));
            return await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Đã hết thời gian cược!', ephemeral: true });
        const choice = interaction.customId.includes('TAI') ? 'TAI' : 'XIU';
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));
        const user = getOrCreateUser(interaction.user.id, interaction.user.username);

        if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Số tiền không hợp lệ!', ephemeral: true });
        if (user.balance < amount) return interaction.reply({ content: `❌ Số dư không đủ!`, ephemeral: true });

        user.balance -= amount;
        if (choice === 'TAI') currentGame.totalBetsTai += amount;
        else currentGame.totalBetsXiu += amount;

        currentGame.betsThisRound.set(interaction.user.id, { choice, amount, username: interaction.user.username });
        return interaction.reply({ content: `✅ Đã cược **\({amount.toLocaleString()} vàng** vào cửa **\){choice}**!`, ephemeral: true });
    }
});

client.login(process.env.GAME_BOT_TOKEN || process.env.DISCORD_TOKEN);
