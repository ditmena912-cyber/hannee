const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// 📌 ID kênh # mini-game của bạn
const TARGET_CHANNEL_ID = '1551915282014933083'; 

// 👑 ID Discord của Admin / Owner
const ADMIN_USER_ID = '979587101328834621';

// 🗂️ Database mô phỏng trong bộ nhớ
const users = new Map();         // discord_id -> Object User
const transactions = new Map();  // transaction_id -> Object Transaction
const bets = [];                 // Danh sách tất cả các ván cược
const games = [];                // Danh sách các ván đấu

// Bảng cầu kết quả (Lưu tối đa 20 cột, mỗi cột là mảng các kết quả)
let historyColumns = [];

// Trạng thái ván hiện tại: 'OPEN' | 'CLOSED' | 'PROCESSING'
let currentGame = {
    gameId: 1,
    status: 'OPEN',
    timeLeft: 15,
    totalBetsTai: 0,
    totalBetsXiu: 0,
    betsThisRound: new Map(), // discord_id -> { choice, amount }
    messageId: null
};

// Khởi tạo thông tin người chơi nếu chưa có
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

// Hàm cập nhật bảng cầu chuẩn xác
function updateScoreBoard(resultType) {
    // resultType: 'TAI', 'XIU', 'HOA'
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

    // Giới hạn tối đa 20 cột
    if (historyColumns.length > 20) {
        historyColumns.shift();
    }
}

// Render chuỗi hiển thị bảng cầu dạng ma trận
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

        // ==========================================
        // ⏱️ VÒNG LẶP VÁN GAME CỐ ĐỊNH 15 GIÂY
        // ==========================================
        setInterval(async () => {
            try {
                const channel = await client.channels.fetch(TARGET_CHANNEL_ID);
                if (!channel) return;

                if (currentGame.status === 'OPEN') {
                    currentGame.timeLeft -= 5;

                    if (currentGame.timeLeft <= 0) {
                        // 🟟 KHÓA ĐẶT CƯỢC
                        currentGame.status = 'CLOSED';
                        
                        // 🎲 XỬ LÝ KẾT QUẢ VÁN GAME
                        let dice1 = Math.floor(Math.random() * 6) + 1;
                        let dice2 = Math.floor(Math.random() * 6) + 1;
                        let dice3 = Math.floor(Math.random() * 6) + 1;
                        let totalSum = dice1 + dice2 + dice3;

                        let result = '';
                        if (dice1 === dice2 && dice2 === dice3) {
                            result = 'HOA';
                        } else {
                            result = totalSum >= 11 ? 'TAI' : 'XIU';
                        }

                        // Cập nhật bảng cầu
                        updateScoreBoard(result);

                        // Tính tiền thắng thua cho từng người chơi trong ván
                        for (let [userId, betInfo] of currentGame.betsThisRound.entries()) {
                            const user = getOrCreateUser(userId);
                            user.games_played += 1;
                            user.last_active = new Date();

                            let profit = 0;
                            let resStatus = '';

                            if (betInfo.choice === result) {
                                const multiplier = (result === 'HOA') ? 5 : 2;
                                profit = betInfo.amount * multiplier;
                                user.balance += profit;
                                user.total_win += (profit - betInfo.amount);
                                resStatus = 'THẮNG';
                            } else if (result === 'HOA' && betInfo.choice !== 'HOA') {
                                user.balance += betInfo.amount; // Hoàn tiền
                                profit = 0;
                                resStatus = 'HÒA (HOÀN TIỀN)';
                            } else {
                                user.total_loss += betInfo.amount;
                                profit = -betInfo.amount;
                                resStatus = 'THUA';
                            }

                            // Lưu lịch sử cược
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

                        // Lưu thông tin ván đấu
                        games.push({
                            game_id: currentGame.gameId,
                            result: result,
                            started_at: new Date(),
                            ended_at: new Date(),
                            status: 'COMPLETED'
                        });

                        // Gửi thông báo kết quả ván đấu
                        let resultString = result === 'TAI' ? '🟡 TÀI (' + totalSum + ')' : (result === 'XIU' ? '🔵 XỈU (' + totalSum + ')' : '⚪ HÒA BÃO (' + totalSum + ')');
                        await channel.send(`🎲 **KẾT QUẢ VÁN #\({currentGame.gameId}**: Xúc xắc: **\){dice1} - \({dice2} -\){dice3}** (Tổng: **\({totalSum}**) ➔ **\){resultString}**`);

                        // Chuẩn bị ván mới sau 3 giây nghỉ
                        setTimeout(() => {
                            currentGame.gameId += 1;
                            currentGame.status = 'OPEN';
                            currentGame.timeLeft = 15;
                            currentGame.totalBetsTai = 0;
                            currentGame.totalBetsXiu = 0;
                            currentGame.betsThisRound.clear();
                        }, 3000);
                    }
                }
            } catch (err) {
                console.error('[Game Loop Error]:', err.message);
            }
        }, 5000); // Cập nhật mỗi 5 giây đếm ngược
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        if (message.channel.id !== TARGET_CHANNEL_ID) return;

        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();
        const userId = message.author.id;
        const user = getOrCreateUser(userId, message.author.username);
        user.last_active = new Date();

        // 1. /sodu hoặc /balance
        if (command === '!sodu' || command === '/sodu') {
            return message.reply(`💳 Số dư tài khoản của bạn: **${user.balance.toLocaleString()} vàng**`);
        }

        // 2. /nguoidung
        if (command === '!nguoidung' || command === '/nguoidung') {
            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`👤 THÔNG TIN TÀI KHOẢN: ${message.author.username}`)
                .addFields(
                    { name: '🆔 Discord ID', value: user.discord_id, inline: true },
                    { name: '💳 Số dư vàng', value: `${user.balance.toLocaleString()} vàng`, inline: true },
                    { name: '📈 Tổng thắng', value: `${user.total_win.toLocaleString()} vàng`, inline: true },
                    { name: '📉 Tổng thua', value: `${user.total_loss.toLocaleString()} vàng`, inline: true },
                    { name: '🎮 Tổng ván đã chơi', value: `${user.games_played} ván`, inline: true },
                    { name: '⏱️ Thời gian tham gia', value: formatTime(user.created_at), inline: false }
                );
            return message.reply({ embeds: [embed] });
        }

        // 3. /nap 
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

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`approve_nap_${txId}`).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_nap_${txId}`).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
                );

            const embedNap = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('💎 YÊU CẦU NẠP VÀNG')
                .addFields(
                    { name: '🆔 Mã giao dịch', value: txId, inline: true },
                    { name: '👤 Người chơi', value: `${message.author}`, inline: true },
                    { name: '💰 Số lượng', value: `${amount.toLocaleString()} vàng`, inline: false },
                    { name: '⏳ Trạng thái', value: 'Đang chờ Admin xác nhận', inline: false }
                );

            return message.reply({ content: `<@!${ADMIN_USER_ID}> Có yêu cầu nạp vàng mới cần xử lý!`, embeds: [embedNap], components: [row] });
        }

        // 4. /rut 
        if (command === '!rut' || command === '/rut') {
            const amount = parseInt(args[1]);
            if (isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ Cú pháp không hợp lệ! Vui lòng dùng: `/rut [số lượng vàng]`');
            }

            if (user.balance < amount) {
                return message.reply('❌ Số dư không đủ để thực hiện giao dịch rút vàng!');
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

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId(`approve_rut_${txId}`).setLabel('✅ XÁC NHẬN').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`reject_rut_${txId}`).setLabel('❌ TỪ CHỐI').setStyle(ButtonStyle.Danger)
                );

            const embedRut = new EmbedBuilder()
                .setColor(0xFF4500)
                .setTitle('💸 YÊU CẦU RÚT VÀNG')
                .addFields(
                    { name: '🆔 Mã giao dịch', value: txId, inline: true },
                    { name: '👤 Người chơi', value: `${message.author}`, inline: true },
                    { name: '💰 Số lượng', value: `${amount.toLocaleString()} vàng`, inline: false },
                    { name: '⏳ Trạng thái', value: 'Đang chờ Admin xử lý', inline: false }
                );

            return message.reply({ content: `<@!${ADMIN_USER_ID}> Có yêu cầu rút vàng mới cần xử lý!`, embeds: [embedRut], components: [row] });
        }

        // 5. /cuoctai hoặc /cuocxiu
        if (command === '!cuoctai' || command === '/cuoctai' || command === '!cuocxiu' || command === '/cuocxiu') {
            if (currentGame.status !== 'OPEN') {
                return message.reply('❌ Ván game đã đóng đặt cược! Vui lòng đợi ván tiếp theo.');
            }

            const isTai = command.includes('tai');
            const amount = parseInt(args[1]);

            if (isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ Vui lòng nhập số vàng cược hợp lệ. Ví dụ: `/cuoctai 500`');
            }

            if (user.balance < amount) {
                return message.reply(`❌ Số dư không đủ! Bạn chỉ đang có **${user.balance.toLocaleString()} vàng**.`);
            }

            // Trừ vàng trực tiếp để khóa cược
            user.balance -= amount;
            if (isTai) currentGame.totalBetsTai += amount;
            else currentGame.totalBetsXiu += amount;

            currentGame.betsThisRound.set(userId, { choice: isTai ? 'TAI' : 'XIU', amount: amount });

            return message.reply(`✅ Đã đặt cược thành công **\({amount.toLocaleString()} vàng** vào cửa **\){isTai ? 'TÀI' : 'XỈU'}**! Số dư còn lại: **${user.balance.toLocaleString()} vàng**.`);
        }

        // 6. /lichsu cược
        if (command === '!lichsu' || command === '/lichsu') {
            const userBets = bets.filter(b => b.discord_id === userId).slice(-5).reverse();
            let text = userBets.length > 0 
                ? userBets.map(b => `• Ván #\({b.game_id} | Cược: **\){b.choice}** (\({b.amount.toLocaleString()}v) | Kết quả: **\){b.result}** | Lợi nhuận: **\({b.profit >= 0 ? '+' : ''}\){b.profit.toLocaleString()}v**`).join('\n')
                : 'Chưa có lịch sử cược nào.';

            const embed = new EmbedBuilder().setColor(0x9900FF).setTitle('📜 LỊCH SỬ CƯỢC GẦN NHẤT').setDescription(text);
            return message.reply({ embeds: [embed] });
        }

        // 7. /naplichsu
        if (command === '!naplichsu' || command === '/naplichsu') {
            const userNaps = Array.from(transactions.values()).filter(t => t.discord_id === userId && t.type === 'DEPOSIT').slice(-5).reverse();
            let text = userNaps.length > 0
                ? userNaps.map(t => `• #\({t.transaction_id} | **+\){t.amount.toLocaleString()} vàng** | Trạng thái: **\({t.status}** (\){formatTime(t.created_at)})`).join('\n')
                : 'Chưa có lịch sử nạp.';
            const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('💎 LỊCH SỬ NẠP VÀNG').setDescription(text);
            return message.reply({ embeds: [embed] });
        }

        // 8. /rutlichsu
        if (command === '!rutlichsu' || command === '/rutlichsu') {
            const userRuts = Array.from(transactions.values()).filter(t => t.discord_id === userId && t.type === 'WITHDRAW').slice(-5).reverse();
            let text = userRuts.length > 0
                ? userRuts.map(t => `• #\({t.transaction_id} | **-\){t.amount.toLocaleString()} vàng** | Trạng thái: **\({t.status}** (\){formatTime(t.created_at)})`).join('\n')
                : 'Chưa có lịch sử rút.';
            const embed = new EmbedBuilder().setColor(0xFF4500).setTitle('💸 LỊCH SỬ RÚT VÀNG').setDescription(text);
            return message.reply({ embeds: [embed] });
        }

        // 9. /thongke
        if (command === '!thongke' || command === '/thongke') {
            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle(`📊 THỐNG KÊ NGƯỜI CHƠI: ${message.author.username}`)
                .addFields(
                    { name: '💳 Số dư', value: `${user.balance.toLocaleString()} vàng`, inline: true },
                    { name: '📥 Tổng nạp', value: `${user.total_deposit.toLocaleString()} vàng`, inline: true },
                    { name: '📤 Tổng rút', value: `${user.total_withdraw.toLocaleString()} vàng`, inline: true },
                    { name: '🎮 Tổng số ván', value: `${user.games_played} ván`, inline: true },
                    { name: '📈 Tổng thắng', value: `${user.total_win.toLocaleString()} vàng`, inline: true },
                    { name: '📉 Tổng thua', value: `${user.total_loss.toLocaleString()} vàng`, inline: true },
                    { name: '⏱️ Thời gian tham gia', value: formatTime(user.created_at), inline: false }
                );
            return message.reply({ embeds: [embed] });
        }

        // 10. /cau
        if (command === '!cau' || command === '/cau') {
            const embed = new EmbedBuilder()
                .setColor(0x9900FF)
                .setTitle('📊 BẢNG CẦU KẾT QUẢ TÀI XỈU')
                .setDescription('```\n' + renderBoardString() + '\n```');
            return message.reply({ embeds: [embed] });
        }

        // 11. Lệnh Admin cộng điểm: !congdiem @User [số lượng]
        if (command === '!congdiem' || command === '/congdiem') {
            if (userId !== ADMIN_USER_ID) {
                return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
            }
            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[2]);
            if (!targetUser || isNaN(amount)) {
                return message.reply('⚠️ Cú pháp: `!congdiem @User [số vàng]`');
            }
            const tUser = getOrCreateUser(targetUser.id, targetUser.username);
            tUser.balance += amount;
            return message.reply(`✅ Đã cộng **+\({amount.toLocaleString()} vàng** cho\){targetUser}. Số dư mới: **${tUser.balance.toLocaleString()} vàng**.`);
        }
    });

    // 🔘 Xử lý nút bấm xác nhận / từ chối giao dịch nạp rút từ Admin
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        const [action, type, txId] = interaction.customId.split('_');
        const tx = transactions.get(txId);

        if (!tx) {
            return interaction.reply({ content: '❌ Giao dịch này không tồn tại.', ephemeral: true });
        }

        if (tx.status !== 'PENDING') {
            return interaction.reply({ content: '❌ Giao dịch này đã được xử lý trước đó rồi!', ephemeral: true });
        }

        if (interaction.user.id !== ADMIN_USER_ID) {
            return interaction.reply({ content: '❌ Chỉ có Admin mới có quyền thao tác nút này!', ephemeral: true });
        }

        const targetUser = getOrCreateUser(tx.discord_id);

        if (action === 'approve') {
            if (type === 'nap') {
                targetUser.balance += tx.amount;
                targetUser.total_deposit += tx.amount;
                tx.status = 'COMPLETED';
            } else if (type === 'rut') {
                if (targetUser.balance < tx.amount) {
                    return interaction.update({ content: '❌ Người chơi không đủ số dư để thực hiện lệnh rút này nữa.', components: [] });
                }
                targetUser.balance -= tx.amount;
                targetUser.total_withdraw += tx.amount;
                tx.status = 'COMPLETED';
            }
            tx.admin_id = interaction.user.id;
            tx.completed_at = new Date();

            await interaction.update({ content: `✅ Giao dịch **\({txId}** đã được **XÁC NHẬN** bởi <@!\){interaction.user.id}>.`, components: [] });
        } else if (action === 'reject') {
            tx.status = 'REJECTED';
            tx.admin_id = interaction.user.id;
            tx.completed_at = new Date();

            if (type === 'rut') {
                // Hoàn lại tiền nếu từ chối rút
                targetUser.balance += tx.amount;
            }

            await interaction.update({ content: `❌ Giao dịch **\({txId}** đã bị **TỪ CHỐI** bởi <@!\){interaction.user.id}>.`, components: [] });
        }
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
