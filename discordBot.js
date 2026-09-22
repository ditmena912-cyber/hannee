const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

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

// --- HÀM TIỆN ÍCH ---
const getOrCreateUser = (discordId, username = 'User') => {
    if (!users.has(discordId)) {
        users.set(discordId, {
            discord_id: discordId,
            username,
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
};

const isAdmin = (userId) => adminList.has(userId);

const updateScoreBoard = (resultType) => {
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
};

const renderBoardString = () => {
    if (historyColumns.length === 0) return 'Chưa có kết quả phiên nào.';
    let rows = Array(5).fill('');
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < historyColumns.length; c++) {
            const col = historyColumns[c];
            if (col[r]) {
                rows[r] += col[r] === 'TAI' ? '🟡 ' : (col[r] === 'XIU' ? '🔵 ' : '⚪ ');
            } else {
                rows[r] += '⠀  ';
            }
        }
    }
    return rows.join('\n');
};

const rollDiceBiased = (totalBetsTai, totalBetsXiu) => {
    let d1 = Math.floor(Math.random() * 6) + 1;
    let d2 = Math.floor(Math.random() * 6) + 1;
    let d3 = Math.floor(Math.random() * 6) + 1;
    let totalSum = d1 + d2 + d3;

    if (totalBetsTai !== totalBetsXiu && Math.random() < 0.62) {
        const heavier = totalBetsTai > totalBetsXiu ? 'TAI' : 'XIU';
        if (heavier === 'TAI' && totalSum >= 11) {
            d1 = Math.floor(Math.random() * 3) + 1;
            d2 = Math.floor(Math.random() * 3) + 1;
            d3 = Math.floor(Math.random() * 3) + 1;
            totalSum = d1 + d2 + d3;
        } else if (heavier === 'XIU' && totalSum < 11) {
            d1 = Math.floor(Math.random() * 3) + 4;
            d2 = Math.floor(Math.random() * 3) + 4;
            d3 = Math.floor(Math.random() * 3) + 4;
            totalSum = d1 + d2 + d3;
        }
    }

    const result = d1 === d2 && d2 === d3 ? 'HOA' : (totalSum >= 11 ? 'TAI' : 'XIU');
    return { dice1: d1, dice2: d2, dice3: d3, totalSum, result };
};

const createGameButtons = () => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
    );
};

// --- KHỞI TẠO CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`🤖 Bot Tài Xỉu đã sẵn sàng: ${client.user.tag}`);

    const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (channel) {
        const embed = new EmbedBuilder()
            .setColor(0x00FFCC)
            .setTitle(`🎲 BẮT ĐẦU PHIÊN CƯỢC #${currentGame.gameId}`)
            .setDescription('Thời gian đặt cược bắt đầu! Nhấn nút bên dưới để tham gia.')
            .addFields({ name: '⏳ Thời gian', value: `${currentGame.timeLeft} giây`, inline: true })
            .setTimestamp();
        
        const msg = await channel.send({ embeds: [embed], components: [createGameButtons()] });
        currentGame.messageId = msg.id;
    }

    // Vòng lặp game chính
    setInterval(async () => {
        try {
            const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
            if (!channel) return;

            if (currentGame.status === 'OPEN') {
                currentGame.timeLeft -= 5;
                const msg = await channel.messages.fetch(currentGame.messageId).catch(() => null);

                if (currentGame.timeLeft > 0) {
                    if (msg) {
                        const embed = new EmbedBuilder()
                            .setColor(0x00FFCC)
                            .setTitle(`🎲 PHIÊN CƯỢC #${currentGame.gameId} ĐANG DIỄN RA`)
                            .addFields(
                                { name: '⏳ Còn lại', value: `${currentGame.timeLeft} giây`, inline: true },
                                { name: '💰 Tổng Tài', value: `${currentGame.totalBetsTai.toLocaleString()}v`, inline: true },
                                { name: '💰 Tổng Xỉu', value: `${currentGame.totalBetsXiu.toLocaleString()}v`, inline: true }
                            )
                            .setTimestamp();
                        await msg.edit({ embeds: [embed], components: [createGameButtons()] }).catch(() => {});
                    }
                } else {
                    currentGame.status = 'CLOSED';
                    if (msg) {
                        const embedClosed = new EmbedBuilder()
                            .setColor(0xE74C3C)
                            .setTitle(`🔒 PHIÊN CƯỢC #${currentGame.gameId} ĐÃ KHÓA`)
                            .setDescription('Hết giờ cược! Đang lắc xúc xắc...')
                            .setTimestamp();
                        await msg.edit({ embeds: [embedClosed], components: [] }).catch(() => {});
                    }

                    setTimeout(async () => {
                        const roll = rollDiceBiased(currentGame.totalBetsTai, currentGame.totalBetsXiu);
                        updateScoreBoard(roll.result);

                        let winners = [], losers = [];
                        for (let [userId, bet] of currentGame.betsThisRound.entries()) {
                            const user = getOrCreateUser(userId, bet.username);
                            user.games_played++;
                            user.last_active = new Date();

                            let profit = 0;
                            if (bet.choice === roll.result) {
                                profit = Math.floor(bet.amount * (roll.result === 'HOA' ? 4 : 1.8));
                                user.balance += profit;
                                user.total_win += (profit - bet.amount);
                                winners.push(`• <@!\({userId}>: **+\){profit.toLocaleString()}v** (${bet.choice})`);
                            } else if (roll.result === 'HOA') {
                                user.balance += bet.amount;
                                winners.push(`• <@!\({userId}>: **Hoàn\){bet.amount.toLocaleString()}v**`);
                            } else {
                                user.total_loss += bet.amount;
                                profit = -bet.amount;
                                losers.push(`• <@!\({userId}>: **-\){bet.amount.toLocaleString()}v**`);
                            }

                            bets.push({
                                game_id: currentGame.gameId,
                                discord_id: userId,
                                choice: bet.choice,
                                amount: bet.amount,
                                result: roll.result,
                                profit
                            });
                        }

                        games.push({ game_id: currentGame.gameId, result: roll.result, status: 'COMPLETED' });

                        const resultColor = roll.result === 'TAI' ? 0xF1C40F : (roll.result === 'XIU' ? 0x3498DB : 0x2ECC71);
                        const embedResult = new EmbedBuilder()
                            .setColor(resultColor)
                            .setTitle(`🎲 KẾT QUẢ PHIÊN #${currentGame.gameId}`)
                            .addFields(
                                { name: '🎯 Xúc xắc', value: `**\({roll.dice1} -\){roll.dice2} - \({roll.dice3}** (\){roll.totalSum}đ)`, inline: false },
                                { name: '🏆 Kết quả', value: `**${roll.result}**`, inline: true },
                                { name: '📊 Bảng Cầu', value: `\`\`\`\n${renderBoardString()}\n\`\`\``, inline: false },
                                { name: '🎉 Thắng', value: winners.length ? winners.join('\n') : 'Không có', inline: false },
                                { name: '😢 Thua', value: losers.length ? losers.join('\n') : 'Không có', inline: false }
                            )
                            .setTimestamp();

                        await channel.send({ embeds: [embedResult] });

                        // Reset ván mới
                        setTimeout(async () => {
                            currentGame.gameId++;
                            currentGame.status = 'OPEN';
                            currentGame.timeLeft = 60;
                            currentGame.totalBetsTai = 0;
                            currentGame.totalBetsXiu = 0;
                            currentGame.betsThisRound.clear();
                            if (historyColumns.length >= 20) historyColumns = [];

                            const embedNew = new EmbedBuilder()
                                .setColor(0x00FFCC)
                                .setTitle(`🎲 BẮT ĐẦU PHIÊN CƯỢC #${currentGame.gameId}`)
                                .addFields({ name: '⏳ Thời gian', value: '60 giây', inline: true })
                                .setTimestamp();

                            const newMsg = await channel.send({ embeds: [embedNew], components: [createGameButtons()] });
                            currentGame.messageId = newMsg.id;
                        }, 3000);
                    }, 1500);
                }
            }
        } catch (err) {
            console.error('[Game Loop Error]:', err.message);
        }
    }, 5000);
});

// --- XỬ LÝ TIN NHẮN & LỆNH ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;

    const args = message.content.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    const userId = message.author.id;
    const user = getOrCreateUser(userId, message.author.username);
    user.last_active = new Date();

    if (['!huongdan', '/huongdan'].includes(cmd)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('📖 HƯỚNG DẪN').setDescription('• Dùng các nút bấm để cược Tài/Xỉu.\n• Lệnh: `/sodu`, `/lichsu`, `/cau`, `/nap`, `/rut`.')] });
    }

    if (['!sodu', '/sodu'].includes(cmd)) {
        return message.reply(`💳 Số dư: **${user.balance.toLocaleString()} vàng**`);
    }

    if (['!cau', '/cau'].includes(cmd)) {
        return message.reply({ embeds: [new EmbedBuilder().setColor(0x9900FF).setTitle('📊 BẢNG CẦU').setDescription(`\`\`\`\n${renderBoardString()}\n\`\`\``)] });
    }

    if (['!nap', '/nap'].includes(cmd) || ['!rut', '/rut'].includes(cmd)) {
        const isNap = cmd.includes('nap');
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp không hợp lệ!');
        if (!isNap && user.balance < amount) return message.reply('❌ Không đủ số dư!');

        const txId = `\({isNap ? 'NAP' : 'RUT'}-\){Math.floor(100000 + Math.random() * 900000)}`;
        transactions.set(txId, { transaction_id: txId, discord_id: userId, type: isNap ? 'DEPOSIT' : 'WITHDRAW', amount, status: 'PENDING' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`approve_\({isNap ? 'nap' : 'rut'}_\){txId}`).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_\({isNap ? 'nap' : 'rut'}_\){txId}`).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
        );

        const embed = new EmbedBuilder().setColor(isNap ? 0xFFD700 : 0xFF4500)
            .setTitle(isNap ? '💎 YÊU CẦU NẠP' : '💸 YÊU CẦU RÚT')
            .addFields({ name: 'Mã', value: txId }, { name: 'Số lượng', value: `${amount.toLocaleString()}v` });

        return message.reply({ content: '🔔 Có giao dịch mới cần Admin duyệt!', embeds: [embed], components: [row] });
    }

    // Lệnh Admin cơ bản
    if (['!congdiem', '/congdiem'].includes(cmd) && isAdmin(userId)) {
        const target = message.mentions.users.first();
        const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return message.reply('⚠️ Sai cú pháp: `!congdiem @User [số vàng]`');
        getOrCreateUser(target.id, target.username).balance += amount;
        return message.reply(`✅ Đã cộng \({amount.toLocaleString()}v cho\){target}.`);
    }
});

// --- XỬ LÝ INTERACTION (BUTTON & MODAL) ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('btn_mo_cuoc_')) {
            if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Đã hết giờ cược!', ephemeral: true });
            const choice = interaction.customId.includes('tai') ? 'TAI' : 'XIU';
            
            const modal = new ModalBuilder().setCustomId(`modal_cuoc_\({choice.toLowerCase()}`).setTitle(`🎯 ĐẶT CƯỢC\){choice}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId('input_amount_gold').setLabel('Số vàng cược').setStyle(TextInputStyle.Short).setRequired(true)
            ));
            return await interaction.showModal(modal);
        }

        // Xử lý Duyệt Nạp/Rút của Admin
        const [action, type, txId] = interaction.customId.split('_');
        const tx = transactions.get(txId);
        if (!tx || tx.status !== 'PENDING') return interaction.reply({ content: '❌ Giao dịch không hợp lệ hoặc đã xử lý.', ephemeral: true });
        if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ Không có quyền!', ephemeral: true });

        const targetUser = getOrCreateUser(tx.discord_id);
        if (action === 'approve') {
            if (type === 'nap') { targetUser.balance += tx.amount; targetUser.total_deposit += tx.amount; }
            else { 
                if (targetUser.balance < tx.amount) return interaction.update({ content: '❌ Người chơi không đủ tiền rút!', components: [] });
                targetUser.balance -= tx.amount; targetUser.total_withdraw += tx.amount; 
            }
            tx.status = 'COMPLETED';
        } else {
            tx.status = 'REJECTED';
            if (type === 'rut') targetUser.balance += tx.amount; // Hoàn tiền nếu từ chối rút
        }

        await interaction.update({ content: `✅ Giao dịch \({txId} đã được xử lý (\){tx.status}).`, embeds: [], components: [] });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_cuoc_')) {
        if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Đã đóng cược!', ephemeral: true });
        
        const amount = parseInt(interaction.fields.getTextInputValue('input_amount_gold'));
        if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Số vàng không hợp lệ!', ephemeral: true });

        const userId = interaction.user.id;
        const user = getOrCreateUser(userId, interaction.user.username);
        if (user.balance < amount) return interaction.reply({ content: '❌ Không đủ số dư!', ephemeral: true });
        if (currentGame.betsThisRound.has(userId)) return interaction.reply({ content: '❌ Bạn đã cược ván này rồi!', ephemeral: true });

        const choice = interaction.customId.includes('tai') ? 'TAI' : 'XIU';
        user.balance -= amount;
        user.total_bet_amount += amount;
        
        if (choice === 'TAI') currentGame.totalBetsTai += amount;
        else currentGame.totalBetsXiu += amount;

        currentGame.betsThisRound.set(userId, { username: interaction.user.username, choice, amount });
        return interaction.reply({ content: `✅ Đã cược thành công **\({amount.toLocaleString()}v** vào **\){choice}**!`, ephemeral: true });
    }
});

client.login(process.env.DISCORD_TOKEN);
