const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Biến lưu trạng thái baseline & các thông báo đã xử lý
let isBaselineLoaded = false;
const processedIds = new Set();

// Hàm trích xuất thông tin Boss và Map từ dữ liệu API
function extractInfo(item) {
  const fullText = item.content || item.title || item.message || item.description || "";

  // 1. Trích xuất Tên Boss từ các key API hoặc bóc tách Regex
  let bossName = item.bossName || item.boss || item.name || item.boss_name || "";
  if (!bossName && fullText) {
    const bossMatch = fullText.match(/(?:Boss|boss)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+vừa|\s+xuất|\s+tại|\s+ở|\s*-\s*|\s*Map|\n|$)/i);
    if (bossMatch && bossMatch[1]) {
      bossName = bossMatch[1].trim();
    }
  }

  // 2. Trích xuất Tên Map từ các key API hoặc bóc tách Regex
  let mapName = item.mapName || item.map || item.map_name || item.location || item.zone || item.mapTitle || "";
  if (!mapName && fullText) {
    const mapMatch = fullText.match(/(?:Map|map)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+server|\s+máy chủ|\s+\d+sao|\s*-\s*|\(|\n|$)/i) ||
                     fullText.match(/(?:tại|ở)\s+([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+server|\s+máy chủ|\s+\d+sao|\s*-\s*|\(|\n|$)/i);
    if (mapMatch && mapMatch[1]) {
      mapName = mapMatch[1].trim();
    }
  }

  // Chuẩn hóa giá trị hiển thị
  if (!bossName) bossName = "Chưa rõ";
  if (!mapName) mapName = "Chưa rõ";

  const serverName = item.server || "15 sao";
  const timeStr = item.time || item.createdAt || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return { bossName, mapName, serverName, timeStr };
}

// Hàm gửi Embed sang Discord Webhook
async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("Chưa cấu hình DISCORD_WEBHOOK_URL trong Environment Variables!");
    return;
  }

  const { bossName, mapName, serverName, timeStr } = extractInfo(item);

  const payload = {
    username: "millims15", // Đã đổi tên bot
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
        footer: { text: "Hệ Thống Báo Boss 15 Sao" } // Đã đổi nguồn
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log(`[Discord] Đã gửi thông báo Boss: ${bossName} | Map: ${mapName}`);
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

    // Lần đầu tiên chạy: Tạo baseline từ danh sách cũ để tránh spam dồn
    if (!isBaselineLoaded) {
      dataList.forEach(item => {
        const id = item.id || `${item.bossName || item.title}_${item.time || item.createdAt}`;
        processedIds.add(id);
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Đã thiết lập mốc ban đầu với ${processedIds.size} bản ghi.`);
      return;
    }

    // Lọc ra các thông báo MỚI
    const newItems = [];
    for (const item of dataList) {
      const id = item.id || `${item.bossName || item.title}_${item.time || item.createdAt}`;

      const isServer15 = !item.server || String(item.server).includes('15');
      if (!processedIds.has(id) && isServer15) {
        processedIds.add(id);
        newItems.push(item);
      }
    }

    // Gửi thông báo cho các mục mới (xử lý từ cũ đến mới)
    for (const newItem of newItems.reverse()) {
      await sendDiscordEmbed(newItem);
    }

    // Giới hạn bộ nhớ lưu trữ
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

// Endpoint Health Check giữ Render luôn hoạt động
app.get('/', (req, res) => {
  res.send('Boss Monitor Service is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
