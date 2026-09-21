const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();
const processedMaintenanceIds = new Set();
const processedItemIds = new Set();

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

// Kiểm tra thông tin "Đồ thần linh"
function isDivineItem(item) {
  const text = (item.value || item.title || item.bossName || "").toLowerCase();
  return text.includes('thần linh') || text.includes('đồ thần linh') || text.includes('trang bị thần linh');
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
    return `\({date.getFullYear()}-\){pad(date.getMonth() + 1)}-\({pad(date.getDate())}\){pad(date.getHours())}:${pad(date.getMinutes())}`;
  } catch (e) {
    return timeStr;
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

  return { bossName, mapName, serverName, timeStr };
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
          { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payload);
    console.log(`[Discord Send] Đã gửi thông báo Boss: ${info.bossName}`);
  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook Boss:", err.message);
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

// Gửi tin nhắn thông báo Đồ Thần Linh
async function sendDivineItemWebhook(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_2 || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const rawTime = item.time || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const contentText = item.value || item.title || "Phát hiện rơi Đồ Thần Linh!";
  const serverName = item.server || "15 sao";

  const divinePayload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "✨ THÔNG BÁO RƠI ĐỒ THẦN LINH ✨",
        color: 65535,
        fields: [
          { name: "🌐 Máy chủ", value: `**${serverName}**`, inline: true },
          { name: "⏰ Thời gian", value: `\`${rawTime}\``, inline: false },
          { name: "🎁 Chi tiết", value: String(contentText), inline: false },
          { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Đồ Thần Linh 15 Sao ⚔️" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, divinePayload);
    console.log(`[Discord Divine Item] Đã gửi thông báo Đồ Thần Linh thành công.`);
  } catch (err) {
    console.error("[Discord Error Divine Item] Lỗi:", err.message);
  }
}

async function fetchBossApi() {
  try {
    // Kéo size 100 để lấy dữ liệu sâu trong khoảng 3 tiếng trước
    const res = await axios.get('https://service.dungpham.com.vn/api/thong-bao', {
      params: { server: '15 sao', size: 100, sort: 'id,desc' },
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      timeout: 10000
    });

    const listData = Array.isArray(res.data) ? res.data : (res.data.content || []);
    if (Array.isArray(listData)) {
      if (!isBaselineLoaded) {
        listData.forEach(item => {
          const id = item.id || `\({item.bossName || item.title}_\){item.time}`;
          
          // Đánh dấu boss và bảo trì cũ vào kho đã xử lý để chúng KHÔNG BỊ BẮN LẠI
          processedIds.add(id);

          const category = String(item.category || item.type || "").toLowerCase();
          const contentStr = String(item.value || item.title || "").toLowerCase();
          
          if (category.includes('bảo trì') || contentStr.includes('bảo trì')) {
            const minuteKey = formatMaintenanceTime(item.time || "");
            processedMaintenanceIds.add(`maint_${item.id || minuteKey}`);
          }

          // RIÊNG ĐỒ THẦN LINH: KHÔNG add vào processedItemIds ở lúc baseline khởi động, 
          // để bot tiến hành quét và bắn lại các món đồ thần linh trong 3 tiếng trước sang room mới cho bạn test.
        });
        isBaselineLoaded = true;
        console.log("[System] Đã tải xong dữ liệu gốc. Đồ thần linh cũ sẽ được đẩy lại để test room...");
      } else {
        const newItems = [];
        for (const item of listData) {
          const id = item.id || `\({item.bossName || item.title}_\){item.time}`;
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
          } else if (isDivineItem(newItem)) {
            const divineId = `divine_${newItem.id || newItem.time}`;
            if (!processedItemIds.has(divineId)) {
              processedItemIds.add(divineId);
              await sendDivineItemWebhook(newItem);
            }
          } else {
            await sendDiscordEmbed(newItem);
          }
        }
      }
    }

    if (processedIds.size > 800) {
      const arr = Array.from(processedIds);
      arr.slice(0, arr.length - 400).forEach(id => processedIds.delete(id));
    }

  } catch (error) {
    console.error('[API Fetch Error]:', error.message);
  }
}

setInterval(fetchBossApi, 5000);

app.get('/', (req, res) => {
  res.send('Boss & Maintenance & Divine Item Monitor Service is running...');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
