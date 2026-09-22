const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getAuthPanel, handleAuthInteraction, isLoggedIn } = require('./authManager');

const PUBLIC_CHANNEL_ID = '1552069701843161098'; // ID Kênh công khai (nơi gửi bảng đăng nhập)
const PRIVATE_CHANNEL_ID = '1551915282014933083'; // ID Phòng mini-game riêng tư
const SUPER_ADMIN_ID = '979587101328834621';
const adminList = new Set([SUPER_ADMIN_ID]);

const users = new Map();         
const transactions = new Map();  
const bets = [];                 
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
            balance: 100000, // Tặng sẵn 100k vàng test khi tạo user
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

        // 1. Gửi bảng đăng nhập ra kênh công khai
        try {
            const publicChannel = await client.channels.fetch(PUBLIC_CHANNEL_ID);
            if (publicChannel) {
                await publicChannel.send(getAuthPanel());
            }
        } catch (e) {
            console.error('Không tìm thấy kênh công khai:', e.message);
        }

        // 2. Khởi chạy bàn cược tự động trong phòng mini-game riêng tư
        try {
            const privateChannel = await client.channels.fetch(PRIVATE_CHANNEL_ID);
            if (privateChannel) {
                const embedStart = new EmbedBuilder()
                    .setColor(0x00FFCC)
                    .setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId)
                    .setDescription('Thời gian đặt cược bắt đầu! Nhấn nút bên dưới để cược.')
                    .addFields({ name: '⏳ Thời gian', value: currentGame.timeLeft + ' giây', inline: true })
                    .setTimestamp();
                
                const rowGame = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                );

                const msg = await privateChannel.send({ embeds: [embedStart], components: [rowGame] });
                currentGame.messageId = msg.id;
            }
        } catch (e) {
            console.error('Không tìm thấy phòng mini-game riêng tư:', e.message);
        }

        // Vòng lặp đếm ngược và lắc xúc xắc mỗi 5 giây
        setInterval(async () => {
            try {
                const privateChannel = await client.channels.fetch(PRIVATE_CHANNEL_ID);
                if (!privateChannel) return;

                if (currentGame.status === 'OPEN') {
                    currentGame.timeLeft -= 5;
                    if (currentGame.timeLeft > 0) {
                        try {
                            const msg = await privateChannel.messages.fetch(currentGame.messageId);
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
                        try {
                            const msg = await privateChannel.messages.fetch(currentGame.messageId);
                            if (msg) {
                                await msg.edit({ embeds: [new EmbedBuilder().setColor(0xE74C3C).setTitle('🔒 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐÃ KHÓA').setDescription('Đang lắc xúc xắc...')], components: [] });
                            }
                        } catch (e) {}

                        setTimeout(async () => {
                            const roll = rollDiceBiased(currentGame.totalBetsTai, currentGame.totalBetsXiu);
                            updateScoreBoard(roll.result);

                            let winnersList = [];
                            let losersList = [];

                            for (let [userId, betInfo] of currentGame.betsThisRound.entries()) {
                                const user = getOrCreateUser(userId, betInfo.username);
                                user.games_played += 1;
                                let profit = 0;

                                if (betInfo.choice === roll.result) {
                                    profit = Math.floor(betInfo.amount * 1.8);
                                    user.balance += profit;
                                    user.total_win += (profit - betInfo.amount);
                                    winnersList.push(`<@!\({userId}>: **+\){profit.toLocaleString()} vàng**`);
                                } else {
                                    user.total_loss += betInfo.amount;
                                    losersList.push(`<@!${userId}>: **-${betInfo.amount.toLocaleString()} vàng**`);
                                }

                                bets.push({ game_id: currentGame.gameId, discord_id: userId, choice: betInfo.choice, amount: betInfo.amount, result: roll.result, profit });
                            }

                            const embedResult = new EmbedBuilder()
                                .setColor(roll.result === 'TAI' ? 0xF1C40F : 0x3498DB)
                                .setTitle('🎲 KẾT QUẢ PHIÊN #' + currentGame.gameId)
                                .addFields(
                                    { name: '🎯 Xúc xắc', value: `**\({roll.dice1} -\){roll.dice2} - \({roll.dice3}** (\){roll.totalSum} điểm)`, inline: false },
                                    { name: '🏆 Kết quả', value: `**${roll.result}**`, inline: false },
                                    { name: '📊 Bảng Cầu', value: '```\n' + renderBoardString() + '\n```', inline: false },
                                    { name: '🎉 Thắng', value: winnersList.length ? winnersList.join('\n') : 'Không có', inline: true },
                                    { name: '😢 Thua', value: losersList.length ? losersList.join('\n') : 'Không có', inline: true }
                                );

                            await privateChannel.send({ embeds: [embedResult] });

                            setTimeout(async () => {
                                currentGame.gameId += 1;
                                currentGame.status = 'OPEN';
                                currentGame.timeLeft = 60;
                                currentGame.totalBetsTai = 0;
                                currentGame.totalBetsXiu = 0;
                                currentGame.betsThisRound.clear();

                                const newMsg = await privateChannel.send({
                                    embeds: [new EmbedBuilder().setColor(0x00FFCC).setTitle('🎲 BẮT ĐẦU PHIÊN CƯỢC #' + currentGame.gameId).addFields({ name: '⏳ Thời gian', value: '60 giây', inline: true })],
                                    components: [new ActionRowBuilder().addComponents(
                                        new ButtonBuilder().setCustomId('btn_mo_cuoc_tai').setLabel('🟡 CƯỢC TÀI').setStyle(ButtonStyle.Primary),
                                        new ButtonBuilder().setCustomId('btn_mo_cuoc_xiu').setLabel('🔵 CƯỢC XỈU').setStyle(ButtonStyle.Danger)
                                    )]
                                });
                                currentGame.messageId = newMsg.id;
                            }, 3000);
                        }, 5000);
                    }
                }
            } catch (err) {}
        }, 5000);
    });

    // Lắng nghe lệnh chat ở phòng mini-game (Yêu cầu phải đăng nhập mới dùng được)
    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.id !== PRIVATE_CHANNEL_ID) return;

        if (!isLoggedIn(message.author.id)) {
            return message.delete().catch(() => {});
        }

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const userId = message.author.id;
        const user = getOrCreateUser(userId, message.author.username);

        if (command === '!sodu' || command === '/sodu') {
            return message.reply('💳 Số dư tài khoản của bạn: **' + user.balance.toLocaleString() + ' vàng**');
        }
    });

    // Lắng nghe tương tác nút bấm và modal
    client.on('interactionCreate', async (interaction) => {
        // Xử lý đăng nhập, đăng ký, đăng xuất từ authManager
        if (
            interaction.customId === 'btn_open_dangky' || 
            interaction.customId === 'btn_open_dangnhap' || 
            interaction.customId === 'btn_dangxuat' ||
            interaction.customId === 'modal_dangky' || 
            interaction.customId === 'modal_dangnhap'
        ) {
            return await handleAuthInteraction(interaction);
        }

        // Chặn người chưa đăng nhập bấm nút đặt cược trong phòng game
        if (!isLoggedIn(interaction.user.id)) {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                return interaction.reply({ content: '❌ Bạn cần đăng nhập tài khoản ở kênh công khai trước khi tham gia trò chơi!', ephemeral: true });
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_mo_cuoc_tai' || interaction.customId === 'btn_mo_cuoc_xiu') {
                if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Đã hết thời gian cược!', ephemeral: true });

                const choiceType = interaction.customId.includes('tai') ? 'TAI' : 'XIU';
                const modal = new ModalBuilder().setCustomId('modal_cuoc_' + choiceType.toLowerCase()).setTitle('🎯 ĐẶT CƯỢC ' + choiceType);
                modal.addComponents(new ActionRowBuilder().addComponents(
                    new TextInputBuilder().setCustomId('input_amount_gold').setLabel('Số vàng muốn cược').setStyle(TextInputStyle.Short).setRequired(true)
                ));
                return await interaction.showModal(modal);
            }
        } else if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_cuoc_')) {
            if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Đã hết thời gian cược!', ephemeral: true });

            const userId = interaction.user.id;
            const user = getOrCreateUser(userId, interaction.user.username);
            const amount = parseInt(interaction.fields.getTextInputValue('input_amount_gold').replace(/[,.\s]/g, ''));

            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '⚠️ Số vàng không hợp lệ!', ephemeral: true });
            if (user.balance < amount) return interaction.reply({ content: '❌ Số dư không đủ!', ephemeral: true });

            const isTai = interaction.customId.includes('tai');
            user.balance -= amount;
            user.total_bet_amount += amount;

            if (isTai) currentGame.totalBetsTai += amount;
            else currentGame.totalBetsXiu += amount;

            currentGame.betsThisRound.set(userId, { choice: isTai ? 'TAI' : 'XIU', amount: amount, username: interaction.user.username });

            return interaction.reply({ content: '✅ Đã đặt **' + amount.toLocaleString() + ' vàng** vào cửa **' + (isTai ? 'TÀI' : 'XỈU') + '**!', ephemeral: true });
        }
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
