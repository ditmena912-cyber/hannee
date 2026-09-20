const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

let lastNumberFourTime = null;

// Kiểm tra nhóm Boss Tiểu đội sát thủ
function isTargetBoss(bossName) {
  if (!bossName) return false;
  const nameLower = bossName.toLowerCase();
  const keywords = ['tiểu đội', 'số 4', 'số 3', 'số 2', 'số 1', 'đội trưởng', 'ginyu', 'ricome', 'gourd', 'jeice', 'burter'];
  return keywords.some(kw => nameLower.includes(kw));
}

function isNumberFour(bossName) {
  if (!bossName) return false;
  return bossName.toLowerCase().includes('số 4');
}

function isTeamLeader(bossName) {
  if (!bossName) return false;
  const nameLower = bossName.toLowerCase();
  return nameLower.includes('đội trưởng') || nameLower.includes('ginyu');
}

// Tính toán thời gian cộng thêm (ví dụ cho thời gian hỗ trợ +7 phút 30 giây)
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

// Tính khoảng cách thời gian từ Số 4 tới thời điểm hiện tại (hoặc thời điểm Tiểu đội trưởng ra)
function calculateTimeSinceNumberFour(currentTimeStr) {
  if (!lastNumberFourTime) return "Chưa ghi nhận mốc của Số 4";
  try {
    const timeNum4 = new Date(lastNumberFourTime.replace(/-/g, '/')).getTime();
    const timeCurrent = new Date(currentTimeStr.replace(/-/g, '/')).getTime();

    if (isNaN(timeNum4) || isNaN(timeCurrent)) return "Không xác định";

    let diffMs = timeCurrent - timeNum4;
    if (diffMs < 0) return "Trước mốc Số 4 gần nhất";

    let diffSeconds = Math.floor(diffMs / 1000);
    let minutes = Math.floor(diffSeconds / 60);
    let seconds = diffSeconds % 60;

    return `${minutes} phút ${seconds} giây`;
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

  if (isNumberFour(bossName)) {
    lastNumberFourTime = timeStr;
  }

  // Chỉ tính thời gian hỗ trợ cho thông báo thường
  const supportSpawnTime = calculateNextTime(timeStr, 7, 30);
  
  // Thời gian dự kiến lần sau tính từ mốc Số 4 (dùng cho tin nhắn tổng kết)
  const estimatedNextFromNum4 = lastNumberFourTime ? calculateNextTime(lastNumberFourTime, 15, 0) : "Chưa có mốc Số 4";
  const timeSinceNum4 = calculateTimeSinceNumberFour(timeStr);

  return { bossName, mapName, serverName, timeStr, supportSpawnTime, timeSinceNum4, estimatedNextFromNum4 };
}

// Gửi tin nhắn Embed thông báo Boss (Đã xóa thời gian dự kiến)
async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

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

    // Sau khi báo Tiểu đội trưởng, gửi thêm 1 tin nhắn riêng chứa thời gian tính từ Số 4 và thời gian dự kiến
    if (isTeamLeader(info.bossName)) {
      await sendTimeReportWebhook(webhookUrl, info);
    }

  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook:", err.message);
  }
}

// Gửi tin nhắn riêng biệt tổng kết tính từ Số 4 và có thời gian dự kiến
async function sendTimeReportWebhook(webhookUrl, info) {
  const timeReportPayload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "📊 THỐNG KÊ THỜI GIAN TỪ MỐC SỐ 4",
        color: 3447003, // Xanh dương
        fields: [
          { name: "Mốc xuất phát (Số 4)", value: String(lastNumberFourTime || "Chưa xác định"), inline: false },
          { name: "Thời điểm Tiểu đội trưởng ra", value: String(info.timeStr), inline: false },
          { name: "⏱️ Thời gian trôi qua từ Số 4", value: `**${info.timeSinceNum4}**`, inline: false },
          { name: "🔮 Dự kiến lần sau (từ mốc Số 4 +15 phút)", value: `**${info.estimatedNextFromNum4}**`, inline: false },
          { name: "Hỗ trợ", value: "Lỗi thông báo liên hệ Zalo 0366 517 900 Han Đây", inline: false }
        ],
        footer: { text: "Hệ Thống Báo Boss 15 Sao" }
      }
    ]
  };

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await axios.post(webhookUrl, timeReportPayload);
    console.log(`[Discord Report] Đã gửi tin nhắn tổng kết thời gian từ Số 4.`);
  } catch (err) {
    console.error("[Discord Error Report] Lỗi khi gửi tin tổng kết:", err.message);
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
        if (isNumberFour(item.bossName)) {
          if (!lastNumberFourTime || item.time > lastNumberFourTime) {
            lastNumberFourTime = item.time;
          }
        }
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Thiết lập mốc ban đầu xong. Số 4 gần nhất: ${lastNumberFourTime || 'Chưa có'}`);
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
  // 1. Giả lập Số 4 để lấy mốc thời gian chuẩn
  const dummyNum4 = {
    bossName: "Số 4",
    value: "BOSS Số 4 vừa xuất hiện tại Thung lũng",
    server: "15 sao",
    time: "2026-09-21 01:00:00"
  };
  await sendDiscordEmbed(dummyNum4);

  // 2. Giả lập Tiểu đội trưởng để kích hoạt tin nhắn thống kê riêng kèm thời gian dự kiến tính từ Số 4
  setTimeout(async () => {
    const dummyLeader = {
      bossName: "Tiểu đội trưởng",
      value: "BOSS Tiểu đội trưởng vừa xuất hiện tại Hang khỉ đen",
      server: "15 sao",
      time: "2026-09-21 01:25:30"
    };
    await sendDiscordEmbed(dummyLeader);
  }, 1500);

  res.send('Đã gửi test: Thông báo boss không có thời gian dự kiến, sau đó gửi tin nhắn tổng kết riêng tính từ Số 4 thành công!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
