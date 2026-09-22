const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// 📌 ID kênh # mini-game của bạn
const TARGET_CHANNEL_ID = '1551915282014933083'; 

// 💰 Lưu trữ số dư điểm ảo của người chơi (Key: userId, Value: số điểm)
const balances = new Map();
// 📅 Lưu thời gian điểm danh cuối cùng của người chơi
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

        // 3. Lệnh điểm danh nhận quà hằng ngày: !diemdanh
        if (command === '!diemdanh') {
            const userId = message.author.id;
            const today = new Date().toDateString();

            if (lastCheckIn.get(userId) === today) {
                return message.reply('⏳ Bạn đã điểm danh hôm nay rồi! Hãy quay lại vào ngày mai nhé.');
            }

            lastCheckIn.set(userId, today);
            const reward = 2000;
            const newBal = getBalance(userId) + reward;
            balances.set(userId, newBal);

            return message.reply('🎁 Điểm danh thành công! Bạn nhận được **+' + reward.toLocaleString() + ' 🪙 điểm**. Số dư hiện tại: **' + newBal.toLocaleString() + ' 🪙 điểm**.');
        }

        // 4. Lệnh chơi Tài Xỉu: !taixiu  
        if (command === '!taixiu' || command === '!tx') {
            const choice = args[1] ? args[1].toLowerCase() : '';
            const betAmountText = args[2];

            if (choice !== 'tai' && choice !== 'xiu' && choice !== 'hoa') {
                return message.reply('⚠️ Cú pháp không đúng! Vui lòng dùng:\n`!taixiu tai `\n`!taixiu xiu `\n`!taixiu hoa `\n*(Ví dụ: `!taixiu tai 1000`)*');
            }

            const betAmount = parseInt(betAmountText);
            if (isNaN(betAmount) || betAmount <= 0) {
                return message.reply('⚠️ Vui lòng nhập số tiền cược hợp lệ lớn hơn 0!');
            }

            const userId = message.author.id;
            const currentBal = getBalance(userId);

            // 🛑 Kiểm tra số dư: Nếu không đủ tiền thì dừng lại NGAY LẬP TỨC và không chạy tiếp
            if (betAmount > currentBal) {
                return message.reply('❌ Số dư của bạn không đủ! Bạn chỉ đang có **' + currentBal.toLocaleString() + ' 🪙 điểm**.');
            }

            // Trừ tiền cược trước
            balances.set(userId, currentBal - betAmount);

            // Tung 3 con xúc xắc (mỗi con từ 1 đến 6)
            const dice1 = Math.floor(Math.random() * 6) + 1;
            const dice2 = Math.floor(Math.random() * 6) + 1;
            const dice3 = Math.floor(Math.random() * 6) + 1;
            const totalSum = dice1 + dice2 + dice3;

            // Quy định kết quả:
            // - Nếu 3 con xúc xắc giống nhau tính là HÒA (Bão)
            // - Xỉu: từ 4 đến 10
            // - Tài: từ 11 đến 17
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

            // Tạo khung hiển thị đẹp mắt (Embed)
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
