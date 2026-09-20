const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

// Hàm trích xuất thông tin khớp chuẩn với giao diện Web
function extractInfo(item) {
  // Ưu tiên lấy từ thuộc tính object nếu có
  let bossName = item.bossName || item.boss || item.name || item.boss_name || "";
  let mapName = item.mapName || item.map || item.map_name || item.location || "";

  if (typeof mapName === 'object' && mapName !== null) {
    mapName = mapName.name || mapName.title || "";
  }

  // Trường hợp dữ liệu là chuỗi văn bản (như hiển thị trên Web)
  const fullText = (item.content || item.title || item.message || item.description || "").trim();

  if (fullText) {
    // Bắt dòng "Boss: [Tên Boss]"
    if (!bossName || bossName === "Chưa rõ") {
      const bossMatch = fullText.match(/Boss\s*:\s*([^\n\r]+)/i);
      if (bossMatch && bossMatch[1]) {
        bossName = bossMatch[1].trim();
      }
    }

    // Bắt dòng "Map: [Tên Map]"
    if (!mapName || mapName === "Chưa rõ") {
      const mapMatch = fullText.match(/Map\s*:\s*([^\n\r]+)/i);
      if (mapMatch && mapMatch[1]) {
        mapName = mapMatch[1].trim();
      }
    }
  }

  // Nếu thông báo là dạng chuỗi tự do (VD: "Boss Tiểu đội trưởng vừa xuất hiện tại Hang khỉ đen")
  if ((!bossName || bossName === "Chưa rõ") && fullText) {
    const bMatch = fullText.match(/(?:Boss|boss)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+vừa|\s+xuất|\s+tại|\s+ở|\n|$)/i);
    if (bMatch) bossName = bMatch[1].trim();
  }

  if ((!mapName || mapName === "Chưa rõ") && fullText) {
    const mMatch = fullText.match(/(?:Map|map)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+khu|\s+server|\s+máy chủ|\n|$)/i) ||
                   fullText.match(/(?:tại|ở)\s+([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+khu|\s+server|\s+máy chủ|\n|$)/i);
    if (mMatch) mapName = mMatch[1].trim();
  }

  if (!bossName) bossName = "Chưa rõ";
  if (!mapName) mapName = "Chưa rõ";

  const serverName = item.server || "15 sao";
  const timeStr = item.time || item.createdAt || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return { bossName, mapName, serverName, timeStr };
}

// Hàm gửiEmbed sang Discord
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
        const id = item.id || `${item.bossName || item.title}_${item.time || item.createdAt}`;
        processedIds.add(id);
      });
      isBaselineLoaded = true;
      console.log(`[Baseline] Đã thiết lập mốc ban đầu với ${processedIds.size} bản ghi.`);
      return;
    }

    const newItems = [];
    for (const item of dataList) {
      const id = item.id || `${item.bossName || item.title}_${item.time || item.createdAt}`;
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
