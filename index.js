const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

let isBaselineLoaded = false;
const processedIds = new Set();

// Hàm trích xuất Boss và Map tối ưu
function extractInfo(item) {
  const fullText = (item.content || item.title || item.message || item.description || "").trim();

  // 1. Trích xuất Tên Boss
  let bossName = item.bossName || item.boss || item.name || item.boss_name || "";
  if (!bossName && fullText) {
    const bossMatch = fullText.match(/(?:Boss|boss)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+vừa|\s+xuất|\s+tại|\s+ở|\s*-\s*|\s*Map|\n|$)/i) ||
                     fullText.match(/([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)\s+(?:vừa xuất hiện|vừa xuất|xuất hiện)/i);
    if (bossMatch && bossMatch[1]) {
      bossName = bossMatch[1].trim();
    }
  }

  // 2. Trích xuất Tên Map
  let mapName = item.mapName || item.map || item.map_name || item.location || item.zone || item.mapTitle || item.map_title || "";

  if (typeof mapName === 'object' && mapName !== null) {
    mapName = mapName.name || mapName.title || mapName.label || "";
  }

  if ((!mapName || mapName === "Chưa rõ") && fullText) {
    // Bắt từ đứng sau "tại", "ở", "map", "vừa xuất hiện tại/ở"
    const mapMatch = fullText.match(/(?:tại|ở|map)\s+([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+khu|\s+Khu|\s+server|\s+máy chủ|\s+\d+sao|\s*-\s*|\(|\n|$)/i) ||
                     fullText.match(/(?:Map|map)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+khu|\s+Khu|\s+server|\s*-\s*|\(|\n|$)/i);
    
    if (mapMatch && mapMatch[1]) {
      mapName = mapMatch[1].trim();
    } else {
      // Bắt theo từ khóa địa danh NRO nếu các cách trên trượt
      const nroMatch = fullText.match(/(?:Thung lũng|Rừng|Đảo|Thành phố|Đông|Tây|Nam|Bắc|Trạm|Căn cứ|Vực|Tháp|Làng|Hành tinh|Đồi|Nghĩa địa|Rạn ngọc|Đầm lầy|Đỉnh|Hang|Thảo nguyên|Đại ngàn|Vườn)\s+[A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+/i);
      if (nroMatch) {
        mapName = nroMatch[0].trim();
      }
    }
  }

  // Loại bỏ chữ "khu..." nếu lỡ bị dính vào tên Map
  if (mapName) {
    mapName = mapName.replace(/\s+khu\s*\d+.*/i, '').trim();
  }

  if (!bossName) bossName = "Chưa rõ";
  if (!mapName) mapName = "Chưa rõ";

  const serverName = item.server || "15 sao";
  const timeStr = item.time || item.createdAt || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

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
