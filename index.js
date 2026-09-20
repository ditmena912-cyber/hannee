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

// Hàm tính toán thời gian tiếp theo (Cộng 15 phút, tùy chọn cộng thêm 7 phút 30 giây)
function calculateNextTime(timeStr, isSupport = false) {
  try {
    // timeStr thường có dạng "2026-09-21 01:50:23" hoặc tương tự
    const date = new Date(timeStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) return "Không xác định";

    // Mặc định cộng 15 phút tròn
    let addMinutes = 15;
    let addSeconds = 0;

    // Nếu là thời gian hỗ trợ: cộng thêm 7 phút 30 giây
    if (isSupport) {
      addMinutes += 7;
      addSeconds += 30;
    }

    date.setMinutes(date.getMinutes() + addMinutes);
    date.setSeconds(date.getSeconds() + addSeconds);

    // Format lại thành YYYY-MM-DD HH:mm:ss
    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return "Không xác định";
  }
}

// Hàm trích xuất thông tin Boss, Map và Thời gian
function extractInfo(item) {
  let bossName = item.bossName || "Chưa rõ";

  // Bóc tách Tên Map từ item.value
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

  // Tính thời gian lần tiếp theo (+15 phút)
  const nextSpawnTime = calculateNextTime(timeStr, false);
  const nextSupportSpawnTime = calculateNextTime(timeStr, true); // Trường hợp tính thêm 7 phút 30 giây hỗ trợ

  return { bossName, mapName, serverName, timeStr, nextSpawnTime, nextSupportSpawnTime };
}

async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const info = extractInfo(item);

  // Chỉ gửi nếu đúng là Boss Tiểu đội sát thủ theo yêu cầu
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
          { name: "Thời gian hỗ trợ (+22 phút 30 giây)", value: String(info.nextSupportSpawnTime), inline: false }
        ],
        footer: { text: "Hệ Thống Báo Boss 15 Sao" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log(`[Discord] Đã gửi thông báo Boss: ${info.bossName} | Map: ${info.mapName}`);
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
