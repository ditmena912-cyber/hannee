const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// Set lưu trữ ID các thông báo đã gửi để chống trùng lặp
const sentNotifications = new Set();

// Hàm gửi Embed chuẩn Discord
async function sendBossEmbed({ boss, mapName, server, time }) {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhookUrl) {
    console.error('Chưa cấu hình DISCORD_WEBHOOK_URL');
    return;
  }

  const payload = {
    username: "Spidey Bot",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "BOSS MỚI XUẤT HIỆN!",
        color: 15158332, // Màu viền đỏ cam (#E74C3C)
        fields: [
          {
            name: "Boss",
            value: boss || "Không xác định",
            inline: true
          },
          {
            name: "Map",
            value: mapName || "Không xác định",
            inline: true
          },
          {
            name: "Máy chủ",
            value: server || "15 sao",
            inline: true
          },
          {
            name: "Thời gian",
            value: time || new Date().toLocaleString("vi-VN"),
            inline: false
          }
        ],
        footer: {
          text: "Nguồn: service.dungpham.com.vn"
        }
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

// Hàm cào và lọc dữ liệu
async function scrapeData() {
  try {
    const response = await axios.get('https://service.dungpham.com.vn/thong-bao', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // Duyệt qua từng khung thông báo trên trang web
    $('.card, .notification-item, div').each((i, el) => {
      const text = $(el).text().trim();

      // ĐIỀU KIỆN LỌC TỐI ƯU:
      // 1. Phải chứa từ khóa báo Boss xuất hiện (vd: "vừa xuất hiện", "Boss", "xuất hiện tại")
      // 2. Thuộc máy chủ "15 sao"
      // 3. Loại bỏ các thông báo rác (như "đánh quái", "Set kích hoạt",...)
      const isBossNotice = text.toLowerCase().includes('xuất hiện') || text.toLowerCase().includes('boss');
      const is15Sao = text.includes('15 sao') || text.includes('15s');
      const isTrashNotice = text.includes('vừa đánh quái') || text.includes('trang bị Set');

      if (isBossNotice && is15Sao && !isTrashNotice) {
        
        // Tạo chuỗi định danh sạch duy nhất để lọc lặp
        const uniqueId = text.replace(/\s+/g, ' ');

        if (!sentNotifications.has(uniqueId) && uniqueId.length > 15) {
          sentNotifications.add(uniqueId);

          // Trích xuất thông tin Boss, Map và Thời gian từ nội dung cào được
          let boss = "Super Broly";
          let mapName = "Chưa rõ";
          let server = "15 sao";
          let time = "";

          // Tìm thời gian dạng DD/MM/YYYY - HH:MM:SS
          const timeMatch = uniqueId.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2}/);
          if (timeMatch) {
            time = timeMatch[0];
          } else {
            time = new Date().toLocaleString("vi-VN");
          }

          // Trích xuất tên Boss và Map nếu có dạng "Boss ... tại ..."
          const bossMatch = uniqueId.match(/(?:Boss|boss)\s+([^\s]+(?:\s+[^\s]+){0,3})/);
          if (bossMatch) boss = bossMatch[1];

          const mapMatch = uniqueId.match(/(?:tại|ở|Map)\s+([^\s]+(?:\s+[^\s]+){0,2})/i);
          if (mapMatch) mapName = mapMatch[1];

          // Gửi thông báo dạng Embed sang Discord
          sendBossEmbed({
            boss: boss,
            mapName: mapName,
            server: server,
            time: time
          });

          // Giới hạn bộ nhớ lưu tối đa 500 thông báo gần nhất
          if (sentNotifications.size > 500) {
            const firstItem = sentNotifications.values().next().value;
            sentNotifications.delete(firstItem);
          }
        }
      }
    });
  } catch (error) {
    console.error('Lỗi cào dữ liệu:', error.message);
  }
}

// Chạy cào dữ liệu mỗi 5 giây/lần
setInterval(scrapeData, 5000);

app.get('/', (req, res) => res.send('Boss Notification Scraper for Server 15 Sao is Active!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  scrapeData();
});
