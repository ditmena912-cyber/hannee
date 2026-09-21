if (expectedTimeStr) {
        previousExpectedTimeStr = expectedTimeStr; // Lưu lại để so sánh ở vòng sau

        const payloadPrediction = {
          username: "Han Ne",
          avatar_url: "https://i.imgur.com/4M34hi2.png",
          embeds: [
            {
              title: "⏳ THỜI GIAN DỰ KIẾN VÒNG TIẾP THEO ⏳",
              color: 3447003,
              fields: [
                { name: "📌 Số 4 xuất hiện", value: `\`${formattedNumberFourTime}\``, inline: true },
                { name: "⏰ Dự kiến ra tiếp", value: `**${expectedTimeStr}**`, inline: true },
                { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
              ],
              footer: { text: "⚔️ Hệ Thống Dự Kiến 15 Sao ⚔️" }
            }
          ]
        };

        setTimeout(async () => {
          try {
            await axios.post(webhookUrl, payloadPrediction);
            console.log(`[Discord Prediction] Đã gửi tin nhắn dự kiến thành công. Mốc lưu: ${expectedTimeStr}`);
          } catch (err) {
            console.error("[Discord Error Prediction] Lỗi:", err.message);
          }
        }, 1000);
      }
