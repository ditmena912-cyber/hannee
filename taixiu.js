const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
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
    if (historyColumns.length === 0) return 'Chua co du lieu phien truoc.';
    let rows = ['', '', '', '', ''];
    for (let r = 0; r < 5; r++) {
        let rowStr = '';
        for (let c = 0; c < historyColumns.length; c++) {
            const col = historyColumns[c];
            if (col[r]) {
                if (col[r] === 'TAI') rowStr += '[TAI] ';
                else if (col[r] === 'XIU') rowStr += '[XIU] ';
                else rowStr += '[BOA] '; 
            } else {
                const colLength = col.length;
                if (r >= colLength) {
                    rowStr += '[   ] ';
                }
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
    console.log('He thong Mini-Game Tai Xiu da san sang hoat dong!');
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
            .setTitle(`PHIM CUOC #${currentGame.gameId} DANG DIEN RA`)
            .setDescription('Su dung cac nut ben duoi de chon cua cuoc nhanh:')
            .addFields(
                { name: 'Thoi gian con lai', value: `${currentGame.timeLeft} giay`, inline: true },
                { name: 'Tong cuoc Tai', value: `${currentGame.totalBetsTai.toLocaleString()} vang`, inline: true },
                { name: 'Tong cuoc Xiu', value: `${currentGame.totalBetsXiu.toLocaleString()} vang`, inline: true },
                { name: 'Bang Cau Gan Nhat', value: `\`\`\`text\n${renderBoardString()}\n\`\`\``, inline: false }
            )
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_tai').setLabel('CUOC TAI').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_xiu').setLabel('CUOC XIU').setStyle(ButtonStyle.Danger)
        );

        const msg = await channel.send({ embeds: [embed], components: [row] });
        currentGame.messageId = msg.id;
    } catch (e) {
        console.error('Loi khoi tao phien:', e);
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
                    .setTitle(`PHIM CUOC #${currentGame.gameId} DANG DIEN RA`)
                    .setDescription('Su dung cac nut ben duoi de chon cua cuoc nhanh:')
                    .addFields(
                        { name: 'Thoi gian con lai', value: `${currentGame.timeLeft} giay`, inline: true },
                        { name: 'Tong cuoc Tai', value: `${currentGame.totalBetsTai.toLocaleString()} vang`, inline: true },
                        { name: 'Tong cuoc Xiu', value: `${currentGame.totalBetsXiu.toLocaleString()} vang`, inline: true },
                        { name: 'Bang Cau Gan Nhat', value: `\`\`\`text\n${renderBoardString()}\n\`\`\``, inline: false }
                    )
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_tai').setLabel('CUOC TAI').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_xiu').setLabel('CUOC XIU').setStyle(ButtonStyle.Danger)
                );
                await msg.edit({ embeds: [embedUpdate], components: [row] }).catch(() => {});
            } else {
                currentGame.status = 'LOCKED';
                const embedLock = new EmbedBuilder()
                    .setColor(0xE74C3C)
                    .setTitle(`PHIM CUOC #${currentGame.gameId} DA KHOA`)
                    .setDescription('Het thoi gian dat cuoc! Dang tien hanh lac xuc xac...')
                    .addFields(
                        { name: 'Trang thai', value: 'DA KHOA CUOC', inline: true },
                        { name: 'Tong cuoc TAI', value: `${currentGame.totalBetsTai.toLocaleString()} vang`, inline: true },
                        { name: 'Tong cuoc XIU', value: `${currentGame.totalBetsXiu.toLocaleString()} vang`, inline: true }
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
                            winnersList.push(`- **\({bet.username}**: +\){reward.toLocaleString()} vang [${bet.amount.toLocaleString()} cuoc]`);
                            historyList.unshift(record);
                        } else {
                            user.total_loss += bet.amount;
                            record.profit = `-${bet.amount}`;
                            losersList.push(`- **\({bet.username}**: -\){bet.amount.toLocaleString()} vang [${bet.choice}]`);
                            historyList.unshift(record);
                        }
                        currentGame.userHistory.set(userId, historyList);
                    }

                    const resultTextDisplay = roll.result === 'TAI' ? 'TAI' : (roll.result === 'XIU' ? 'XIU' : 'HOA (BAO)');

                    const embedResult = new EmbedBuilder()
                        .setColor(roll.result === 'TAI' ? 0xF1C40F : (roll.result === 'XIU' ? 0x3498DB : 0x2ECC71))
                        .setTitle(`KET QUA PHIEN #${currentGame.gameId}`)
                        .addFields(
                            { name: 'Xuc xac', value: `**\({roll.dice1} -\){roll.dice2} -${roll.dice3}**`, inline: true },
                            { name: 'Tong diem', value: `**${roll.totalSum} diem**`, inline: true },
                            { name: 'Ket qua', value: `**${resultTextDisplay}**`, inline: false },
                            { name: 'Bang Cau Gan Nhat', value: `\`\`\`text\n${renderBoardString()}\n\`\`\``, inline: false },
                            { name: 'Danh Sach Thang', value: winnersList.length > 0 ? winnersList.join('\n') : 'Khong co nguoi choi thang.', inline: false },
                            { name: 'Danh Sach Thua', value: losersList.length > 0 ? losersList.join('\n') : 'Khong co nguoi choi thua.', inline: false }
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

    if (cmd === '!sodu') return message.reply(`So du: **${user.balance.toLocaleString()} vang**`);
    if (cmd === '!cau') return message.reply(`Bang Cau Tai Xiu:\n\`\`\`text\n${renderBoardString()}\n\`\`\``);

    if (cmd === '!lichsu' || cmd === '!thongke') {
        const history = currentGame.userHistory.get(message.author.id) || [];
        const embedHistory = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle(`THONG TIN TAI KHOAN & LICH SU CUOC`)
            .addFields(
                { name: 'Nguoi choi', value: `${message.author.username}`, inline: true },
                { name: 'So du hien tai', value: `**${user.balance.toLocaleString()} vang**`, inline: true },
                { name: 'Tong van da choi', value: `${user.games_played} van`, inline: true },
                { name: 'Tong tien da cuoc', value: `${user.total_bet_amount.toLocaleString()} vang`, inline: true },
                { name: 'Tong thang', value: `+${user.total_win.toLocaleString()} vang`, inline: true },
                { name: 'Tong thua', value: `-${user.total_loss.toLocaleString()} vang`, inline: true }
            );

        if (history.length > 0) {
            let histText = history.slice(0, 5).map(h => 
                `- Phien **#\({h.roundId}** | Cuoc: **\){h.amount.toLocaleString()}** [\({h.choice}] | Ket qua: **\){h.result}** | Loi nhuan: **${h.profit}**`
            ).join('\n');
            embedHistory.addFields({ name: '5 Van Cuoc Gan Nhat', value: histText, inline: false });
        } else {
            embedHistory.addFields({ name: '5 Van Cuoc Gan Nhat', value: 'Chua co lich su dat cuoc.', inline: false });
        }
        return message.reply({ embeds: [embedHistory] });
    }

    if (cmd === '!nap') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('Cu phap dung: `!nap [so vang]`');
        
        const txId = 'NAP' + Math.floor(100000 + Math.random() * 900000);
        transactions.set(txId, { userId: message.author.id, username: message.author.username, amount, status: 'PENDING' });

        const adminChannel = await client.channels.fetch(ADMIN_CHANNEL_ID).catch(() => message.channel);
        const embedAdmin = new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`YEU CAU NAP VANG MOI [#${txId}]`)
            .addFields(
                { name: 'Nguoi choi', value: `\({message.author} (\){message.author.username})`, inline: true },
                { name: 'So vang nap', value: `**${amount.toLocaleString()} vang**`, inline: true },
                { name: 'Trang thai', value: 'Dang cho Admin duyet', inline: false }
            )
            .setTimestamp();

        const rowAdmin = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`accept_nap_${txId}`).setLabel('Xac Nhan').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`reject_nap_${txId}`).setLabel('Tu Choi').setStyle(ButtonStyle.Danger)
        );

        await adminChannel.send({ embeds: [embedAdmin], components: [rowAdmin] });
        return message.reply(`Da gui yeu cau nap **\({amount.toLocaleString()} vang** (Ma: \`\){txId}\`) den Admin.`);
    }

    if (cmd === '!rut') {
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) return message.reply('Cu phap dung: `!rut [so vang]`');
        if (user.balance < amount) return message.reply('So du khong du de rut!');
        user.balance -= amount;
        user.total_withdraw += amount;
        return message.reply(`Yeu cau rut **${amount.toLocaleString()} vang** thanh cong!`);
    }

    if (cmd === '!themadmin') {
        if (!isSuperAdmin(message.author.id)) return message.reply('Chi Admin toi cao moi co quyen nay!');
        const target = message.mentions.users.first();
        if (!target) return message.reply('Cu phap: `!themadmin @User`');
        subAdmins.add(target.id);
        return message.reply(`Da cap quyen Admin phu cho ${target.username}!`);
    }

    if (cmd === '!xoaadmin') {
        if (!isSuperAdmin(message.author.id)) return message.reply('Chi Admin toi cao moi co quyen nay!');
        const target = message.mentions.users.first();
        if (!target) return message.reply('Cu phap: `!xoaadmin @User`');
        if (superAdmins.has(target.id)) return message.reply('Khong the xoa Admin toi cao!');
        subAdmins.delete(target.id);
        return message.reply(`Da tuoc quyen Admin cua ${target.username}!`);
    }

    if (cmd === '!congdiem') {
        if (!isAdmin(message.author.id)) return message.reply('Ban khong co quyen!');
        const target = message.mentions.users.first();
        const amt = parseInt(args[2]);
        if (!target || isNaN(amt)) return message.reply('Cu phap: `!congdiem @User [so vang]`');
        getOrCreateUser(target.id, target.username).balance += amt;
        return message.reply(`Da cong **\({amt.toLocaleString()} vang** cho\){target.username}!`);
    }

    if (cmd === '!trudiem') {
        if (!isAdmin(message.author.id)) return message.reply('Ban khong co quyen!');
        const target = message.mentions.users.first();
        const amt = parseInt(args[2]);
        const reason = args.slice(3).join(' ');
        if (!target || isNaN(amt) || !reason) return message.reply('Cu phap: `!trudiem @User [so vang] [Ly do]`');

        const targetUser = getOrCreateUser(target.id, target.username);
        if (targetUser.balance < amt) return message.reply(`So du cua ${target.username} khong du!`);

        targetUser.balance -= amt;
        try { await target.send(`Tai khoan bi tru **\({amt.toLocaleString()} vang**. Ly do:\){reason}`); } catch (e) {}
        return message.reply(`Da tru **\({amt.toLocaleString()} vang** cua\){target.username}. Ly do: ${reason}`);
    }
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('accept_nap_') || interaction.customId.startsWith('reject_nap_')) {
            if (!isAdmin(interaction.user.id)) return interaction.reply({ content: 'Khong co quyen!', ephemeral: true });

            const isAccept = interaction.customId.startsWith('accept_nap_');
            const txId = interaction.customId.replace(isAccept ? 'accept_nap_' : 'reject_nap_', '');
            const tx = transactions.get(txId);

            if (!tx || tx.status !== 'PENDING') return interaction.reply({ content: 'Giao dich khong ton tai hoac da xu ly!', ephemeral: true });

            if (isAccept) {
                tx.status = 'APPROVED';
                const targetUser = getOrCreateUser(tx.userId, tx.username);
                targetUser.balance += tx.amount;
                targetUser.total_deposit += tx.amount;

                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x2ECC71)
                    .setFields(
                        { name: 'Nguoi choi', value: `<@${tx.userId}>`, inline: true },
                        { name: 'So vang nap', value: `**${tx.amount.toLocaleString()} vang**`, inline: true },
                        { name: 'Trang thai', value: `DA XAC NHAN boi ${interaction.user.username}`, inline: false }
                    );
                await interaction.update({ embeds: [updatedEmbed], components: [] });
            } else {
                tx.status = 'REJECTED';
                const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xE74C3C)
                    .setFields(
                        { name: 'Nguoi choi', value: `<@${tx.userId}>`, inline: true },
                        { name: 'So vang nap', value: `**${tx.amount.toLocaleString()} vang**`, inline: true },
                        { name: 'Trang thai', value: `DA TU CHOI boi ${interaction.user.username}`, inline: false }
                    );
                await interaction.update({ embeds: [updatedEmbed], components: [] });
            }
            return;
        }

        if (interaction.customId === 'btn_tai' || interaction.customId === 'btn_xiu') {
            if (currentGame.status !== 'OPEN') return interaction.reply({ content: 'Phien cuoc da khoa!', ephemeral: true });
            const choice = interaction.customId === 'btn_tai' ? 'TAI' : 'XIU';
            const modal = new ModalBuilder()
                .setCustomId(`modal_datcuoc_${choice}`)
                .setTitle(`DAT CUOC CUA ${choice}`);

            const inputAmount = new TextInputBuilder()
                .setCustomId('amount_input')
                .setLabel('Nhap so vang muon cuoc')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Vi du: 10000')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputAmount));
            return await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (currentGame.status !== 'OPEN') return interaction.reply({ content: 'Da het thoi gian cuoc!', ephemeral: true });
        const choice = interaction.customId.includes('TAI') ? 'TAI' : 'XIU';
        const amount = parseInt(interaction.fields.getTextInputValue('amount_input'));
        const user = getOrCreateUser(interaction.user.id, interaction.user.username);

        if (isNaN(amount) || amount <= 0) return interaction.reply({ content: 'So tien khong hop le!', ephemeral: true });
        if (user.balance < amount) return interaction.reply({ content: `So du khong du!`, ephemeral: true });

        user.balance -= amount;
        if (choice === 'TAI') currentGame.totalBetsTai += amount;
        else currentGame.totalBetsXiu += amount;

        currentGame.betsThisRound.set(interaction.user.id, { choice, amount, username: interaction.user.username });
        return interaction.reply({ content: `Da cuoc **\({amount.toLocaleString()} vang** vao cua **\){choice}**!`, ephemeral: true });
    }
});

client.login(process.env.GAME_BOT_TOKEN || process.env.DISCORD_TOKEN);
