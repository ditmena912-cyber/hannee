const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
const http = require('http');

// Tạo HTTP Server nhỏ để Render không bị lỗi Port / Health Check
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Tai Xiu is running 24/7!\n');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`HTTP Server đang lắng nghe trên cổng ${PORT}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

const TARGET_CHANNEL_ID = '1551915282014933083'; 
const ADMIN_CHANNEL_ID = '1551915282014933083';  
const SUPER_ADMIN_ID = '979587101328834621';     

const superAdmins = new Set([SUPER_ADMIN_ID]);
const subAdmins = new Set(); 

const users = new Map();         
const transactions = new Map();  
let historyColumns = [];         
let forcedWinRate = null; 

let currentGame = {
    gameId: 1,
    status: 'OPEN', 
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
            txHistory: [], 
            created_at: new Date()
        });
    }
    return users.get(discordId);
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
    if (historyColumns.length === 0) return 'Chưa có dữ liệu phiên trước.';
    let rows = ['', '', '', '', ''];
    for (let r = 0; r < 5; r++) {
        let rowStr = '';
        for (let c = 0; c < historyColumns.length; c++) {
            const col = historyColumns[c];
            if (col[r]) {
                if (col[r] === 'TAI') rowStr += '🔴 ';
                else if (col[r] === 'XIU') rowStr += '🔵 ';
                else rowStr += '🟡 '; 
            } else {
                if (r >= col.length) rowStr += '⚪ ';
            }
        }
        rows[r] = rowStr;
    }
    return rows.join('\n');
}

function rollDiceWithControl() {
    if (forcedWinRate !== null && currentGame.betsThisRound.size > 0) {
        const rollCheck = Math.random(); 
        let taiAmount = 0, xiuAmount = 0;
        for (let bet of currentGame.betsThisRound.values()) {
            if (bet.choice === 'TAI') taiAmount += bet.amount;
            if (bet.choice === 'XIU') xiuAmount += bet.amount;
        }

        const playerShouldWin = rollCheck <= forcedWinRate;
        let targetResult = 'TAI';
        if (taiAmount > xiuAmount) {
            targetResult = playerShouldWin ? 'TAI' : 'XIU';
        } else {
            targetResult = playerShouldWin ? 'XIU' : 'TAI';
        }

        let dice1, dice2, dice3, totalSum, result;
        do {
            dice1 = Math.floor(Math.random() * 6) + 1;
            dice2 = Math.floor(Math.random() * 6) + 1;
            dice3 = Math.floor(Math.random() * 6) + 1;
            totalSum = dice1 + dice2 + dice3;
            result = (dice1 === dice2 && dice2 === dice3) ? 'HOA' : (totalSum >= 11 ? 'TAI' : 'XIU');
        } while (result !== targetResult && result !== 'HOA');

        return { dice1, dice2, dice3, totalSum, result };
    }

    const dice1 = Math.floor(Math.random() * 6) + 1;
    const dice2 = Math.floor(Math.random() * 6) + 1;
    const dice3 = Math.floor(Math.random() * 6) + 1;
    const totalSum = dice1 + dice2 + dice3;
    let result = (dice1 === dice2 && dice2 === dice3) ? 'HOA' : (totalSum >= 11 ? 'TAI' : 'XIU');
    return { dice1, dice2, dice3, totalSum, result };
}

const commands = [
    new SlashCommandBuilder().setName('sodu').setDescription('Kiểm tra số dư vàng hiện tại'),
    new SlashCommandBuilder().setName('cau').setDescription('Xem bảng cầu Tài Xỉu gần nhất'),
    new SlashCommandBuilder().setName('lichsu').setDescription('Xem lịch sử cá nhân và giao dịch'),
    new SlashCommandBuilder().setName('nap').setDescription('Nạp vàng vào tài khoản')
        .addIntegerOption(option => option.setName('soluong').setDescription('Số vàng muốn nạp').setRequired(true)),
    new SlashCommandBuilder().setName('rut').setDescription('Rút vàng khỏi tài khoản')
        .addIntegerOption(option => option.setName('soluong').setDescription('Số vàng muốn rút').setRequired(true)),
    new SlashCommandBuilder().setName('setwwin').setDescription('[Admin] Chỉnh tỉ lệ thắng ẩn')
        .addStringOption(option => option.setName('tile').setDescription('Nhập tỉ lệ như 20%, 50%, 80% hoặc reset').setRequired(true))
].map(command => command.toJSON());

client.once('ready', async () => {
    console.log(`Bot đã sẵn sàng trên Render dưới tên ${client.user.tag}!`);
    
    const rest = new REST({ version: '10' }).setToken(process.env.GAME_BOT_TOKEN || process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Đã đăng ký thành công Slash Commands trên Discord!');
    } catch (error) {
        console.error(error);
    }

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
            .setTitle('🎲 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐANG DIỄN RA')
            .setDescription('Sử dụng các nút bên dưới để chọn cửa cược nhanh:')
            .addFields(
                { name: '⏱️ Thời gian còn lại', value: currentGame.timeLeft + ' giây', inline: true },
                { name: '🔴 Tổng cược Tài', value: currentGame.totalBetsTai.toLocaleString() + ' vàng', inline: true },
                { name: '🔵 Tổng cược Xỉu', value: currentGame.totalBetsXiu.toLocaleString() + ' vàng', inline: true },
                { name: '📊 Bảng Cầu Gần Nhất', value: renderBoardString(), inline: false }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_tai').setLabel('CƯỢC TÀI 🔴').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_xiu').setLabel('CƯỢC XỈU 🔵').setStyle(ButtonStyle.Danger)
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
                    .setTitle('🎲 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐANG DIỄN RA')
                    .setDescription('Sử dụng các nút bên dưới để chọn cửa cược nhanh:')
                    .addFields(
                        { name: '⏱️ Thời gian còn lại', value: currentGame.timeLeft + ' giây', inline: true },
                        { name: '🔴 Tổng cược Tài', value: currentGame.totalBetsTai.toLocaleString() + ' vàng', inline: true },
                        { name: '🔵 Tổng cược Xỉu', value: currentGame.totalBetsXiu.toLocaleString() + ' vàng', inline: true },
                        { name: '📊 Bảng Cầu Gần Nhất', value: renderBoardString(), inline: false }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_tai').setLabel('CƯỢC TÀI 🔴').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_xiu').setLabel('CƯỢC XỈU 🔵').setStyle(ButtonStyle.Danger)
                );
                await msg.edit({ embeds: [embedUpdate], components: [row] }).catch(() => {});
            } else {
                currentGame.status = 'LOCKED';
                const embedLock = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle('🔒 PHIÊN CƯỢC #' + currentGame.gameId + ' ĐÃ KHÓA')
                    .setDescription('Hết thời gian đặt cược! Đang tiến hành lắc xúc xắc...');
                await msg.edit({ embeds: [embedLock], components: [] }).catch(() => {});

                setTimeout(async () => {
                    const roll = rollDiceWithControl();
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
                            let multiplier = (bet.choice === 'XIU') ? 2.0 : 1.9;
                            let reward = Math.floor(bet.amount * multiplier);
                            user.balance += reward;
                            let profit = reward - bet.amount;
                            user.total_win += profit;
                            record.profit = '+' + reward;
                            winnersList.push('• **' + bet.username + '**: +' + reward.toLocaleString() + ' vàng');
                            historyList.unshift(record);
                        } else {
                            user.total_loss += bet.amount;
                            record.profit = '-' + bet.amount;
                            losersList.push('• **' + bet.username + '**: -' + bet.amount.toLocaleString() + ' vàng');
                            historyList.unshift(record);
                        }
                        currentGame.userHistory.set(userId, historyList);
                    }

                    const resultTextDisplay = roll.result === 'TAI' ? '🔴 TÀI' : (roll.result === 'XIU' ? '🔵 XỈU' : '🟡 HÒA (BÃO)');

                    const embedResult = new EmbedBuilder()
                        .setColor(0xF1C40F)
                        .setTitle('🎲 KẾT QUẢ PHIÊN #' + currentGame.gameId)
                        .addFields(
                            { name: '🎲 Xúc xắc', value: '**' + roll.dice1 + ' - ' + roll.dice2 + ' - ' + roll.dice3 + '** (' + roll.totalSum + ' điểm)', inline: false },
                            { name: '🎯 Kết quả', value: '**' + resultTextDisplay + '**', inline: false },
                            { name: '🏆 Thắng', value: winnersList.length > 0 ? winnersList.join('\n') : 'Không có.', inline: false },
                            { name: '⚠️ Thua', value: losersList.length > 0 ? losersList.join('\n') : 'Không có.', inline: false }
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

client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const user = getOrCreateUser(interaction.user.id, interaction.user.username);

        if (commandName === 'sodu') {
            return interaction.reply({ content: '💰 Số dư hiện tại của bạn: **' + user.balance.toLocaleString() + ' vàng**', ephemeral: true });
        }

        if (commandName === 'cau') {
            return interaction.reply({ content: '📊 **Bảng Cầu Tài Xỉu:**\n' + renderBoardString(), ephemeral: true });
        }

        if (commandName === 'lichsu') {
            const history = currentGame.userHistory.get(interaction.user.id) || [];
            let text = history.slice(0, 5).map(h => '• Phiên #' + h.roundId + ' | Cược: ' + h.amount.toLocaleString() + ' [' + h.choice + '] | KQ: ' + h.result + ' | Lời: ' + h.profit).join('\n');
            return interaction.reply({ content: '📋 **Lịch sử 5 ván gần nhất:**\n' + (text || 'Chưa có lịch sử.'), ephemeral: true });
        }

        if (commandName === 'nap') {
            const amount = interaction.options.getInteger('soluong');
            if (amount <= 0) return interaction.reply({ content: '⚠️ Số vàng không hợp lệ!', ephemeral: true });

            const txId = 'NAP' + Math.floor(100000 + Math.random() * 900000);
            transactions.set(txId, { type: 'NAP', userId: interaction.user.id, username: interaction.user.username, amount, status: 'PENDING' });
            user.txHistory.unshift({ txId, type: 'NẠP', amount, statusText: '⏳ Đang chờ duyệt' });

            const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => interaction.channel);
            const embedAdmin = new EmbedBuilder()
                .setColor(0xF1C40F)
                .setTitle('📥 YÊU CẦU NẠP VÀNG [#' + txId + ']')
                .addFields(
                    { name: 'Người chơi', value: '<@' + interaction.user.id + '>', inline: true },
                    { name: 'Số lượng', value: '**' + amount.toLocaleString() + ' vàng**', inline: true }
                );

            const rowAdmin = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('accept_tx_' + txId).setLabel('Xác Nhận ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('reject_tx_' + txId).setLabel('Từ Chối ❌').setStyle(ButtonStyle.Danger)
            );

            await adminChannel.send({ embeds: [embedAdmin], components: [rowAdmin] });
            return interaction.reply({ content: '✅ Đã gửi yêu cầu nạp **' + amount.toLocaleString() + ' vàng** (Mã: `' + txId + '`). Chờ Admin duyệt.', ephemeral: true });
        }

        if (commandName === 'rut') {
            const amount = interaction.options.getInteger('soluong');
            if (amount <= 0 || user.balance < amount) return interaction.reply({ content: '❌ Số dư không đủ hoặc số lượng không hợp lệ!', ephemeral: true });

            const requiredBet = user.total_deposit * 2;
            if (user.total_bet_amount < requiredBet) {
                return interaction.reply({ content: '❌ Chưa đủ điều kiện rút! Tổng cược phải đạt tối thiểu gấp 2 lần tổng nạp.', ephemeral: true });
            }

            user.balance -= amount;
            const txId = 'RUT' + Math.floor(100000 + Math.random() * 900000);
            transactions.set(txId, { type: 'RUT', userId: interaction.user.id, username: interaction.user.username, amount, status: 'PENDING' });
            user.txHistory.unshift({ txId, type: 'RÚT', amount, statusText: '⏳ Đang chờ duyệt' });

            const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => interaction.channel);
            const embedAdmin = new EmbedBuilder()
                .setColor(0xE67E22)
                .setTitle('📤 YÊU CẦU RÚT VÀNG [#' + txId + ']')
                .addFields(
                    { name: 'Người chơi', value: '<@' + interaction.user.id + '>', inline: true },
                    { name: 'Số lượng', value: '**' + amount.toLocaleString() + ' vàng**', inline: true }
                );

            const rowAdmin = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('accept_tx_' + txId).setLabel('Xác Nhận ✅').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('reject_tx_' + txId).setLabel('Từ Chối ❌').setStyle(ButtonStyle.Danger)
            );

            await adminChannel.send({ embeds: [embedAdmin], components: [rowAdmin] });
            return interaction.reply({ content: '✅ Đã gửi yêu cầu rút **' + amount.toLocaleString() + ' vàng** (Mã: `' + txId + '`). Chờ Admin duyệt.', ephemeral: true });
        }

        if (commandName === 'setwwin') {
            if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
            const valueArg = interaction.options.getString('tile');

            if (valueArg.toLowerCase() === 'reset') {
                forcedWinRate = null;
                return interaction.reply({ content: '🔒 Đã reset tỉ lệ thắng về ngẫu nhiên tự nhiên.', ephemeral: true });
            }

            let parsedRate = null;
            if (valueArg.endsWith('%')) {
                parsedRate = parseFloat(valueArg.replace('%', '')) / 100;
            } else {
                parsedRate = parseFloat(valueArg);
            }

            if (isNaN(parsedRate) || parsedRate < 0 || parsedRate > 1) {
                return interaction.reply({ content: '❌ Tỉ lệ không hợp lệ! Hãy nhập kiểu `20%`, `50%`, `80%` hoặc `reset`.', ephemeral: true });
            }

            forcedWinRate = parsedRate;
            return interaction.reply({ content: '🔒 Đã chỉnh tỉ lệ thắng ẩn thành **' + (parsedRate * 100) + '%** thành công!', ephemeral: true });
        }
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('accept_tx_') || interaction.customId.startsWith('reject_tx_')) {
            if (!isAdmin(interaction.user.id)) return interaction.reply({ content: '❌ Không có quyền!', ephemeral: true });

            const isAccept = interaction.customId.startsWith('accept_tx_');
            const txId = interaction.customId.replace(isAccept ? 'accept_tx_' : 'reject_tx_', '');
            const tx = transactions.get(txId);
            if (!tx || tx.status !== 'PENDING') return interaction.reply({ content: '⚠️ Giao dịch không tồn tại hoặc đã xử lý.', ephemeral: true });

            const targetUser = getOrCreateUser(tx.userId, tx.username);
            if (isAccept) {
                tx.status = 'APPROVED';
                if (tx.type === 'NAP') {
                    targetUser.balance += tx.amount;
                    targetUser.total_deposit += tx.amount;
                }
                await interaction.update({ content: '✅ Đã duyệt giao dịch thành công!', embeds: [], components: [] });
            } else {
                tx.status = 'REJECTED';
                if (tx.type === 'RUT') targetUser.balance += tx.amount;
                await interaction.update({ content: '❌ Đã từ chối giao dịch!', embeds: [], components: [] });
            }
            return;
        }

        if (interaction.customId === 'btn_tai' || interaction.customId === 'btn_xiu') {
            if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Đã khóa cược!', ephemeral: true });
            const choice = interaction.customId === 'btn_tai' ? 'TAI' : 'XIU';
            const modal = new ModalBuilder()
                .setCustomId('modal_datcuoc_' + choice)
                .setTitle('ĐẶT CƯỢC ' + (choice === 'TAI' ? 'TÀI 🔴' : 'XỈU 🔵'));

            const inputAmount = new TextInputBuilder()
                .setCustomId('amount_input')
                .setLabel('Số vàng muốn cược')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputAmount));
            return await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (currentGame.status !== 'OPEN') return interaction.reply({ content: '❌ Hết giờ cược!', ephemeral: true });
        const choice = interaction.customId.includes('TAI') ? 'TAI' : 'XIU';
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));
        const user = getOrCreateUser(interaction.user.id, interaction.user.username);

        if (isNaN(amount) || amount <= 0 || user.balance < amount) {
            return interaction.reply({ content: '❌ Số tiền không hợp lệ hoặc không đủ số dư!', ephemeral: true });
        }

        user.balance -= amount;
        if (choice === 'TAI') currentGame.totalBetsTai += amount;
        else currentGame.totalBetsXiu += amount;

        currentGame.betsThisRound.set(interaction.user.id, { choice, amount, username: interaction.user.username });
        return interaction.reply({ content: '✅ Đã cược thành công **' + amount.toLocaleString() + ' vàng** vào ' + (choice === 'TAI' ? 'TÀI 🔴' : 'XỈU 🔵'), ephemeral: true });
    }
});

client.login(process.env.GAME_BOT_TOKEN || process.env.DISCORD_TOKEN);
