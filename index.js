const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

// Biến lưu trữ thời gian xuất hiện gần nhất của Boss "Số 4"
let lastNumberFourTime = null;

// Hàm kiểm tra xem có phải Boss Tiểu đội sát thủ không
function isTargetBoss(bossName) {
  if (!bossName) return false;
  const nameLower = bossName.toLowerCase();
  const keywords = ['tiểu đội', 'số 4', 'số 3', 'số 2', 'số 1', 'đội trưởng', 'ginyu', 'ricome', 'gourd', 'jeice', 'burter'];
  return keywords.some(kw => nameLower.includes(kw));
}

// Hàm kiểm tra xem có phải đích danh Số 4 không
function isNumberFour(bossName) {
  if (!bossName) return false;
  const nameLower = bossName.toLowerCase();
  return nameLower.includes('số 4');
}

// Hàm tính toán thời gian tiếp theo (+15 phút hoặc +7 phút 30 giây)
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

// Hàm tính khoảng cách thời gian (phút, giây) kể từ lúc Số 4 ra đến Boss hiện tại
function calculateTimeSinceNumberFour(currentTimeStr) {
  if (!lastNumberFourTime) return "Chưa có mốc của Số 4";
  try {
    const timeNum4 = new Date(lastNumberFourTime.replace(/-/g, '/')).getTime();
    const timeCurrent = new Date(currentTimeStr.replace(/-/g, '/')).getTime();

    if (isNaN(timeNum4) || isNaN(timeCurrent)) return "Không xác định";

    let diffMs = timeCurrent - timeNum4;
    // Nếu boss hiện tại ra trước Số 4 (do lệch log cũ)
    if (diffMs < 0) return "Trước mốc Số 4 gần nhất";

    let diffSeconds = Math.floor(diffMs / 1000);
    let minutes = Math.floor(diffSeconds / 60);
    let seconds = diffSeconds % 60;

    return `Cách Số 4: ${minutes} phút ${seconds} giây`;
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

  // Nếu đây là Số 4, cập nhật mốc thời gian mới nhất của Số 4
  if (isNumberFour(bossName)) {
    lastNumberFourTime = timeStr;
  }

  // Dự kiến lần sau: cộng thêm 15 phút tròn
  const nextSpawnTime = calculateNextTime(timeStr, 15, 0);
  
  // Thời gian hỗ trợ: chỉ cộng thêm 7 phút 30 giây
  const supportSpawnTime = calculateNextTime(timeStr, 7, 30);

  // Tính số phút/giây kể từ mốc Số 4
  const timeSinceNum4 = calculateTimeSinceNumberFour(timeStr);

  return { bossName, mapName, serverName, timeStr, nextSpawnTime, supportSpawnTime, timeSinceNum4 };
}

async function sendDiscordEmbed(item) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const info = extractInfo(item);

  if (!isTargetBoss(info.bossName)) {
    return;
  }

  const fields = [
    { name: "Boss", value: String(info.bossName), inline: true },
    { name: "Map", value: String(info.mapName), inline: true },
    { name: "Máy chủ", value: String(info.serverName), inline: true },
    { name: "Thời gian ra", value: String(info.timeStr), inline: false },
    { name: "Dự kiến lần sau (+15 phút)", value: String(info.nextSpawnTime), inline: false },
    { name: "Thời gian hỗ trợ (+7 phút 30 giây)", value: String(info.supportSpawnTime), inline: false }
  ];

  // Nếu không phải là Số 4, hiển thị thêm dòng tính khoảng cách thời gian từ Số 4
  if (!isNumberFour(info.bossName)) {
    fields.push({ name: "⏱️ Thời gian so với Số 4", value: String(info.timeSinceNum4), inline: false });
  } else {
    fields.push({ name: "⏱️ Mốc chuẩn", value: "Đây là mốc xuất hiện của Số 4", inline: false });
  }

  fields.push({ name: "Hỗ trợ", value: "Lỗi thông báo liên hệ Zalo 0366 517 900 Han Đây", inline: false });

  const payload = {
    username: "millims15",
    avatar_url: "https://i.imgur.com/4M34hi2.png",
    embeds: [
      {
        title: "BOSS TIỂU ĐỘI SÁT THỦ XUẤT HIỆN!",
        color: 15158332,
        fields: fields,
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
        // Quét sẵn mốc Số 4 trong dữ liệu lịch sử ban đầu nếu có
        if (isNumberFour(item.bossName)) {
          if (!lastNumberFourTime || item.time > lastNumberFourTime) {
            lastNumberFourTime = item.time;
          }
        }
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Đã thiết lập mốc ban đầu. Mốc Số 4 gần nhất: ${lastNumberFourTime || 'Chưa có'}`);
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
  // Test gửi Số 4 trước để lấy mốc
  const dummyNum4 = {
    bossName: "Số 4",
    value: "BOSS Số 4 vừa xuất hiện tại Thung lũng",
    server: "15 sao",
    time: "2026-09-21 01:50:00"
  };
  await sendDiscordEmbed(dummyNum4);

  // Test gửi Boss khác sau 12 phút 30 giây để kiểm tra tính giờ so với Số 4
  setTimeout(async () => {
    const dummyOther = {
      bossName: "Số 3",
    value: "BOSS Số 3 vừa xuất hiện tại Vách đá",
      server: "15 sao",
      time: "2026-09-21 02:02:30"
    };
    await sendDiscordEmbed(dummyOther);
  }, 1000);

  res.send('Đã gửi chuỗi test Số 4 và Số 3 lên Discord! Kiểm tra lại xem thông số chênh lệch thời gian nhé.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server đang chạy tại port ${PORT}`);
  fetchBossApi();
});
