const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

// Hàm trích xuất thông tin Boss và Map chính xác từ cấu trúc API Dũng Phạm
function extractInfo(item) {
  // 1. Tên Boss
  let bossName = item.bossName || "Chưa rõ";

  // 2. Tên Map (Bóc tách từ chuỗi item.value)
  let mapName = "Chưa rõ";
  const textValue = item.value || "";

  if (textValue) {
    // Regex tìm chữ đứng sau "tại " cho đến hết câu hoặc các từ khóa nối tiếp
    const matchMap = textValue.match(/tại\s+([^,.\n\r]+)/i);
    if (matchMap && matchMap[1]) {
      mapName = matchMap[1].trim();
    }
  }

  // 3. Máy chủ & Thời gian
  const serverName = item.server || "15 sao";
  const timeStr = item.time || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return { bossName, mapName, serverName, timeStr };
}

async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const { bossName, mapName, serverName, timeStr } = extractInfo(item);

  const payload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "BOSS MỚI XUẤT HIỆN!",
        color: 15158332,
        fields: [
          { name: "Boss", value: String(bossName), inline: true },
          { name: "Map", value: String(mapName), inline: true },
          { name: "Máy chủ", value: String(serverName), inline: true },
          { name: "Thời gian", value: String(timeStr), inline: false }
        ],
        footer: { text: "Hệ Thống Báo Boss 15 Sao" }
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const dataList = Array.isArray(response.data) ? response.data : (response.data.content || []);
    if (!Array.isArray(dataList)) return;

    if (!isBaselineLoaded) {
      dataList.forEach(item => {
        const id = item.id || `${item.bossName}_${item.time}`;
        processedIds.add(id);
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Đã thiết lập mốc ban đầu với ${processedIds.size} bản ghi.`);
      return;
    }

    const newItems = [];
    for (const item of dataList) {
      const id = item.id || `${item.bossName}_${item.time}`;
      const isServer15 = !item.server || String(item.server).includes('15');

      if (!processedIds.has(id) && isServer15) {
        processedIds.add(id);
        newItems.push(item);
      }
    }

    for (const newItem of newItems.reverse()) {
      await sendDiscordEmbed(newItem);
    }

    if (processedIds.size > 500) {
      const idsArray = Array.from(processedIds);
      idsArray.slice(0, idsArray.length - 200).forEach(id => processedIds.delete(id));
    }

  } catch (error) {
    console.error('[API Fetch Error]:', error.message);
  }
}

setInterval(fetchBossApi, 5000);

app.get('/', (req, res) => {
  res.send('Boss Monitor Service is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
