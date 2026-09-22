const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// 📌 Cấu hình kênh và phân quyền
const TARGET_CHANNEL_ID = '1551915282014933083'; // Kênh mini-game
const ADMIN_ROLE_ID = 'ID_ROLE_ADMIN_GAME';     // ID Role Admin duyệt nạp/rút
const OWNER_ID = '979587101328834621';           // ID Owner toàn quyền

function setupTaiXiuModule(client) {
    // Kết nối cơ sở dữ liệu SQLite riêng cho Tài Xỉu
    const db = new sqlite3.Database('./taixiu_database.sqlite', (err) => {
        if (err) console.error('Lỗi kết nối SQLite Tài Xỉu:', err.message);
        else console.log('📦 Database Tài Xỉu đã sẵn sàng.');
    });

    // Khởi tạo các bảng cơ sở dữ liệu
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS users (
            discord_id TEXT PRIMARY KEY,
            username TEXT,
            balance INTEGER DEFAULT 0,
            total_deposit INTEGER DEFAULT 0,
            total_withdraw INTEGER DEFAULT 0,
            total_win INTEGER DEFAULT 0,
            total_loss INTEGER DEFAULT 0,
            games_played INTEGER DEFAULT 0,
            play_time_seconds INTEGER DEFAULT 0,
            created_at TEXT,
            last_active TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            transaction_id TEXT PRIMARY KEY,
            discord_id TEXT,
            type TEXT,
            amount INTEGER,
            status TEXT,
            admin_id TEXT,
            created_at TEXT,
            completed_at TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS bets (
            bet_id INTEGER PRIMARY KEY AUTOINCREMENT,
            game_id INTEGER,
            discord_id TEXT,
            choice TEXT,
            amount INTEGER,
            result TEXT,
            profit INTEGER,
            created_at TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS games (
            game_id INTEGER PRIMARY KEY AUTOINCREMENT,
            result TEXT,
            started_at TEXT,
            ended_at TEXT,
            status TEXT
        )`);
    });

    let currentGameId = null;
    let gameState = 'CLOSED';
    let timeLeft = 15;
    let gameMessage = null;
    const activeBets = new Map();

    function formatNumber(num) {
        return num.toLocaleString('en-US');
    }

    // Thuật toán tỉ lệ nhà cái & bão (10-35%)
    function determineRiggedResult(totalTaiBet, totalXiuBet) {
        const randomChance = Math.random() * 100;
        if (randomChance < 15) {
            const d = Math.floor(Math.random() * 6) + 1;
            return { dice: [d, d, d], result: 'hoa', sum: d * 3 };
        }
        let forcedChoice = (totalTaiBet > totalXiuBet) ? 'xiu' : 'tai';
        let d1, d2, d3, sum;
        do {
            d1 = Math.floor(Math.random() * 6) + 1;
            d2 = Math.floor(Math.random() * 6) + 1;
            d3 = Math.floor(Math.random() * 6) + 1;
            sum = d1 + d2 + d3;
        } while (
            (d1 === d2 && d2 === d3) ||
            (forcedChoice === 'tai' && sum < 11) ||
            (forcedChoice === 'xiu' && sum > 10)
        );
        return { dice: [d1, d2, d3], result: sum >= 11 ? 'tai' : 'xiu', sum };
    }

    // Vòng lặp ván game 15 giây tự động
    function startNewGameCycle() {
        gameState = 'OPEN';
        timeLeft = 15;
        activeBets.clear();

        db.run(`INSERT INTO games (result, started_at, status) VALUES (?, ?, ?)`, 
            ['PENDING', new Date().toISOString(), 'OPEN'], function(err) {
            if (!err) currentGameId = this.lastID;
        });

        updateGameEmbed('🟟 Mở đặt cược');

        const gameInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(gameInterval);
                closeAndProcessGame();
            } else {
                updateGameEmbed(`⏱️ Còn lại: ${timeLeft} giây`);
            }
        }, 1000);
    }

    async function closeAndProcessGame() {
        gameState = 'PROCESSING';
        updateGameEmbed('🔒 Đã đóng cược — Đang xử lý kết quả...');

        let totalTaiBet = 0;
        let totalXiuBet = 0;
        activeBets.forEach((bet) => {
            if (bet.choice === 'tai') totalTaiBet += bet.amount;
            if (bet.choice === 'xiu') totalXiuBet += bet.amount;
        });

        const outcome = determineRiggedResult(totalTaiBet, totalXiuBet);
        const { dice, result, sum } = outcome;

        db.serialize(() => {
            activeBets.forEach((bet, userId) => {
                let profit = 0;
                if (bet.choice === result) {
                    let multiplier = (bet.choice === 'tai') ? 1.9 : (bet.choice === 'xiu' ? 2.0 : 5.0);
                    profit = Math.floor(bet.amount * multiplier);
                    db.run(`UPDATE users SET balance = balance + ?, total_win = total_win + ?, games_played = games_played + 1, play_time_seconds = play_time_seconds + 15 WHERE discord_id = ?`, 
                        [bet.amount + profit, profit, userId]);
                } else if (result === 'hoa' && bet.choice !== 'hoa') {
                    profit = 0;
                    db.run(`UPDATE users SET balance = balance + ?, games_played = games_played + 1, play_time_seconds = play_time_seconds + 15 WHERE discord_id = ?`, 
                        [bet.amount, userId]);
                } else {
                    profit = -bet.amount;
                    db.run(`UPDATE users SET total_loss = total_loss + ?, games_played = games_played + 1, play_time_seconds = play_time_seconds + 15 WHERE discord_id = ?`, 
                        [bet.amount, userId]);
                }

                db.run(`INSERT INTO bets (game_id, discord_id, choice, amount, result, profit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [currentGameId, userId, bet.choice, bet.amount, result, profit, new Date().toISOString()]);
            });

            db.run(`UPDATE games SET result = ?, ended_at = ?, status = 'CLOSED' WHERE game_id = ?`,
                [result, new Date().toISOString(), currentGameId]);
        });

        let resText = result === 'tai' ? '🟟 TÀI' : (result === 'xiu' ? '🟟 XỈU' : '🟟 HÒA');
        updateGameEmbed(`🎲 Kết quả: [\({dice.join(' - ')}] (Tổng:\){sum}) -> **${resText}**`);

        setTimeout(() => { startNewGameCycle(); }, 4000);
    }

    async function getScoreboardString() {
        return new Promise((resolve) => {
            db.all(`SELECT result FROM games WHERE status = 'CLOSED' ORDER BY game_id DESC LIMIT 40`, (err, rows) => {
                if (err || !rows || rows.length === 0) return resolve('Chưa có dữ liệu cầu.');
                let display = rows.reverse().map(r => r.result === 'tai' ? '🟟' : (r.result === 'xiu' ? '🟟' : '🟟')).slice(-20).join(' ');
                resolve(display);
            });
        });
    }

    async function updateGameEmbed(statusText) {
        const channel = client.channels.cache.get(TARGET_CHANNEL_ID);
        if (!channel) return;

        const scoreboard = await getScoreboardString();
        const embed = new EmbedBuilder()
            .setColor(gameState === 'OPEN' ? 0x00FF00 : 0xFF0000)
            .setTitle('🟟 TÀI XỈU HỆ THỐNG DISCORD')
            .setDescription(`**VÁN #\({currentGameId || '...'}**\nTrạng thái: **\){statusText}**`)
            .addFields(
                { name: '⏱️ Thời gian', value: `${timeLeft} giây`, inline: true },
                { name: '🎯 Cửa cược', value: '🟟 TÀI (x1.9) | 🟟 XỈU (x2.0)', inline: true },
                { name: '🟟 Bảng Cầu Gần Nhất', value: scoreboard, inline: false }
            )
            .setFooter({ text: '⚔️ Hệ Thống Mini-Game Chuẩn Đặc Tả ⚔️' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_tai').setLabel('CƯỢC TÀI').setStyle(ButtonStyle.Success).setDisabled(gameState !== 'OPEN'),
            new ButtonBuilder().setCustomId('btn_xiu').setLabel('CƯỢC XỈU').setStyle(ButtonStyle.Danger).setDisabled(gameState !== 'OPEN'),
            new ButtonBuilder().setCustomId('btn_sodu').setLabel('SỐ DƯ').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_lichsu').setLabel('LỊCH SỬ').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('btn_thongke').setLabel('THỐNG KÊ').setStyle(ButtonStyle.Secondary)
        );

        try {
            if (!gameMessage) {
                gameMessage = await channel.send({ embeds: [embed], components: [row] });
            } else {
                await gameMessage.edit({ embeds: [embed], components: [row] });
            }
        } catch (e) {}
    }

    // Bắt đầu chuỗi game ngay khi bot khởi động xong
    setTimeout(() => { startNewGameCycle(); }, 2000);

    // Lắng nghe tin nhắn lệnh Tài Xỉu
    client.on('messageCreate', async (message) => {
        if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const userId = message.author.id;
        const username = message.author.username;

        db.run(`INSERT OR IGNORE INTO users (discord_id, username, balance, created_at, last_active) VALUES (?, ?, 0, ?, ?)`,
            [userId, username, new Date().toISOString(), new Date().toISOString()]);

        if (command === '/sodu' || command === '!sodu') {
            db.get(`SELECT balance FROM users WHERE discord_id = ?`, [userId], (err, row) => {
                message.reply(`🟟 Số dư tài khoản của bạn: **${formatNumber(row ? row.balance : 0)} vàng**.`);
            });
        }

        if (command === '/nap' || command === '!nap') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp: `/nap 500000`');
            const txId = 'NAP-' + Math.floor(100000 + Math.random() * 900000);
            db.run(`INSERT INTO transactions VALUES (?, ?, 'DEPOSIT', ?, 'PENDING', NULL, ?, NULL)`, [txId, userId, amount, new Date().toISOString()]);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${txId}`).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${txId}`).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
            );
            message.channel.send({ content: `<@&\({ADMIN_ROLE_ID}> 🟟 **YÊU CẦU NẠP VÀNG**\n👤 Người chơi: <@\){userId}>\n💰 Số lượng: **\({formatNumber(amount)} vàng**\n🆔 Mã: \`\){txId}\``, components: [row] });
            message.reply(`✅ Đã tạo yêu cầu nạp **${txId}**.`);
        }

        if (command === '/rut' || command === '!rut') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Cú pháp: `/rut 300000`');
            db.get(`SELECT balance FROM users WHERE discord_id = ?`, [userId], (err, row) => {
                if (!row || row.balance < amount) return message.reply('❌ Số dư không đủ.');
                const txId = 'RUT-' + Math.floor(100000 + Math.random() * 900000);
                db.run(`INSERT INTO transactions VALUES (?, ?, 'WITHDRAW', ?, 'PENDING', NULL, ?, NULL)`, [txId, userId, amount, new Date().toISOString()]);

                const rowBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`approve_${txId}`).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_${txId}`).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
                );
                message.channel.send({ content: `<@&\({ADMIN_ROLE_ID}> 🟟 **YÊU CẦU RÚT VÀNG**\n👤 Người chơi: <@\){userId}>\n💰 Số lượng: **\({formatNumber(amount)} vàng**\n🆔 Mã: \`\){txId}\``, components: [rowBtn] });
                message.reply(`✅ Đã tạo yêu cầu rút **${txId}**.`);
            });
        }

        if (command === '/cuoctai' || command === '/cuocxiu') {
            if (gameState !== 'OPEN') return message.reply('❌ Đã hết thời gian cược!');
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) return message.reply('⚠️ Nhập số vàng hợp lệ!');
            const choice = command.includes('tai') ? 'tai' : 'xiu';

            db.get(`SELECT balance FROM users WHERE discord_id = ?`, [userId], (err, row) => {
                const bal = row ? row.balance : 0;
                if (bal < amount) return message.reply(`❌ Số dư không đủ (${formatNumber(bal)} vàng).`);
                db.run(`UPDATE users SET balance = balance - ? WHERE discord_id = ?`, [amount, userId], () => {
                    activeBets.set(userId, { choice, amount });
                    message.reply(`✅ Đã cược **\({formatNumber(amount)} vàng** vào cửa **\){choice.toUpperCase()}**.`);
                });
            });
        }

        if (command === '/thongke' || command === '!thongke') {
            db.get(`SELECT * FROM users WHERE discord_id = ?`, [userId], (err, user) => {
                if (!user) return message.reply('Chưa có thống kê.');
                const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('🟟 THỐNG KÊ NGƯỜI CHƠI')
                    .addFields(
                        { name: 'Số dư', value: `${formatNumber(user.balance)} vàng`, inline: true },
                        { name: 'Tổng thắng', value: `${formatNumber(user.total_win)} vàng`, inline: true },
                        { name: 'Tổng thua', value: `${formatNumber(user.total_loss)} vàng`, inline: true },
                        { name: 'Ván chơi', value: `${user.games_played} ván`, inline: true }
                    );
                message.reply({ embeds: [embed] });
            });
        }

        if (command === '!congdiem' && userId === OWNER_ID) {
            const target = message.mentions.users.first();
            const amt = parseInt(args[2]);
            if (target && !isNaN(amt)) {
                db.run(`UPDATE users SET balance = balance + ? WHERE discord_id = ?`, [amt, target.id], () => {
                    message.reply(`✅ Đã cộng **\({formatNumber(amt)} vàng** cho\){target}.`);
                });
            }
        }
    });

    // Xử lý nút bấm tương tác nạp/rút và bảng điều khiển
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        const [action, txId] = interaction.customId.split('_');
        const userId = interaction.user.id;

        if (action === 'approve' || action === 'reject') {
            const isAdmin = interaction.member.roles.cache.has(ADMIN_ROLE_ID) || userId === OWNER_ID;
            if (!isAdmin) return interaction.reply({ content: '❌ Không có quyền Admin!', ephemeral: true });

            db.get(`SELECT * FROM transactions WHERE transaction_id = ?`, [txId], (err, tx) => {
                if (!tx || tx.status !== 'PENDING') return interaction.reply({ content: '❌ Giao dịch không hợp lệ hoặc đã xử lý.', ephemeral: true });

                db.serialize(() => {
                    if (action === 'approve') {
                        if (tx.type === 'DEPOSIT') db.run(`UPDATE users SET balance = balance + ?, total_deposit = total_deposit + ? WHERE discord_id = ?`, [tx.amount, tx.amount, tx.discord_id]);
                        if (tx.type === 'WITHDRAW') db.run(`UPDATE users SET balance = balance - ?, total_withdraw = total_withdraw + ? WHERE discord_id = ?`, [tx.amount, tx.amount, tx.discord_id]);
                        db.run(`UPDATE transactions SET status = 'COMPLETED', admin_id = ?, completed_at = ? WHERE transaction_id = ?`, [userId, new Date().toISOString(), txId]);
                        interaction.update({ content: `✅ Giao dịch **${txId}** đã được **XÁC NHẬN**.`, components: [] });
                    } else {
                        db.run(`UPDATE transactions SET status = 'REJECTED', admin_id = ?, completed_at = ? WHERE transaction_id = ?`, [userId, new Date().toISOString(), txId]);
                        interaction.update({ content: `❌ Giao dịch **${txId}** đã bị **TỪ CHỐI**.`, components: [] });
                    }
                });
            });
        }

        if (interaction.customId === 'btn_sodu') {
            db.get(`SELECT balance FROM users WHERE discord_id = ?`, [userId], (err, row) => {
                interaction.reply({ content: `💳 Số dư: **${formatNumber(row ? row.balance : 0)} vàng**`, ephemeral: true });
            });
        }
    });
}

module.exports = setupTaiXiuModule;
