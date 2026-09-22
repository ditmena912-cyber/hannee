const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const accounts = new Map(); 
const loggedInUsers = new Set(); 

// ID của Role thành viên sau khi đã đăng nhập (Bạn cần thay ID role này bằng role thực tế trên server của bạn)
const MEMBER_ROLE_ID = '123456789012345678'; 

function getAuthPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🔐 HỆ THỐNG XÁC THỰC TÀI KHOẢN')
        .setDescription('Vui lòng **Đăng nhập** hoặc **Đăng ký** tài khoản để mở khóa và tham gia các tính năng trong phòng này.')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_dangnhap').setLabel('🔑 Đăng Nhập').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_open_dangky').setLabel('📝 Đăng Ký').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

async function handleAuthInteraction(interaction) {
    const customId = interaction.customId;

    if (customId === 'btn_open_dangky') {
        const modal = new ModalBuilder().setCustomId('modal_dangky').setTitle('📝 Đăng Ký Tài Khoản Mới');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_user').setLabel('Tên tài khoản').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reg_pass').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true))
        );
        return await interaction.showModal(modal);
    }

    if (customId === 'btn_open_dangnhap') {
        const modal = new ModalBuilder().setCustomId('modal_dangnhap').setTitle('🔑 Đăng Nhập Hệ Thống');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_user').setLabel('Tên tài khoản').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('login_pass').setLabel('Mật khẩu').setStyle(TextInputStyle.Short).setRequired(true))
        );
        return await interaction.showModal(modal);
    }

    if (customId === 'modal_dangky') {
        const user = interaction.fields.getTextInputValue('reg_user').trim();
        const pass = interaction.fields.getTextInputValue('reg_pass').trim();

        if (accounts.has(user)) {
            return interaction.reply({ content: '❌ Tên tài khoản này đã tồn tại!', ephemeral: true });
        }

        accounts.set(user, { password: pass, discordId: interaction.user.id, balance: 100000 });
        return interaction.reply({ content: `✅ Đăng ký thành công tài khoản **${user}**! Hãy bấm nút "Đăng Nhập".`, ephemeral: true });
    }

    if (customId === 'modal_dangnhap') {
        const user = interaction.fields.getTextInputValue('login_user').trim();
        const pass = interaction.fields.getTextInputValue('login_pass').trim();

        const acc = accounts.get(user);
        if (!acc || acc.password !== pass || acc.discordId !== interaction.user.id) {
            return interaction.reply({ content: '❌ Sai tên tài khoản, mật khẩu hoặc không đúng tài khoản Discord liên kết!', ephemeral: true });
        }

        loggedInUsers.add(interaction.user.id);

        // Tự động cấp Role để người dùng mở khóa quyền nhìn thấy nội dung phòng chat
        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (member && !member.roles.cache.has(MEMBER_ROLE_ID)) {
                await member.roles.add(MEMBER_ROLE_ID);
            }
        } catch (err) {
            console.error('Không thể cấp role tự động:', err);
        }

        return interaction.reply({ 
            content: `🎉 Đăng nhập thành công! Phòng chơi đã được mở khóa cho tài khoản **${user}**.`, 
            ephemeral: true 
        });
    }
}

function isLoggedIn(discordId) {
    return loggedInUsers.has(discordId);
}

function getAccountByDiscordId(discordId) {
    for (let [username, acc] of accounts.entries()) {
        if (acc.discordId === discordId) {
            return { username, ...acc };
        }
    }
    return null;
}

module.exports = { getAuthPanel, handleAuthInteraction, isLoggedIn, getAccountByDiscordId, accounts };
