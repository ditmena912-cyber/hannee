const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();
const processedMaintenanceIds = new Set();

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

// Hàm định dạng thời gian DÀNH RIÊNG CHO BẢO TRÌ: Loại bỏ giây, chỉ giữ lại phút để chống spam
function formatMaintenanceTime(timeStr) {
  try {
    if (!timeStr) return "Chưa xác định";
    const date = new Date(timeStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) {
      return timeStr.replace(/:\d{2}(\s|$)/, '$1');
    }

    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch (e) {
    return timeStr;
  }
}

// Hàm tính toán thời gian cho Boss (Thêm khoảng trắng phân tách ngày và giờ để dễ nhìn)
function calculateNextTime(timeStr, addMins, addSecs = 0) {
  try {
    const date = new Date(timeStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) return "Không xác định";

    date.setMinutes(date.getMinutes() + addMins);
    date.setSeconds(date.getSeconds() + addSecs);

    const pad = (n) => String(n).padStart(2, '0');
    // Thêm khoảng trắng giữa phần ngày và phần giờ (YYYY-MM-DD HH:mm:ss)
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch (e) {
    return "Không xác định";
  }
}

// Hàm tính toán khoảng cách thời gian chênh lệch (giây) giữa thực tế và dự kiến
function getDelayNote(actualTimeStr, expectedTimeStr) {
  try {
    const actual = new Date(actualTimeStr.replace(/-/g, '/'));
    const expected = new Date(expectedTimeStr.replace(/-/g, '/'));

    if (isNaN(actual.getTime()) || isNaN(expected.getTime())) return "";

    const diffMs = actual.getTime() - expected.getTime();
    const diffSecs = Math.round(diffMs / 1000);

    if (diffSecs === 0) return " (Đúng giờ dự kiến)";
    if (diffSecs > 0) {
      return ` ⚠️ *(Boss ra trễ hơn ${diffSecs} giây so với dự kiến)*`;
    } else {
      return ` 🟢 *(Boss ra sớm hơn ${Math.abs(diffSecs)} giây so với dự kiến)*`;
    }
  } catch (e) {
    return "";
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

// Gửi tin nhắn thông báo Boss
async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const info = extractInfo(item);
  if (!isTargetBoss(info.bossName)) return;

  const payload = {
    username: "Han Ne",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "🚨 BOSS TIỂU ĐỘI SÁT THỦ XUẤT HIỆN! 🚨",
        color: 16724736,
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
    console.log(`[Discord Send] Đã gửi thông báo Boss: ${info.bossName}`);

    if (isTeamLeader(info.bossName)) {
      await sendFinalSummaryWebhook(webhookUrl, info.timeStr, info.mapName);
    }
  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook Boss:", err.message);
  }
}

// Gửi tin nhắn tổng kết mốc Số 4 (Có tính toán dự kiến và ghi chú trễ/đúng giờ)
async function sendFinalSummaryWebhook(webhookUrl, currentTime, currentMap) {
  const baseTime = lastNumberFourItem ? lastNumberFourItem.timeStr : currentTime;
  const baseMap = lastNumberFourItem ? lastNumberFourItem.mapName : currentMap;
  const labelNote = lastNumberFourItem ? "🟢 Số 4 ra lúc" : "⚠️ Mốc tham chiếu (Chưa thấy Số 4)";

  // Tính toán các mốc thời gian dự kiến dựa trên mốc Số 4
  const estimatedNext = calculateNextTime(baseTime, 15, 0);      
  const estimatedSupport = calculateNextTime(baseTime, 7, 30);  

  // Tính toán thời gian dự kiến tiếp theo nếu đội trưởng ra thực tế có độ lệch
  // (Ví dụ dựa vào mốc cơ sở tính tiến lên 15 phút để so sánh với thời gian thực tế đội trưởng ra)
  const delayNote = getDelayNote(currentTime, estimatedNext);

  const summaryPayload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "📊 THỐNG KÊ THỜI GIAN TỪ MỐC SỐ 4 📊",
        color: 3447003,
        fields: [
          { name: labelNote, value: `**${baseTime}** tại khu vực **${baseMap}**`, inline: false },
          { name: "🔮 Thời gian dự kiến xuất hiện lần sau", value: `📌 \`${estimatedNext}\` **( + 15 phút )**`, inline: false },
          { name: "⚡ Thời gian thực tế / Chênh lệch", value: `⏰ \`${currentTime}\`${delayNote}`, inline: false },
          { name: "🛡️ Thời gian dự kiến trong giờ hỗ trợ", value: `📌 \`${estimatedSupport}\` **( + 7 phút 30 giây )**`, inline: false },
          { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
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
    console.error("[Discord Error Summary] Lỗi:", err.message);
  }
}

// Gửi tin nhắn thông báo Bảo trì
async function sendMaintenanceWebhook(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const rawTime = item.time || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const formattedTime = formatMaintenanceTime(rawTime);
  const contentText = item.value || item.title || "Hệ thống chuẩn bị bảo trì.";
  const serverName = item.server || "15 sao";

  const maintenancePayload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "🛠️ THÔNG BÁO BẢO TRÌ HỆ THỐNG 🛠️",
        color: 16776960,
        fields: [
          { name: "🌐 Máy chủ", value: `**${serverName}**`, inline: true },
          { name: "⏰ Thời gian", value: `\`${formattedTime}\``, inline: false },
          { name: "📝 Nội dung", value: String(contentText), inline: false },
          { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, maintenancePayload);
    console.log(`[Discord Maintenance] Đã gửi thông báo bảo trì thành công: ${formattedTime}`);
  } catch (err) {
    console.error("[Discord Error Maintenance] Lỗi:", err.message);
  }
}

async function fetchBossApi() {
  try {
    const res = await axios.get('https://service.dungpham.com.vn/api/thong-bao', {
      params: { server: '15 sao', size: 50, sort: 'id,desc' },
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 10000
    });

    const listData = Array.isArray(res.data) ? res.data : (res.data.content || []);
    if (Array.isArray(listData)) {
      if (!isBaselineLoaded) {
        listData.forEach(item => {
          const id = item.id || `${item.bossName || item.title}_${item.time}`;
          processedIds.add(id);

          const category = String(item.category || item.type || "").toLowerCase();
          const contentStr = String(item.value || item.title || "").toLowerCase();
          if (category.includes('bảo trì') || contentStr.includes('bảo trì')) {
            const minuteKey = formatMaintenanceTime(item.time || "");
            processedMaintenanceIds.add(`maint_${item.id || minuteKey}`);
          }

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
        console.log("[System] Đã tải xong dữ liệu gốc (Baseline). Đang chờ thông báo mới...");
      } else {
        const newItems = [];
        for (const item of listData) {
          const id = item.id || `${item.bossName || item.title}_${item.time}`;
          const isServer15 = !item.server || String(item.server).includes('15');
          if (!processedIds.has(id) && isServer15) {
            processedIds.add(id);
            newItems.push(item);
          }
        }

        for (const newItem of newItems.reverse()) {
          const category = String(newItem.category || newItem.type || "").toLowerCase();
          const contentStr = String(newItem.value || newItem.title || "").toLowerCase();
          
          if (category.includes('bảo trì') || contentStr.includes('bảo trì')) {
            const rawTime = newItem.time || "";
            const minuteKey = formatMaintenanceTime(rawTime);
            const maintId = `maint_${newItem.id || minuteKey}`;

            if (!processedMaintenanceIds.has(maintId)) {
              processedMaintenanceIds.add(maintId);
              await sendMaintenanceWebhook(newItem);
            }
          } else {
            await sendDiscordEmbed(newItem);
          }
        }
      }
    }

    if (processedIds.size > 500) {
      const arr = Array.from(processedIds);
      arr.slice(0, arr.length - 200).forEach(id => processedIds.delete(id));
    }

  } catch (error) {
    console.error('[API Fetch Error]:', error.message);
  }
}

setInterval(fetchBossApi, 5000);

app.get('/', (req, res) => {
  res.send('Boss & Maintenance Monitor Service is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
