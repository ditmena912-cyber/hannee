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
                // 🟟 KHÓA ĐẶT CƯỢC VÀ CHUYỂN TRẠNG THÁI NGAY LẬP TỨC TRÁNH GỬI TRÙNG
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

                    if (betInfo.choice === result) {
                        const multiplier = (result === 'HOA') ? 5 : 2;
                        profit = betInfo.amount * multiplier;
                        user.balance += profit;
                        user.total_win += (profit - betInfo.amount);
                    } else if (result === 'HOA' && betInfo.choice !== 'HOA') {
                        user.balance += betInfo.amount; // Hoàn tiền
                        profit = 0;
                    } else {
                        user.total_loss += betInfo.amount;
                        profit = -betInfo.amount;
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

                // Gửi thông báo kết quả ván đấu (Đã sửa lại đúng cú pháp template string `${...}`)
                let resultString = result === 'TAI' ? `🟡 TÀI (\({totalSum})` : (result === 'XIU' ? `🔵 XỈU (\){totalSum})` : `⚪ HÒA BÃO (${totalSum})`);
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
}, 5000);
