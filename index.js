const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// Set lưu trữ vết thông báo đã gửi
const sentNotifications = new Set();

// Hàm gửi Discord Embed
async function sendBossEmbed({ boss, mapName, server, time }) {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhookUrl) return;

  const payload = {
    username: "Spidey Bot",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "BOSS MỚI XUẤT HIỆN!",
        color: 15158332,
        fields: [
          { name: "Boss", value: boss, inline: true },
          { name: "Map", value: mapName, inline: true },
          { name: "Máy chủ", value: server, inline: true },
          { name: "Thời gian", value: time, inline: false }
        ],
        footer: { text: "Nguồn: service.dungpham.com.vn" }
      }
    ]
  };

  try {
    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Lỗi gửi Webhook Discord:', err);
  }
}

async function scrapeData() {
  try {
    const response = await axios.get('https://service.dungpham.com.vn/thong-bao', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);

    // Duyệt qua tất cả các đoạn văn bản trong trang
    $('p, div, span, li').each((i, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();

      // ĐIỀU KIỆN SIẾT CHẶT TỐI ĐA:
      // 1. Phải chứa từ khóa báo Boss ("vừa xuất hiện", "boss xuất hiện", "xuất hiện tại")
      // 2. Phải chứa đúng máy chủ "15 sao"
      // 3. KHÔNG chứa thông báo đánh quái, nhặt đồ
      const lower = text.toLowerCase();
      const isBoss = lower.includes('vừa xuất hiện') || lower.includes('boss');
      const is15Sao = text.includes('15 sao') || text.includes('15s');
      const isTrash = lower.includes('đánh quái') || lower.includes('trang bị set') || lower.includes('kích hoạt');

      if (isBoss && is15Sao && !isTrash) {
        
        // Trích xuất Tên Boss và Map
        let boss = "";
        let mapName = "Chưa rõ";
        let time = "";

        // Trích xuất Thời gian (ví dụ: 21/09/2026 - 00:52:35)
        const timeMatch = text.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2}/);
        if (timeMatch) {
          time = timeMatch[0];
        }

        // Tìm tên Boss cụ thể trong chuỗi văn bản
        const bossMatch = text.match(/(?:Boss|boss)\s+([A-Za-z0-9\s]+?)(?=\s+(?:vừa|xuất hiện|tại|ở)|$)/i);
        if (bossMatch && bossMatch[1]) {
          boss = bossMatch[1].trim();
        }

        const mapMatch = text.match(/(?:tại|ở)\s+([A-Za-z0-9\s]+?)(?=\s+\(|\s+-\s+|\s+\d|$)/i);
        if (mapMatch && mapMatch[1]) {
          mapName = mapMatch[1].trim();
        }

        // KHÓA CHỐNG SPAM: Chỉ gửi NẾU tìm thấy tên Boss cụ thể HOẶC có mốc thời gian thực từ web
        // Tuyệt đối KHÔNG gửi nếu Boss bị rỗng/Chưa rõ
        if (boss && boss !== "Chưa rõ" && time) {
          const uniqueKey = `${boss}_${mapName}_${time}`;

          if (!sentNotifications.has(uniqueKey)) {
            sentNotifications.add(uniqueKey);

            sendBossEmbed({
              boss: boss,
              mapName: mapName,
              server: "15 sao",
              time: time
            });

            if (sentNotifications.size > 200) {
              const firstItem = sentNotifications.values().next().value;
              sentNotifications.delete(firstItem);
            }
          }
        }
      }
    });
  } catch (error) {
    // Bỏ qua lỗi kết nối
  }
}

// Quét dữ liệu mỗi 10 giây/lần
setInterval(scrapeData, 10000);

app.get('/', (req, res) => res.send('Bot Scraper Active - Spam Blocked'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  scrapeData();
});
