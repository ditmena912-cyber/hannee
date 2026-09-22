const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Database tạm thời bằng Map (Bạn có thể thay bằng MongoDB/SQL nếu cần)
const accounts = new Map(); // Lưu tài khoản: username -> { password, discordId, balance }
const loggedInUsers = new Set(); // Lưu các discordId đã đăng nhập thành công trong phiên

// Tạo bảng giao diện Đăng Ký / Đăng Nhập gửi vào phòng chat
function getAuthPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🔐 HỆ THỐNG XÁC THỰC TÀI KHOẢN')
        .setDescription('Vui lòng **Đăng nhập** hoặc **Đăng ký** tài khoản để tham gia chơi game và hiển thị các tính năng trong phòng này.')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_dangnhap').setLabel('🔑 Đăng Nhập').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_open_dangky').setLabel('📝 Đăng Ký').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

// Xử lý các tương tác nút bấm và Modal liên quan đến Đăng ký / Đăng nhập
async function handleAuthInteraction(interaction) {
    const customId = interaction.customId;

    // 1. Mở Modal Đăng Ký
    if (customId === 'btn_open_dangky') {
        const modal = new ModalBuilder().setCustomId('modal_dangky').setTitle('📝 Đăng Ký Tài Khoản Mới');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_user').setLabel('Tên tài khoản').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_pass').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true))
        );
        return await interaction.showModal(modal);
    }

    // 2. Mở Modal Đăng Nhập
    if (customId === 'btn_open_dangnhap') {
        const modal = new ModalBuilder().setCustomId('modal_dangnhap').setTitle('🔑 Đăng Nhập Hệ Thống');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_user').setLabel('Tên tài khoản').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_pass').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true))
        );
        return await interaction.showModal(modal);
    }

    // 3. Xử lý Submit Modal Đăng Ký
    if (customId === 'modal_dangky') {
        const user = interaction.fields.getTextInputValue('reg_user').trim();
        const pass = interaction.fields.getTextInputValue('reg_pass').trim();

        if (accounts.has(user)) {
            return interaction.reply({ content: '❌ Tên tài khoản này đã tồn tại, vui lòng chọn tên khác!', ephemeral: true });
        }

        accounts.set(user, { password: pass, discordId: interaction.user.id, balance: 100000 }); // Tặng sẵn 100k vàng khi tạo
        return interaction.reply({ content: `✅ Đăng ký thành công tài khoản **${user}**! Hãy bấm nút "Đăng Nhập" để vào game.`, ephemeral: true });
    }

    // 4. Xử lý Submit Modal Đăng Nhập
    if (customId === 'modal_dangnhap') {
        const user = interaction.fields.getTextInputValue('login_user').trim();
        const pass = interaction.fields.getTextInputValue('login_pass').trim();

        const acc = accounts.get(user);
        if (!acc || acc.password !== pass) {
            return interaction.reply({ content: '❌ Sai tên tài khoản hoặc mật khẩu!', ephemeral: true });
        }

        if (acc.discordId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Tài khoản này đang được liên kết với một người dùng Discord khác!', ephemeral: true });
        }

        // Đăng nhập thành công -> Lưu trạng thái login theo Discord ID
        loggedInUsers.add(interaction.user.id);

        return interaction.reply({ 
            content: `🎉 Đăng nhập thành công vào tài khoản **${user}**! Giao diện và các lệnh trong phòng đã được mở khóa cho bạn.`, 
            ephemeral: true 
        });
    }
}

// Kiểm tra xem Discord ID đã đăng nhập chưa
function isLoggedIn(discordId) {
    return loggedInUsers.has(discordId);
}

// Hàm lấy thông tin tài khoản game đồng bộ nếu cần (ví dụ liên kết số dư)
function getAccountByDiscordId(discordId) {
    for (let [username, acc] of accounts.entries()) {
        if (acc.discordId === discordId) {
            return { username, ...acc };
        }
    }
    return null;
}

module.exports = { getAuthPanel, handleAuthInteraction, isLoggedIn, getAccountByDiscordId, accounts };
