// ==========================================
// 🎯 MÃ CODE CHỨC NĂNG NHIỆM VỤ (DÁN VÀO FILE CỦA BẠN)
// ==========================================
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');

// --- CẤU HÌNH ID ---
const PUBLIC_CHANNEL_ID = '1552277286747897876';   
const PRIVATE_ROOM_ID = '1552277666588270592';       
const PRIVATE_ROLE_ID = '1551998207116968016';       
const SUPER_ADMIN_ID = '979587101328834621';       

// --- DATABASE BỘ NHỚ TẠM ---
const accounts = new Map();       
const sessions = new Map();       
const subAdmins1 = new Set();     
const subAdmins2 = new Set();     
const superAdmins = new Set([SUPER_ADMIN_ID]);

function isSuperAdmin(userId) {
    return superAdmins.has(userId);
}

async function getCountInPrivateRoom(guild) {
    try {
        const channel = await guild.channels.fetch(PRIVATE_ROOM_ID).catch(() => null);
        if (channel && channel.isVoiceBased()) {
            return channel.members.size;
        }
    } catch (e) {}
    return 0;
}

async function updatePublicPanel(client, guild) {
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

// Hàm khởi chạy sự kiện nhiệm vụ (Gắn vào client của bạn)
function setupNhiemVu(client, BOT_TOKEN) {
    client.once('ready', async () => {
        const commands = [
            new SlashCommandBuilder().setName('addadmin1').setDescription('[Super Admin] Thêm Admin cấp 1')
                .addUserOption(opt => opt.setName('user').setDescription('Chọn thành viên').setRequired(true)),
            new SlashCommandBuilder().setName('addadmin2').setDescription('[Admin] Thêm Admin cấp 2')
                .addUserOption(opt => opt.setName('user').setDescription('Chọn thành viên').setRequired(true)),
        ].map(cmd => cmd.toJSON());

        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        } catch (e) {}

        client.guilds.cache.forEach(guild => {
            updatePublicPanel(client, guild);
        });
    });

    client.on('interactionCreate', async (interaction) => {
        const { user, guild } = interaction;

        if (interaction.isChatInputCommand()) {
            const { commandName } = interaction;
            if (commandName === 'addadmin1') {
                if (!isSuperAdmin(user.id)) return interaction.reply({ content: '❌ Chỉ Super Admin mới có quyền!', ephemeral: true });
                const target = interaction.options.getUser('user');
                subAdmins1.add(target.id);
                return interaction.reply({ content: `✅ Đã cấp quyền Admin cấp 1 cho <@${target.id}>!`, ephemeral: true });
            }
            if (commandName === 'addadmin2') {
                if (!isSuperAdmin(user.id) && !subAdmins1.has(user.id)) return interaction.reply({ content: '❌ Bạn không có quyền!', ephemeral: true });
                const target = interaction.options.getUser('user');
                subAdmins2.add(target.id);
                return interaction.reply({ content: `✅ Đã cấp quyền Admin cấp 2 cho <@${target.id}>!`, ephemeral: true });
            }
        }

        if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId === 'nv_btn_register') {
                const modal = new ModalBuilder().setCustomId('nv_modal_register').setTitle('Đăng Ký Tài Khoản Nhiệm Vụ');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_username').setLabel('Tài khoản').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_password').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_repassword').setLabel('Nhập lại mật khẩu').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nv_reg_nickname').setLabel('Biệt danh').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (customId === 'nv_btn_login') {
                const modal = new ModalBuilder().setCustomId('nv_modal_login').setTitle('Đăng Nhập Tài Khoản');
                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_username').setLabel('Tài khoản').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_password').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true))
                );
                return await interaction.showModal(modal);
            }

            if (customId === 'nv_btn_logout') {
                if (!sessions.has(user.id)) return interaction.reply({ content: '⚠️ Bạn chưa đăng nhập!', ephemeral: true });
                sessions.delete(user.id);
                try {
                    const member = await guild.members.fetch(user.id);
                    if (member.roles.cache.has(PRIVATE_ROLE_ID)) await member.roles.remove(PRIVATE_ROLE_ID);
                } catch (e) {}
                await updatePublicPanel(client, guild);
                return interaction.reply({ content: '🔒 Đã đăng xuất và thu hồi quyền phòng riêng!', ephemeral: true });
            }

            if (customId === 'nv_btn_my_info') {
                const session = sessions.get(user.id);
                if (!session) return interaction.reply({ content: '❌ Bạn chưa đăng nhập!', ephemeral: true });
                return interaction.reply({ content: `📋 Tài khoản: \`\({session.username}\` | Biệt danh: **\){session.nickname}**`, ephemeral: true });
            }

            if (customId === 'nv_btn_thamgia') {
                const session = sessions.get(user.id);
                if (!session) return interaction.reply({ content: '❌ Chưa đăng ký hoặc đăng nhập không được vào!', ephemeral: true });
                try {
                    const member = await guild.members.fetch(user.id);
                    await member.roles.add(PRIVATE_ROLE_ID);
                    await updatePublicPanel(client, guild);
                    return interaction.reply({ content: `✅ Đã cấp quyền vào phòng <#${PRIVATE_ROOM_ID}>!`, ephemeral: true });
                } catch (e) {
                    return interaction.reply({ content: '❌ Không thể cấp role!', ephemeral: true });
                }
            }

            if (customId === 'nv_btn_late') {
                if (!sessions.has(user.id)) return interaction.reply({ content: '❌ Bạn chưa đăng nhập!', ephemeral: true });
                return interaction.reply({ content: '⏰ Đã ghi nhận trạng thái **Late** của bạn.', ephemeral: true });
            }
        }

        if (interaction.isModalSubmit()) {
            const customId = interaction.customId;

            if (customId === 'nv_modal_register') {
                const username = interaction.fields.getTextInputValue('reg_username').trim();
                const password = interaction.fields.getTextInputValue('reg_password');
                const repassword = interaction.fields.getTextInputValue('reg_repassword');
                const nickname = interaction.fields.getTextInputValue('nv_reg_nickname').trim();

                if (password !== repassword) return interaction.reply({ content: '❌ Mật khẩu không khớp!', ephemeral: true });
                if (accounts.has(username)) return interaction.reply({ content: '❌ Tài khoản đã tồn tại!', ephemeral: true });

                accounts.set(username, { password, nickname, userId: user.id });
                sessions.set(user.id, { username, nickname });

                try {
                    const member = await guild.members.fetch(user.id);
                    await member.roles.add(PRIVATE_ROLE_ID);
                } catch (e) {}

                await updatePublicPanel(client, guild);

                const rowUserPanel = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nv_btn_my_info').setLabel('👤 Thông Tin').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('nv_btn_logout').setLabel('🚪 Đăng Xuất').setStyle(ButtonStyle.Danger)
                );

                return interaction.reply({ content: `🎉 Đăng ký thành công với biệt danh **${nickname}**!`, components: [rowUserPanel], ephemeral: true });
            }

            if (customId === 'nv_modal_login') {
                const username = interaction.fields.getTextInputValue('login_username').trim();
                const password = interaction.fields.getTextInputValue('login_password');

                const acc = accounts.get(username);
                if (!acc || acc.password !== password) return interaction.reply({ content: '❌ Sai tài khoản hoặc mật khẩu!', ephemeral: true });

                sessions.set(user.id, { username, nickname: acc.nickname });

                try {
                    const member = await guild.members.fetch(user.id);
                    await member.roles.add(PRIVATE_ROLE_ID);
                } catch (e) {}

                await updatePublicPanel(client, guild);

                const rowUserPanel = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('nv_btn_my_info').setLabel('👤 Thông Tin').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('nv_btn_logout').setLabel('🚪 Đăng Xuất').setStyle(ButtonStyle.Danger)
                );

                return interaction.reply({ content: `✅ Đăng nhập thành công với biệt danh **${acc.nickname}**!`, components: [rowUserPanel], ephemeral: true });
            }
        }
    });
}

module.exports = { setupNhiemVu };
