const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

// Hàm kiểm tra xem có phải Boss Tiểu đội sát thủ không
function isTargetBoss(bossName) {
  if (!bossName) return false;
  const nameLower = bossName.toLowerCase();
  const keywords = ['tiểu đội', 'số 4', 'số 3', 'số 2', 'số 1', 'đội trưởng', 'ginyu', 'ricome', 'gourd', 'jeice', 'burter'];
  return keywords.some(kw => nameLower.includes(kw));
}

// Hàm tính toán thời gian tiếp theo
function calculateNextTime(timeStr, addMins, addSecs = 0) {
  try {
    const date = new Date(timeStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) return "Không xác định";

    date.setMinutes(date.getMinutes() + addMins);
    date.setSeconds(date.getSeconds() + addSecs);

    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch (e) {
    return "Không xác định";
  }
}

function extractInfo(item) {
  let bossName = item.bossName || "Chưa rõ";
  let mapName = "Chưa rõ";
  const textValue = item.value || "";
  
  if (textValue) {
    const matchMap = textValue.match(/tại\s+([^,.\n\r]+)/i);
    if (matchMap && matchMap[1]) {
      mapName = matchMap[1].trim();
    }
  }

  const serverName = item.server || "15 sao";
  const timeStr = item.time || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  // Dự kiến lần sau: cộng thêm 15 phút tròn
  const nextSpawnTime = calculateNextTime(timeStr, 15, 0);
  
  // Thời gian hỗ trợ: chỉ cộng thêm 7 phút 30 giây
  const supportSpawnTime = calculateNextTime(timeStr, 7, 30);

  return { bossName, mapName, serverName, timeStr, nextSpawnTime, supportSpawnTime };
}

async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("Chưa cấu hình Webhook URL!");
    return;
  }

  const info = extractInfo(item);

  if (!isTargetBoss(info.bossName)) {
    return;
  }

  const payload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "BOSS TIỂU ĐỘI SÁT THỦ XUẤT HIỆN!",
        color: 15158332,
        fields: [
          { name: "Boss", value: String(info.bossName), inline: true },
          { name: "Map", value: String(info.mapName), inline: true },
          { name: "Máy chủ", value: String(info.serverName), inline: true },
          { name: "Thời gian ra", value: String(info.timeStr), inline: false },
          { name: "Dự kiến lần sau (+15 phút)", value: String(info.nextSpawnTime), inline: false },
          { name: "Thời gian hỗ trợ (+7 phút 30 giây)", value: String(info.supportSpawnTime), inline: false },
          { name: "Hỗ trợ", value: "Lỗi thông báo liên hệ Zalo 0366 517 900 Han Đây", inline: false }
        ],
        footer: { text: "Hệ Thống Báo Boss 15 Sao" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log(`[Discord Send] Đã gửi thông báo Boss: ${info.bossName} | Map: ${info.mapName}`);
  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook:", err.message);
  }
}

async function fetchBossApi() {
  try {
    const response = await axios.get('https://service.dungpham.com.vn/api/thong-bao', {
      params: { server: '15 sao', category: 'BOSS', size: 100, sort: 'id,desc' },
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
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

// Endpoint test nhanh
app.get('/test-boss', async (req, res) => {
  const dummyItem = {
    bossName: "Tiểu đội trưởng",
    value: "BOSS Tiểu đội trưởng vừa xuất hiện tại Hang khỉ đen",
    server: "15 sao",
    time: "2026-09-21 01:50:23"
  };
  await sendDiscordEmbed(dummyItem);
  res.send('Đã gửi tin nhắn test chuẩn xác lên Discord! Kiểm tra lại nhé.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
