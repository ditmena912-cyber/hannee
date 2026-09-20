const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

let lastNumberFourItem = null;

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

// Hàm tính toán thời gian cộng thêm
function calculateNextTime(timeStr, addMins, addSecs = 0) {
  try {
    const date = new Date(timeStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) return "Không xác định";

    date.setMinutes(date.getMinutes() + addMins);
    date.setSeconds(date.getSeconds() + addSecs);

    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    lastNumberFourItem = { bossName, mapName, serverName, timeStr };
  }

  const supportSpawnTime = calculateNextTime(timeStr, 7, 30);

  return { bossName, mapName, serverName, timeStr, supportSpawnTime };
}

// Gửi tin nhắn Embed thông báo Boss (Có icon sinh động, nền màu đỏ cam bắt mắt)
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
        title: "🚨 BOSS TIỂU ĐỘI SÁT THỦ XUẤT HIỆN! 🚨",
        color: 16724736, // Màu đỏ cam nổi bật
        fields: [
          { name: "👹 Tên Boss", value: `**${info.bossName}**`, inline: true },
          { name: "🗺️ Bản đồ", value: `**${info.mapName}**`, inline: true },
          { name: "🌐 Máy chủ", value: `**${info.serverName}**`, inline: true },
          { name: "⏰ Thời gian ra", value: `\`${info.timeStr}\``, inline: false },
          { name: "⚡ Hỗ trợ (+7 phút 30 giây)", value: `\`${info.supportSpawnTime}\``, inline: false },
          { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log(`[Discord Send] Đã gửi thông báo Boss: ${info.bossName} | Map: ${info.mapName}`);

    if (isTeamLeader(info.bossName)) {
      await sendFinalSummaryWebhook(webhookUrl, info.timeStr, info.mapName);
    }

  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook:", err.message);
  }
}

// Gửi tin nhắn tổng kết cuối cùng (Nền màu xanh dương dịu mắt, đầy đủ icon và mốc dự kiến)
async function sendFinalSummaryWebhook(webhookUrl, currentTime, currentMap) {
  const baseTime = lastNumberFourItem ? lastNumberFourItem.timeStr : currentTime;
  const baseMap = lastNumberFourItem ? lastNumberFourItem.mapName : currentMap;
  const labelNote = lastNumberFourItem ? "🟢 Số 4 ra lúc" : "⚠️ Mốc tham chiếu (Chưa thấy Số 4)";

  const estimatedNext = calculateNextTime(baseTime, 15, 0);     // + 15 phút
  const estimatedSupport = calculateNextTime(baseTime, 7, 30);  // + 7 phút 30 giây

  const summaryPayload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "📊 THỐNG KÊ THỜI GIAN TỪ MỐC SỐ 4 📊",
        color: 3447003, // Màu xanh dương chuyên nghiệp
        fields: [
          { 
            name: labelNote, 
            value: `**${baseTime}** tại khu vực **${baseMap}**`, 
            inline: false 
          },
          { 
            name: "🔮 Thời gian dự kiến xuất hiện lần sau", 
            value: `📌 \`${estimatedNext}\` **( + 15 phút )**`, 
            inline: false 
          },
          { 
            name: "🛡️ Thời gian dự kiến trong giờ hỗ trợ", 
            value: `📌 \`${estimatedSupport}\` **( + 7 phút 30 giây )**`, 
            inline: false 
          },
          { 
            name: "📞 Hỗ trợ Zalo", 
            value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", 
            inline: false 
          }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️" }
      }
    ]
  };

  try {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await axios.post(webhookUrl, summaryPayload);
    console.log(`[Discord Summary] Đã gửi tin nhắn tổng kết mốc Số 4.`);
  } catch (err) {
    console.error("[Discord Error Summary] Lỗi khi gửi tin tổng kết:", err.message);
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
          if (!lastNumberFourItem || item.time > lastNumberFourItem.timeStr) {
            let mapName = "Chưa rõ";
            if (item.value) {
              const matchMap = item.value.match(/tại\s+([^,.\n\r]+)/i);
              if (matchMap && matchMap[1]) mapName = matchMap[1].trim();
            }
            lastNumberFourItem = { bossName: item.bossName, mapName, serverName: item.server || "15 sao", timeStr: item.time };
          }
        }
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Thiết lập mốc ban đầu xong. Số 4 gần nhất: ${lastNumberFourItem ? lastNumberFourItem.timeStr : 'Chưa có'}`);
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
  const dummyNum4 = {
    bossName: "Số 4",
    value: "BOSS Số 4 vừa xuất hiện tại Thung lũng",
    server: "15 sao",
    time: "2026-09-21 02:01:30"
  };
  await sendDiscordEmbed(dummyNum4);

  setTimeout(async () => {
    const dummyLeader = {
      bossName: "Tiểu đội trưởng",
      value: "BOSS Tiểu đội trưởng vừa xuất hiện tại Hang khỉ đen",
      server: "15 sao",
      time: "2026-09-21 02:25:00"
    };
    await sendDiscordEmbed(dummyLeader);
  }, 1500);

  res.send('Đã gửi test giao diện mới thành công! Hãy kiểm tra Discord.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
