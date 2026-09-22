const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const accounts = new Map(); // username -> { password, discordId, balance, total_deposit, total_withdraw, total_win, total_loss }
const loggedInUsers = new Set(); // Các discordId đã đăng nhập

const MEMBER_ROLE_ID = '1551998207116968016'; // ID Role "may mắn"

function getAuthPanel() {
    const embed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🔐 HỆ THỐNG XÁC THỰC TÀI KHOẢN')
        .setDescription('Vui lòng **Đăng nhập** hoặc **Đăng ký** tài khoản để mở khóa và tham gia các tính năng trong phòng chơi.')
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_open_dangnhap').setLabel('🔑 Đăng Nhập').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_open_dangky').setLabel('📝 Đăng Ký').setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

function getAccountInfoResponse(username, acc) {
    const embed = new EmbedBuilder()
        .setColor(0x00FFCC)
        .setTitle(`👤 THÔNG TIN TÀI KHOẢN: ${username}`)
        .addFields(
            { name: '💳 Số dư vàng', value: `${(acc.balance || 0).toLocaleString()} vàng`, inline: true },
            { name: '📥 Tổng nạp', value: `${(acc.total_deposit || 0).toLocaleString()} vàng`, inline: true },
            { name: '📤 Tổng rút', value: `${(acc.total_withdraw || 0).toLocaleString()} vàng`, inline: true },
            { name: '📈 Tổng thắng', value: `${(acc.total_win || 0).toLocaleString()} vàng`, inline: true },
            { name: '📉 Tổng thua', value: `${(acc.total_loss || 0).toLocaleString()} vàng`, inline: true }
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_dangxuat').setLabel('🚪 Đăng Xuất').setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [row], ephemeral: true };
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
            return interaction.reply({ content: '❌ Tên tài khoản này đã tồn tại, vui lòng chọn tên khác!', ephemeral: true });
        }

        accounts.set(user, { 
            password: pass, 
            discordId: interaction.user.id, 
            balance: 100000, 
            total_deposit: 0, 
            total_withdraw: 0, 
            total_win: 0, 
            total_loss: 0 
        });
        return interaction.reply({ content: `✅ Đăng ký thành công tài khoản **${user}**! Hãy bấm nút "Đăng Nhập" để vào game.`, ephemeral: true });
    }

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

        loggedInUsers.add(interaction.user.id);

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (member && !member.roles.cache.has(MEMBER_ROLE_ID)) {
                await member.roles.add(MEMBER_ROLE_ID);
            }
        } catch (err) {
            console.error('Không thể cấp role:', err);
        }

        return interaction.reply(getAccountInfoResponse(user, acc));
    }

    if (customId === 'btn_dangxuat') {
        loggedInUsers.delete(interaction.user.id);

        try {
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (member && member.roles.cache.has(MEMBER_ROLE_ID)) {
                await member.roles.remove(MEMBER_ROLE_ID);
            }
        } catch (err) {
            console.error('Không thể gỡ role:', err);
        }

        return interaction.update({ 
            content: '🚪 Bạn đã đăng xuất thành công khỏi hệ thống. Phòng chơi riêng tư đã được khóa lại.', 
            embeds: [], 
            components: [] 
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
