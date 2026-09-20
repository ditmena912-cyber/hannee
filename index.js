const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Biến lưu trạng thái baseline & các thông báo đã xử lý
let isBaselineLoaded = false;
const processedIds = new Set();

// Hàm gửi Embed sang Discord Webhook
async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("Chưa cấu hình DISCORD_WEBHOOK_URL trong Environment Variables!");
    return;
  }

  // Trích xuất hoặc gán thông tin mặc định
  const bossName = item.bossName || item.title || item.content || "Chưa rõ";
  const mapName = item.mapName || item.map || "Chưa rõ";
  const serverName = item.server || "15 sao";
  const timeStr = item.time || item.createdAt || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const payload = {
    username: "Spidey Bot",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "BOSS MỚI XUẤT HIỆN!",
        color: 15158332, // Màu đỏ
        fields: [
          { name: "Boss", value: String(bossName), inline: true },
          { name: "Map", value: String(mapName), inline: true },
          { name: "Máy chủ", value: String(serverName), inline: true },
          { name: "Thời gian", value: String(timeStr), inline: false }
        ],
        footer: { text: "Nguồn: service.dungpham.com.vn" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log(`[Discord] Đã gửi thông báo Boss: ${bossName}`);
  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook:", err.message);
  }
}

// Hàm gọi API nguồn để lấy danh sách Boss
async function fetchBossApi() {
  try {
    const response = await axios.get('https://service.dungpham.com.vn/api/thong-bao', {
      params: {
        server: '15 sao',
        category: 'BOSS',
        size: 100,
        sort: 'id,desc'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const dataList = Array.isArray(response.data) ? response.data : (response.data.content || []);

    if (!Array.isArray(dataList)) return;

    // Lần đầu tiên chạy: Đánh dấu tất cả dữ liệu hiện tại làm baseline để không bị gửi lặp thông báo cũ
    if (!isBaselineLoaded) {
      dataList.forEach(item => {
        const id = item.id || `${item.bossName}_${item.time}`;
        processedIds.add(id);
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Đã thiết lập baseline với ${processedIds.size} bản ghi cũ.`);
      return;
    }

    // Các lần quét tiếp theo: Chỉ lọc những bản ghi MỚI chưa từng xuất hiện
    const newItems = [];
    for (const item of dataList) {
      const id = item.id || `${item.bossName}_${item.time}`;

      // Kiểm tra xem đã xử lý chưa và có thuộc máy chủ 15 sao không
      const isServer15 = !item.server || String(item.server).includes('15');
      if (!processedIds.has(id) && isServer15) {
        processedIds.add(id);
        newItems.push(item);
      }
    }

    // Gửi thông báo cho các mục mới tìm thấy (xử lý từ cũ đến mới)
    for (const newItem of newItems.reverse()) {
      await sendDiscordEmbed(newItem);
    }

    // Giới hạn kích thước bộ nhớ Set để tránh tràn RAM
    if (processedIds.size > 500) {
      const idsArray = Array.from(processedIds);
      const toRemove = idsArray.slice(0, idsArray.length - 200);
      toRemove.forEach(id => processedIds.delete(id));
    }

  } catch (error) {
    console.error('[API Fetch Error]:', error.message);
  }
}

// Quét API mỗi 5 giây
setInterval(fetchBossApi, 5000);

// Endpoint giữ cho service Render luôn sống (Health Check)
app.get('/', (req, res) => {
  res.send('Boss Monitor Service is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
