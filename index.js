const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Set lưu trữ ID các thông báo đã gửi để tránh lặp
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
          { name: "Boss", value: boss || "Chưa rõ", inline: true },
          { name: "Map", value: mapName || "Chưa rõ", inline: true },
          { name: "Máy chủ", value: server || "15 sao", inline: true },
          { name: "Thời gian", value: time || new Date().toLocaleString("vi-VN"), inline: false }
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

// Trích xuất dữ liệu thực tế
async function fetchNotifications() {
  try {
    // Thử gọi trực tiếp endpoint dữ liệu thông báo từ trang web
    const response = await axios.get('https://service.dungpham.com.vn/api/thong-bao', {
      params: {
        server: '15 sao',
        category: 'he-thong'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 5000
    }).catch(async () => {
      // Bán fallback sang trang HTML nếu API yêu cầu token khác
      return await axios.get('https://service.dungpham.com.vn/thong-bao', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
    });

    let rawData = response.data;
    let items = [];

    if (Array.isArray(rawData)) {
      items = rawData;
    } else if (rawData && Array.isArray(rawData.data)) {
      items = rawData.data;
    }

    // Nếu trả về danh sách dạng mảng chuẩn
    if (items.length > 0) {
      for (const item of items) {
        const text = typeof item === 'string' ? item : (item.content || item.title || JSON.stringify(item));
        processAndSend(text);
      }
    } else if (typeof rawData === 'string') {
      // Phân tích cú pháp chuỗi HTML nếu không phải API JSON
      const cheerio = require('cheerio');
      const $= cheerio.load(rawData);$('div, p, span').each((i, el) => {
        const text = $(el).text().trim();
        if (text.includes('vừa xuất hiện') || (text.includes('Boss') && text.includes('15 sao'))) {
          processAndSend(text);
        }
      });
    }
  } catch (error) {
    console.log('Đang chờ thông báo mới từ hệ thống...');
  }
}

function processAndSend(fullText) {
  // Chỉ lấy nếu đúng thông báo Boss xuất hiện và đúng máy chủ 15 sao
  const lower = fullText.toLowerCase();
  
  if (!lower.includes('vừa xuất hiện') && !lower.includes('boss')) return;
  if (lower.includes('đánh quái') || lower.includes('trang bị set')) return;

  // Lấy ID duy nhất từ chuỗi thông báo
  const cleanId = fullText.replace(/\s+/g, ' ').trim();
  if (sentNotifications.has(cleanId) || cleanId.length < 15) return;

  sentNotifications.add(cleanId);

  // Phân tích tên Boss & Map thực tế từ chuỗi thông báo
  // Cú pháp thông báo thường gặp: "Boss [Tên Boss] vừa xuất hiện tại [Tên Map] (15 sao)"
  let boss = "Chưa rõ";
  let mapName = "Chưa rõ";
  let server = "15 sao";
  let time = "";

  // Bóc tách thời gian
  const timeMatch = cleanId.match(/\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}:\d{2}:\d{2}/);
  if (timeMatch) {
    time = timeMatch[0];
  } else {
    time = new Date().toLocaleString("vi-VN");
  }

  // Trích xuất Boss
  const bossRegex = /(?:Boss|boss)\s+([A-Za-z0-9\s]+?)(?=\s+(?:vừa|xuất hiện|tại|ở)|$)/i;
  const bMatch = cleanId.match(bossRegex);
  if (bMatch && bMatch[1]) boss = bMatch[1].trim();

  // Trích xuất Map
  const mapRegex = /(?:tại|ở)\s+([A-Za-z0-9\s]+?)(?=\s+\(|\s+-\s+|\s+\d|$)/i;
  const mMatch = cleanId.match(mapRegex);
  if (mMatch && mMatch[1]) mapName = mMatch[1].trim();

  sendBossEmbed({ boss, mapName, server, time });

  if (sentNotifications.size > 300) {
    const firstItem = sentNotifications.values().next().value;
    sentNotifications.delete(firstItem);
  }
}

// Kiểm tra thông báo mỗi 5 giây
setInterval(fetchNotifications, 5000);

app.get('/', (req, res) => res.send('Bot Scraper Active'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  fetchNotifications();
});
