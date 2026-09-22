const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// 📌 ID kênh # mini-game của bạn
const TARGET_CHANNEL_ID = '1551915282014933083'; 

// 👑 ID Discord của bạn (Đã được gộp tự động, chỉ tài khoản của bạn mới dùng được lệnh cộng điểm)
const ADMIN_USER_ID = '979587101328834621';

// 💰 Lưu trữ số dư điểm ảo của người chơi (Key: userId, Value: số điểm)
const balances = new Map();
// 📅 Lưu ngày điểm danh gần nhất của người chơi (Key: userId, Value: 'YYYY-MM-DD')
const lastCheckIn = new Map();

// Hàm lấy số dư của người chơi (mặc định khởi tạo 10,000 điểm cho người mới)
function getBalance(userId) {
    if (!balances.has(userId)) {
        balances.set(userId, 10000); // Tặng 10,000 điểm khởi nghiệp
    }
    return balances.get(userId);
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

    client.once('ready', () => {
        console.log('🤖 Bot Discord đã đăng nhập thành công với tên: ' + client.user.tag);
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;

        // 🛑 Chỉ cho phép bot phản hồi bên trong kênh # mini-game
        if (message.channel.id !== TARGET_CHANNEL_ID) return;
        
        const args = message.content.trim().split(/\s+/);
        const command = args[0].toLowerCase();

        // 1. Lệnh kiểm tra kết nối: !ping
        if (command === '!ping') {
            return message.reply('🏓 Pong! Bot đang hoạt động chuẩn xác tại phòng # mini-game!');
        }

        // 2. Lệnh xem số dư: !sodu hoặc !balance
        if (command === '!sodu' || command === '!balance') {
            const currentBal = getBalance(message.author.id);
            return message.reply('💳 Số dư tài khoản của bạn: **' + currentBal.toLocaleString() + ' 🪙 điểm**');
        }

        // 3. Lệnh Admin cộng điểm cho người khác: !congdiem @User 
        if (command === '!congdiem' || command === '!add') {
            if (message.author.id !== ADMIN_USER_ID) {
                return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
            }

            const targetUser = message.mentions.users.first();
            const amount = parseInt(args[2]);

            if (!targetUser || isNaN(amount) || amount <= 0) {
                return message.reply('⚠️ Cú pháp không đúng! Vui lòng dùng: `!congdiem @TênNgườiDùng `\n*(Ví dụ: `!congdiem @Han 50000`)*');
            }

            const targetId = targetUser.id;
            const currentTargetBal = getBalance(targetId);
            const newTargetBal = currentTargetBal + amount;
            balances.set(targetId, newTargetBal);

            return message.reply('✅ **Cộng điểm thành công!** Đã cộng **+' + amount.toLocaleString() + ' 🪙 điểm** cho ' + targetUser + '. Số dư mới của họ là: **' + newTargetBal.toLocaleString() + ' 🪙 điểm**.');
        }

        // 4. Lệnh hướng dẫn sử dụng: !huongdan hoặc !help
        if (command === '!huongdan' || command === '!help') {
            const embedHelp = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('📖 HƯỚNG DẪN HỆ THỐNG MINI-GAME 15 SAO')
                .addFields(
                    { name: '💳 Xem số dư', value: '`!sodu` hoặc `!balance` — Kiểm tra số điểm hiện có.', inline: false },
                    { name: '🎁 Điểm danh hằng ngày', value: '`!diemdanh` — Nhận ngay 2,000 điểm (1 lần/ngày).', inline: false },
                    { name: '🎲 Chơi Tài Xỉu', value: '`!tx tai `\n`!tx xiu `\n`!tx hoa `\n*(Tài: 11-17 | Xỉu: 4-10 | Hòa/Bão: 3 con giống nhau, ăn x5)*', inline: false },
                    { name: '💵 Nạp điểm ảo', value: '`!nap` — Xem thông tin chuyển khoản ngân hàng.', inline: false },
                    { name: '👑 Lệnh Admin', value: '`!congdiem @User ` — Cộng điểm cho thành viên.', inline: false }
                )
                .setFooter({ text: '⚔️ Anh Han Bảo Vậy ⚔️' });

            return message.reply({ embeds: [embedHelp] });
        }

        // 5. Lệnh thông tin nạp tiền: !nap hoặc !naptien
        if (command === '!nap' || command === '!naptien') {
            const embedNap = new EmbedBuilder()
                .setColor(0xFFD700)
                .setTitle('💎 NẠP ĐIỂM ẢO HỆ THỐNG MINI-GAME')
                .addFields(
                    { name: '🏦 Ngân hàng', value: '**Vietcombank**', inline: true },
                    { name: '🔢 Số tài khoản', value: '**9373027582**', inline: true },
                    { name: '👤 Chủ tài khoản', value: '**Vũ Trọng Nhân**', inline: false },
                    { name: '💰 Mức nạp', value: '- Mức chuẩn: **100.000 VNĐ**\n- Hoặc tự chọn (Tối thiểu: **10.000 VNĐ**)', inline: false },
                    { name: '📝 Nội dung chuyển khoản', value: '`napdiem [TênDiscord_hoặc_ID_của_bạn]`', inline: false }
                )
                .setFooter({ text: 'Sau khi chuyển khoản, hãy nhắn cho Admin để được cộng điểm vào game nhé!' });

            return message.reply({ embeds: [embedNap] });
        }

        // 6. Lệnh điểm danh nhận quà hằng ngày: !diemdanh
        if (command === '!diemdanh') {
            const userId = message.author.id;
            
            const now = new Date();
            const todayStr = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate();

            if (lastCheckIn.get(userId) === todayStr) {
                return message.reply('⏳ Bạn đã điểm danh hôm nay rồi! Vui lòng quay lại vào ngày mai nhé.');
            }

            lastCheckIn.set(userId, todayStr);

            const reward = 2000;
            const newBal = getBalance(userId) + reward;
            balances.set(userId, newBal);

            return message.reply('🎁 Điểm danh thành công! Bạn nhận được **+' + reward.toLocaleString() + ' 🪙 điểm**. Số dư hiện tại của bạn là: **' + newBal.toLocaleString() + ' 🪙 điểm**.');
        }

        // 7. Lệnh chơi Tài Xỉu: !taixiu  
        if (command === '!taixiu' || command === '!tx') {
            const choice = args[1] ? args[1].toLowerCase() : '';
            const betAmountText = args[2];

            if (choice !== 'tai' && choice !== 'xiu' && choice !== 'hoa') {
                return message.reply('⚠️ Cú pháp không đúng! Vui lòng dùng:\n`!taixiu tai `\n`!taixiu xiu `\n`!taixiu hoa `\n*(Hoặc gõ `!huongdan` để xem chi tiết)*');
            }

            const betAmount = parseInt(betAmountText);
            if (isNaN(betAmount) || betAmount <= 0) {
                return message.reply('⚠️ Vui lòng nhập số tiền cược hợp lệ lớn hơn 0!');
            }

            const userId = message.author.id;
            const currentBal = getBalance(userId);

            if (betAmount > currentBal) {
                return message.reply('❌ Số dư của bạn không đủ! Bạn chỉ đang có **' + currentBal.toLocaleString() + ' 🪙 điểm**.');
            }

            balances.set(userId, currentBal - betAmount);

            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            const dice3 = Math.floor(Math.random() * 6) + 1;
            const totalSum = dice1 + dice2 + dice3;

            let result = '';
            if (dice1 === dice2 && dice2 === dice3) {
                result = 'hoa';
            } else {
                result = totalSum >= 11 ? 'tai' : 'xiu';
            }

            let resultText = '';
            if (result === 'tai') resultText = '🟡 TÀI';
            else if (result === 'xiu') resultText = '🔵 XỈU';
            else resultText = '⚪ HÒA (BÃO)';

            let userChoiceText = '';
            if (choice === 'tai') userChoiceText = '🟡 TÀI';
            else if (choice === 'xiu') userChoiceText = '🔵 XỈU';
            else userChoiceText = '⚪ HÒA';

            let messageResult = '';
            let finalBal = balances.get(userId);

            if (choice === result) {
                const multiplier = (choice === 'hoa') ? 5 : 2;
                const winAmount = betAmount * multiplier;
                finalBal += winAmount;
                balances.set(userId, finalBal);
                messageResult = '🎉 **CHÚC MỪNG BẠN ĐÃ THẮNG!** Nhận được **+' + winAmount.toLocaleString() + ' 🪙 điểm** (Hệ số x' + multiplier + ').';
            } else if (result === 'hoa' && choice !== 'hoa') {
                finalBal += betAmount;
                balances.set(userId, finalBal);
                messageResult = '🤝 **KẾT QUẢ RA HÒA (BÃO)!** Bạn được hoàn lại toàn bộ **' + betAmount.toLocaleString() + ' 🪙 điểm** tiền cược.';
            } else {
                messageResult = '😢 **BẠN ĐÃ THUA CƯỢC!** Mất **-' + betAmount.toLocaleString() + ' 🪙 điểm**.';
            }

            const embed = new EmbedBuilder()
                .setColor(choice === result ? 0x00FF00 : (result === 'hoa' ? 0xFFA500 : 0xFF0000))
                .setTitle('🎲 KẾT QUẢ TÀI XỈU CÓ HÒA 🎲')
                .addFields(
                    { name: '👤 Người chơi', value: '' + message.author, inline: true },
                    { name: '🎯 Lựa chọn', value: '' + userChoiceText, inline: true },
                    { name: '💵 Tiền cược', value: betAmount.toLocaleString() + ' 🪙', inline: true },
                    { name: '🎲 Xúc xắc', value: '🎲 **' + dice1 + ' - ' + dice2 + ' - ' + dice3 + '** (Tổng: **' + totalSum + '**)', inline: false },
                    { name: '🏆 Kết quả', value: '**' + resultText + '**', inline: false },
                    { name: '📜 Tổng kết', value: messageResult + '\n💳 Số dư mới: **' + finalBal.toLocaleString() + ' 🪙 điểm**', inline: false }
                )
                .setFooter({ text: '⚔️ Hệ Thống Mini-Game 15 Sao ⚔️ | Anh Han Bảo Vậy' });

            return message.reply({ embeds: [embed] });
        }
    });

    client.login(process.env.GAME_BOT_TOKEN);
}

module.exports = startDiscordBot;
