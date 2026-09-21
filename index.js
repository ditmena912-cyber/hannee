const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();
const processedMaintenanceIds = new Set();
const processedItemIds = new Set();

// Biến lưu trữ thông tin thời gian của Số 4 gần nhất trong vòng hiện tại
let lastNumberFourTime = null;

// Biến lưu trữ thời gian dự kiến của vòng TRƯỚC (dạng chuỗi giờ:phút:giây hoặc timestamp) để so sánh độ trễ cho vòng sau
let previousExpectedTimeStr = null;

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

function isCaptain(bossName) {
  if (!bossName) return false;
  const nameLower = bossName.toLowerCase();
  return nameLower.includes('đội trưởng') || nameLower.includes('ginyu') || nameLower.includes('số 1');
}

// Kiểm tra thông tin "Đồ thần linh"
function isDivineItem(item) {
  const category = (item.category || item.type || "").toLowerCase();
  const title = (item.title || "").toLowerCase();
  const value = (item.value || "").toLowerCase();
  const equipment = (item.equipment || item.trangbi || "").toLowerCase();
  
  const combined = `\({category}\){title} \({value}\){equipment}`;
  
  return (
    combined.includes('thần linh') || 
    combined.includes('đồ thần linh') || 
    combined.includes('trang bị thần linh') ||
    combined.includes('thần xayda') ||
    combined.includes('thần trái đất') ||
    combined.includes('thần namếc') ||
    combined.includes('quần thần') ||
    combined.includes('áo thần') ||
    combined.includes('găng thần') ||
    combined.includes('giày thần') ||
    combined.includes('nhẫn thần')
  );
}

// Hàm định dạng thời gian bỏ ngày tháng, chỉ giữ giờ:phút:giây
function formatTimeWithoutDate(timeStr) {
  try {
    if (!timeStr) return "Chưa xác định";
    const date = new Date(timeStr.replace(/-/g, '/'));
    if (isNaN(date.getTime())) {
      return timeStr.replace(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*/, '');
    }

    const pad = (n) => String(n).padStart(2, '0');
    return `\({pad(date.getHours())}:\){pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch (e) {
    return timeStr;
  }
}

// Tính thời gian dự kiến (Cộng thêm 15 phút từ mốc Số 4)
function calculatePrediction(numberFourTimeStr) {
  try {
    if (!numberFourTimeStr) return null;
    const actualDate = new Date(numberFourTimeStr.replace(/-/g, '/'));
    if (isNaN(actualDate.getTime())) return null;

    const expectedDate = new Date(actualDate.getTime() + 15 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `\({pad(expectedDate.getHours())}:\){pad(expectedDate.getMinutes())}:${pad(expectedDate.getSeconds())}`;
  } catch (e) {
    return null;
  }
}

// Hàm so sánh thời gian thực tế xuất hiện của Số 4 đợt mới với dự kiến cũ
function calculateDelayWithPrevious(newNumberFourTimeStr, oldExpectedTimeStr) {
  try {
    if (!newNumberFourTimeStr || !oldExpectedTimeStr) return null;

    // Lấy ngày hiện tại ghép với giờ:phút:giây của thời gian thực tế mới và dự kiến cũ để quy đổi ra đối tượng Date so sánh
    const now = new Date();
    const datePart = `\({now.getFullYear()}/\){String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    
    // Tách lấy phần giờ:phút:giây chuẩn từ chuỗi thời gian thực tế mới
    const newFormatted = formatTimeWithoutDate(newNumberFourTimeStr);
    
    const realDate = new Date(`\({datePart}\){newFormatted}`);
    const expectedDate = new Date(`\({datePart}\){oldExpectedTimeStr}`);

    if (isNaN(realDate.getTime()) || isNaN(expectedDate.getTime())) return null;

    const diffMs = realDate.getTime() - expectedDate.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);

    if (diffSec === 0) return "đúng giờ so với dự kiến trước";

    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;

    let timeText = "";
    if (mins > 0 && secs > 0) timeText = `\({mins} phút\){secs} giây`;
    else if (mins > 0) timeText = `${mins} phút`;
    else timeText = `${secs} giây`;

    if (diffMs > 0) {
      return `trễ hơn so với dự kiến trước ${timeText}`;
    } else {
      return `sớm hơn so với dự kiến trước ${timeText}`;
    }
  } catch (e) {
    return null;
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

  // Ghi nhận mốc Số 4
  if (isNumberFour(bossName)) {
    lastNumberFourTime = timeStr;
    console.log(`[Tracker] Đã ghi nhận mốc thời gian của Số 4: ${timeStr}`);
  }

  return { bossName, mapName, serverName, timeStr };
}

// Gửi tin nhắn thông báo Boss
async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const info = extractInfo(item);
  if (!isTargetBoss(info.bossName)) return;

  // Kiểm tra nếu con Boss này là "Số 4" và trước đó chúng ta đã có một mốc dự kiến cũ
  let delayComment = null;
  if (isNumberFour(info.bossName) && previousExpectedTimeStr) {
    delayComment = calculateDelayWithPrevious(info.timeStr, previousExpectedTimeStr);
  }

  // Tạo các fields thông báo Boss ra
  const fields = [
    { name: "👹 Tên Boss", value: `**${info.bossName}**`, inline: true },
    { name: "🗺️ Bản đồ", value: `**${info.mapName}**`, inline: true },
    { name: "🌐 Máy chủ", value: `**${info.serverName}**`, inline: true },
    { name: "⏰ Thời gian ra", value: `\`${info.timeStr}\``, inline: false }
  ];

  // Nếu có chú thích độ trễ so với dự kiến trước, gắn trực tiếp vào thông báo Boss Số 4 xuất hiện
  if (delayComment) {
    fields.push({ name: "📊 Đánh giá độ trễ", value: `*(${delayComment})*`, inline: false });
  }

  fields.push({ name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false });

  const payloadBoss = {
    username: "Han Ne",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "🚨 BOSS TIỂU ĐỘI SÁT THỦ XUẤT HIỆN! 🚨",
        color: 16724736,
        fields: fields,
        footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️" }
      }
    ]
  };

  try {
    await axios.post(webhookUrl, payloadBoss);
    console.log(`[Discord Send] Đã gửi thông báo Boss: ${info.bossName}`);
  } catch (err) {
    console.error("[Discord Error] Lỗi khi gửi webhook Boss:", err.message);
  }

  // Khi Đội trưởng xuất hiện: Tính toán thời gian dự kiến vòng tiếp theo và lưu lại vào `previousExpectedTimeStr`
  if (isCaptain(info.bossName)) {
    if (lastNumberFourTime) {
      const expectedTimeStr = calculatePrediction(lastNumberFourTime);
      const formattedNumberFourTime = formatTimeWithoutDate(lastNumberFourTime);

      if (expectedTimeStr) {
        // Lưu lại mốc dự kiến này để dùng so sánh cho Số 4 của vòng kế tiếp
        previousExpectedTimeStr = expectedTimeStr;

        const payloadPrediction = {
          username: "Han Ne",
          avatar_url: "https://i.imgur.com/4M34hi2.png",
          embeds: [
            {
              title: "⏳ THỜI GIAN DỰ KIẾN VÒNG TIẾP THEO ⏳",
              color: 3447003,
              fields: [
                { name: "📌 Số 4 xuất hiện", value: `\`${formattedNumberFourTime}\``, inline: true },
                { name: "⏰ Dự kiến ra tiếp", value: `**${expectedTimeStr}**`, inline: true },
                { name: "📞 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
              ],
              footer: { text: "⚔️ Hệ Thống Dự Kiến 15 Sao ⚔️" }
            }
          ]
        };

        setTimeout(async () => {
          try {
            await axios.post(webhookUrl, payloadPrediction);
            console.log(`[Discord Prediction] Đã gửi tin nhắn dự kiến (Đã lưu mốc: ${expectedTimeStr}) thành công.`);
          } catch (err) {
            console.error("[Discord Error Prediction] Lỗi:", err.message);
          }
        }, 1000);
      }
    } else {
      console.log(`[Discord Prediction Warning] Đội trưởng ra nhưng chưa tìm thấy mốc thời gian của Số 4.`);
    }
  }
}

// Gửi tin nhắn thông báo Bảo trì
async function sendMaintenanceWebhook(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const rawTime = item.time || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const formattedTime = formatTimeWithoutDate(rawTime);
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

  const rawTime = item.time || item.thoiGian || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const player = item.player || item.nguoiChoi || item.name || "Không rõ";
  const equipmentName = item.equipment || item.trangbi || item.value || item.title || "Đồ thần linh";
  const mapName = item.map || item.mapName || "Không rõ";
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
          { name: "👤 Người chơi", value: `**${player}**`, inline: true },
          { name: "🎁 Trang bị", value: `**${equipmentName}**`, inline: false },
          { name: "🗺️ Bản đồ", value: `**${mapName}**`, inline: false },
          { name: "⏰ Thời gian", value: `\`${rawTime}\``, inline: false },
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
          processedIds.add(id);

          const category = String(item.category || item.type || "").toLowerCase();
          const contentStr = String(item.value || item.title || "").toLowerCase();
          
          if (category.includes('bảo trì') || contentStr.includes('bảo trì')) {
            const minuteKey = formatTimeWithoutDate(item.time || "");
            processedMaintenanceIds.add(`maint_${item.id || minuteKey}`);
          }
        });
        isBaselineLoaded = true;
        console.log("[System] Đã tải xong dữ liệu gốc.");
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
            const minuteKey = formatTimeWithoutDate(rawTime);
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
