const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// Set lưu trữ ID các thông báo đã gửi để chống trùng lặp
const sentNotifications = new Set();

// Hàm gửi Discord Embed đẹp
async function sendDiscordEmbed({ title, boss, mapName, server, time, source }) {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhookUrl) {
    console.error('Chưa cấu hình DISCORD_WEBHOOK_URL');
    return;
  }

  const payload = {
    username: "Spidey Bot",
    avatar_url: "https://i.imgur.com/4M34hi2.png", // URL ảnh đại diện tùy chọn
    embeds: [
      {
        title: title || "BOSS MỚI XUẤT HIỆN!",
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
          text: `Nguồn: ${source || "service.dungpham.com.vn"}`
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

// Hàm cào và phân tích dữ liệu
async function scrapeData() {
  try {
    const response = await axios.get('https://service.dungpham.com.vn/thong-bao', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // Tìm các khung thông báo trên trang web
    $('.card, .notification-item, div').each((i, el) => {
      const text = $(el).text().trim();

      // Chỉ lọc tin thuộc 15 sao hoặc Hệ thống
      if (text.includes('15 sao') || text.includes('Hệ thống') || text.includes('vừa đánh quái') || text.includes('xuất hiện')) {
        
        // Tạo ID duy nhất bằng toàn bộ chuỗi văn bản sạch để lọc trùng
        const uniqueId = text.replace(/\s+/g, ' ');

        if (!sentNotifications.has(uniqueId) && uniqueId.length > 20) {
          sentNotifications.add(uniqueId);

          // Phân tích văn bản để bóc tách thông tin (Boss, Map, Thời gian)
          let boss = "Super Broly";
          let mapName = "Đảo Guru";
          let server = "15 sao";
          let time = new Date().toISOString().replace('T', ' ').substring(0, 19);

          // Trích xuất các dòng thông tin nếu có dạng mẫu
          const lines = uniqueId.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines[0]) boss = lines[0];
          
          const timeMatch = uniqueId.match(/\d{2}\/\d{2}\/\d{4} - \d{2}:\d{2}:\d{2}/);
          if (timeMatch) time = timeMatch[0];

          // Gửi tin nhắn Embed sang Discord
          sendDiscordEmbed({
            title: "BOSS MỚI XUẤT HIỆN!",
            boss: boss,
            mapName: mapName,
            server: server,
            time: time,
            source: "service.dungpham.com.vn"
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

// Tự động kiểm tra cào tin tức mỗi 5 giây
setInterval(scrapeData, 5000);

app.get('/', (req, res) => res.send('Bot Discord Notification Embed is Running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  scrapeData();
});
