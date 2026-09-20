const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());

// Lưu lịch sử các thông báo đã gửi để tránh bị gửi lặp lại
const sentNotifications = new Set();

// Hàm gửi thông báo sang Discord
async function sendToDiscord(message) {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordWebhookUrl) {
    console.error('Chưa cấu hình DISCORD_WEBHOOK_URL');
    return;
  }

  try {
    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: "NRO Bot Thông Báo",
        content: `🔔 **[15 Sao - Hệ Thống]**\n${message}`
      })
    });
  } catch (err) {
    console.error('Lỗi gửi Webhook Discord:', err);
  }
}

// Hàm cào thông báo từ website
async function scrapeData() {
  try {
    const response = await axios.get('https://service.dungpham.com.vn/thong-bao', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);

    // Lọc các thẻ chứa thông báo (điều chỉnh selector theo cấu trúc trang)
    $('.notification-item, .card, div').each((i, el) => {
      const text = $(el).text().trim();

      // Kiểm tra nếu thông báo thuộc 15 sao / Hệ thống / Set kích hoạt
      if (text.includes('15 sao') || text.includes('vừa đánh quái') || text.includes('Set kích hoạt')) {
        // Tạo mã định danh duy nhất cho thông báo
        const id = text.substring(0, 100);

        if (!sentNotifications.has(id)) {
          sentNotifications.add(id);
          sendToDiscord(text);

          // Xóa bớt lịch sử cũ nếu bộ nhớ lưu quá 200 thông báo
          if (sentNotifications.size > 200) {
            const firstItem = sentNotifications.values().next().value;
            sentNotifications.delete(firstItem);
          }
        }
      }
    });
  } catch (error) {
    console.error('Lỗi khi cào dữ liệu:', error.message);
  }
}

// Chạy cào dữ liệu tự động mỗi 10 giây
setInterval(scrapeData, 10000);

// Route mặc định để kiểm tra status
app.get('/', (req, res) => res.send('Bot cào thông báo đang hoạt động!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  scrapeData(); // Chạy ngay lần đầu khi start
});
