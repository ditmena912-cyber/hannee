const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');

// =========================================================================
// 🔑 ĐIỀN TOKEN BOT CỦA BẠN VÀO ĐÂY (GIỮ NGUYÊN DẤU NHÁY ĐƠN '')
// =========================================================================
const BOT_TOKEN = 'ĐIỀN_TOKEN_BOT_CỦA_BẠN_VÀO_ĐÂY';

// --- CẤU HÌNH ID THEO YÊU CẦU ---
const PUBLIC_CHANNEL_ID = '1552277286747897876';   // Kênh công khai đăng nhập/đăng ký
const PRIVATE_ROOM_ID = '1552277666588270592';      // ID phòng riêng / voice channel
const PRIVATE_ROLE_ID = '1551998207116968016';      // ID Role cấp khi đăng nhập thành công và xóa khi đăng xuất
const SUPER_ADMIN_ID = '979587101328834621';      // ID Super Admin quản lý tất cả

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// --- DATABASE BỘ NHỚ TẠM ---
const accounts = new Map();       // Lưu tài khoản: username -> { password, nickname, userId }
const sessions = new Map();       // Lưu phiên đăng nhập: userId -> { username, nickname }
const subAdmins1 = new Set();     // Admin cấp 1
const subAdmins2 = new Set();     // Admin cấp 2
const superAdmins = new Set([SUPER_ADMIN_ID]);

// Kiểm tra quyền Admin
function isSuperAdmin(userId) {
    return superAdmins.has(userId);
}

// Đếm số lượng người đang trong phòng riêng (Voice Channel)
async function getCountInPrivateRoom(guild) {
    try {
        const channel = await guild.channels.fetch(PRIVATE_ROOM_ID).catch(() => null);
        if (channel && channel.isVoiceBased()) {
            return channel.members.size;
        }
    } catch (e) {}
    return 0;
}

// Cập nhật hoặc gửi tin nhắn điều khiển ở kênh công khai
async function updatePublicPanel(guild) {
    try {
        const channel = await guild.channels.fetch(PUBLIC_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const onlineCount = await getCountInPrivateRoom(guild);

        const embed = new EmbedBuilder()
            .setColor(0x00AEFF)
            .setTitle('🎯 KHU LÀM NHIỆM VỤ TIỂU ĐỘI SÁT THỦ')
            .setDescription('Chào mừng anh em đến với khu làm nhiệm vụ chuyên nghiệp cùng anh em.\n\n' +
                '📊 **Hiện Đang có ' + onlineCount + ' người tham gia làm nhiệm vụ.**\n\n' +
                '⚠️ **LƯU Ý TRƯỚC KHI ĐĂNG KÍ VÀ ĐĂNG NHẬP:**\n' +
                '• Phòng chỉ dành cho những người làm nhiệm vụ.\n' +
                '• Vui lòng kiểm tra mic tránh làm ồn mất tiếng của người call team.\n' +
                '• Đồng ý các điều khoản lưu ý mới được vào phòng nha.\n' +
                '• Nếu không đăng kí hoặc đăng nhập sẽ không được vào.')
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('nv_btn_login').setLabel('🔑 Đăng Nhập').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('nv_btn_register').setLabel('📝 Đăng Ký').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('nv_btn_thamgia').setLabel('⚔️ Xác Nhận Tham Gia Ngay').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('nv_btn_late').setLabel('⏰ Late').setStyle(ButtonStyle.Danger)
        );

        const messages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        let existingMsg = messages ? messages.find(m => m.author.id === client.user.id && m.embeds.length > 0) : null;

        if (existingMsg) {
            await existingMsg.edit({ embeds: [embed], components: [row] }).catch(() => {});
        } else {
            await channel.send({ embeds: [embed], components: [row] });
        }
    } catch (e) {
        console.error('Lỗi update panel nhiệm vụ:', e);
    }
}

client.once('ready', async () => {
    console.log(`Bot Nhiệm Vụ đã đăng nhập thành công: ${client.user.tag}`);

    // Đăng ký Slash Commands quản lý Admin
    const commands = [
        new SlashCommandBuilder().setName('addadmin1').setDescription('[Super Admin] Thêm Admin cấp 1')
            .addUserOption(opt => opt.setName('user').setDescription('Chọn thành viên').setRequired(true)),
        new SlashCommandBuilder().setName('addadmin2').setDescription('[Admin] Thêm Admin cấp 2')
            .addUserOption(opt => opt.setName('user').setDescription('Chọn thành viên').setRequired(true)),
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Đã đăng ký lệnh quản lý Admin thành công!');
    } catch (e) {
        console.error(e);
    }

    client.guilds.cache.forEach(guild => {
        updatePublicPanel(guild);
    });
});

client.on('interactionCreate', async (interaction) => {
    const { user, guild } = interaction;

    // --- XỬ LÝ SLASH COMMAND ---
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        
        if (commandName === 'addadmin1') {
            if (!isSuperAdmin(user.id)) {
                return interaction.reply({ content: '❌ Chỉ có Super Admin mới có quyền thêm Admin cấp 1!', ephemeral: true });
            }
            const target = interaction.options.getUser('user');
            subAdmins1.add(target.id);
            return interaction.reply({ content: `✅ Đã cấp quyền **Admin cấp 1** cho <@${target.id}> thành công!`, ephemeral: true });
        }

        if (commandName === 'addadmin2') {
            if (!isSuperAdmin(user.id) && !subAdmins1.has(user.id)) {
                return interaction.reply({ content: '❌ Bạn không có quyền thêm Admin cấp 2!', ephemeral: true });
            }
            const target = interaction.options.getUser('user');
            subAdmins2.add(target.id);
            return interaction.reply({ content: `✅ Đã cấp quyền **Admin cấp 2** cho <@${target.id}> thành công!`, ephemeral: true });
        }
    }

    // --- XỬ LÝ NÚT BẤM (BUTTON) ---
    if (interaction.isButton()) {
        const customId = interaction.customId;

        // Mở Form Đăng Ký
        if (customId === 'nv_btn_register') {
            const modal = new ModalBuilder()
                .setCustomId('nv_modal_register')
                .setTitle('Đăng Ký Tài Khoản Nhiệm Vụ');

            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_username').setLabel('Tài khoản đăng nhập').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_password').setLabel('Mật khẩu mới').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_repassword').setLabel('Nhập lại mật khẩu').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nv_reg_nickname').setLabel('Biệt danh trong room').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        // Mở Form Đăng Nhập
        if (customId === 'nv_btn_login') {
            const modal = new ModalBuilder()
                .setCustomId('nv_modal_login')
                .setTitle('Đăng Nhập Tài Khoản');

            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_username').setLabel('Tài khoản đăng nhập').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_password').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return await interaction.showModal(modal);
        }

        // Đăng xuất (Thu hồi/xóa role)
        if (customId === 'nv_btn_logout') {
            if (!sessions.has(user.id)) {
                return interaction.reply({ content: '⚠️ Bạn chưa đăng nhập tài khoản nào!', ephemeral: true });
            }

            sessions.delete(user.id);

            // Xóa role khi đăng xuất
            try {
                const member = await guild.members.fetch(user.id);
                if (member.roles.cache.has(PRIVATE_ROLE_ID)) {
                    await member.roles.remove(PRIVATE_ROLE_ID);
                }
            } catch (e) {}

            await updatePublicPanel(guild);
            return interaction.reply({ content: '🔒 Đã đăng xuất thành công và tự động thu hồi quyền phòng riêng!', ephemeral: true });
        }

        // Xem thông tin cá nhân
        if (customId === 'nv_btn_my_info') {
            const session = sessions.get(user.id);
            if (!session) {
                return interaction.reply({ content: '❌ Bạn chưa đăng nhập vào hệ thống!', ephemeral: true });
            }
            return interaction.reply({
                content: `📋 **Thông tin tài khoản của bạn:**\n• Tài khoản: \`\({session.username}\`\n• Biệt danh trong room: **\){session.nickname}**\n• Trạng thái: Đang hoạt động`,
                ephemeral: true
            });
        }

        // Xác nhận tham gia ngay
        if (customId === 'nv_btn_thamgia') {
            const session = sessions.get(user.id);
            if (!session) {
                return interaction.reply({ content: '❌ **Cảnh báo:** Nếu không đăng kí hoặc đăng nhập sẽ không được vào! Vui lòng đăng nhập/đăng ký trước.', ephemeral: true });
            }

            try {
                const member = await guild.members.fetch(user.id);
                await member.roles.add(PRIVATE_ROLE_ID);
                await updatePublicPanel(guild);
                return interaction.reply({ content: '✅ Xác nhận thành công! Bạn đã được cấp quyền vào phòng riêng tại <#' + PRIVATE_ROOM_ID + '>. Chúc bạn làm nhiệm vụ tốt!', ephemeral: true });
            } catch (e) {
                return interaction.reply({ content: '❌ Không thể cấp role phòng riêng, vui lòng liên hệ Admin!', ephemeral: true });
            }
        }

        if (customId === 'nv_btn_late') {
            const session = sessions.get(user.id);
            if (!session) {
                return interaction.reply({ content: '❌ Bạn chưa đăng nhập tài khoản!', ephemeral: true });
            }
            return interaction.reply({ content: '⏰ Đã ghi nhận trạng thái **Late (vào muộn)** của bạn. Hãy nhanh chân vào phòng nhé!', ephemeral: true });
        }
    }

    // --- XỬ LÝ GỬI FORM (MODAL SUBMIT) ---
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        // Xử lý Đăng Ký
        if (customId === 'nv_modal_register') {
            const username = interaction.fields.getTextInputValue('reg_username').trim();
            const password = interaction.fields.getTextInputValue('reg_password');
            const repassword = interaction.fields.getTextInputValue('reg_repassword');
            const nickname = interaction.fields.getTextInputValue('nv_reg_nickname').trim();

            if (password !== repassword) {
                return interaction.reply({ content: '❌ Mật khẩu nhập lại không khớp. Vui lòng thử lại!', ephemeral: true });
            }

            if (accounts.has(username)) {
                return interaction.reply({ content: '❌ Tài khoản này đã tồn tại trên hệ thống!', ephemeral: true });
            }

            accounts.set(username, { password, nickname, userId: user.id });
            sessions.set(user.id, { username, nickname });

            // Cấp role ngay khi đăng ký (và đăng nhập) thành công
            try {
                const member = await guild.members.fetch(user.id);
                await member.roles.add(PRIVATE_ROLE_ID);
            } catch (e) {}

            await updatePublicPanel(guild);

            const rowUserPanel = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('nv_btn_my_info').setLabel('👤 Thông Tin Của Tôi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('nv_btn_logout').setLabel('🚪 Đăng Xuất').setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({
                content: `🎉 Đăng ký và đăng nhập thành công!\n• Biệt danh: **${nickname}**\n• Bạn đã được cấp quyền role phòng riêng.`,
                components: [rowUserPanel],
                ephemeral: true
            });
        }

        // Xử lý Đăng Nhập
        if (customId === 'nv_modal_login') {
            const username = interaction.fields.getTextInputValue('login_username').trim();
            const password = interaction.fields.getTextInputValue('login_password');

            const acc = accounts.get(username);
            if (!acc || acc.password !== password) {
                return interaction.reply({ content: '❌ Sai tài khoản hoặc mật khẩu!', ephemeral: true });
            }

            sessions.set(user.id, { username, nickname: acc.nickname });

            // Cấp role khi đăng nhập thành công
            try {
                const member = await guild.members.fetch(user.id);
                await member.roles.add(PRIVATE_ROLE_ID);
            } catch (e) {}

            await updatePublicPanel(guild);

            const rowUserPanel = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('nv_btn_my_info').setLabel('👤 Thông Tin Của Tôi').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('nv_btn_logout').setLabel('🚪 Đăng Xuất').setStyle(ButtonStyle.Danger)
            );

            return interaction.reply({
                content: `✅ Đăng nhập thành công với biệt danh: **${acc.nickname}**! Bạn đã được cấp role phòng riêng.`,
                components: [rowUserPanel],
                ephemeral: true
            });
        }
    }
});

client.login(BOT_TOKEN);
