const express = require('express');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Datastore = require('nedb-promises');
const cors = require('cors');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_15sao_han_ne';
const PORT = process.env.PORT || 3000;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" } 
});

// --- 1. CƠ SỞ DỮ LIỆU TÀI KHOẢN ---
const usersDb = Datastore.create({ filename: './users.db', autoload: true });

async function initAdmin() {
  try {
    const adminExists = await usersDb.findOne({ role: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await usersDb.insert({
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('✅ Đã khởi tạo tài khoản Admin mặc định: admin / admin123');
    }
  } catch (err) {
    console.error('❌ Lỗi khởi tạo Admin:', err.message);
  }
}
initAdmin();

// --- MIDDLEWARE XÁC THỰC JWT CHO API ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Yêu cầu Token xác thực!' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn!' });
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Chỉ Admin mới có quyền thực hiện thao tác này!' });
  }
}

// --- MIDDLEWARE XÁC THỰC JWT CHO SOCKET.IO ---
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) {
    return next(new Error('Authentication error: Missing token'));
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return next(new Error('Authentication error: Invalid token'));
    socket.user = decoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`🟟 App Desktop của [${socket.user.username}] đã kết nối thành công!`);
});

// --- 2. API HỆ THỐNG TÀI KHOẢN & ĐĂNG NHẬP ---

// 2.1. API Đăng nhập
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ thông tin!' });
    }

    const user = await usersDb.findOne({ username });
    if (!user) return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại!' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu không chính xác!' });

    const token = jwt.sign(
      { username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Đăng nhập thành công!',
      token,
      user: { username: user.username, role: user.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// 2.2. API Admin Cấp Tài Khoản Mới
app.post('/api/admin/create-user', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { newUsername, newPassword } = req.body;

    if (!newUsername || !newPassword) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin tài khoản mới!' });
    }

    const existingUser = await usersDb.findOne({ username: newUsername });
    if (existingUser) return res.status(400).json({ success: false, message: 'Tên tài khoản đã tồn tại!' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await usersDb.insert({
      username: newUsername,
      password: hashedPassword,
      role: 'user'
    });

    res.json({ success: true, message: `Đã cấp tài khoản ${newUsername} thành công!` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// 2.3. API Người Dùng Đổi Mật Khẩu
app.post('/api/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const username = req.user.username;

    const user = await usersDb.findOne({ username });
    if (!user) return res.status(400).json({ success: false, message: 'Tài khoản không tồn tại!' });

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu cũ không chính xác!' });

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await usersDb.update({ username }, { $set: { password: hashedNewPassword } });

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi server: ' + err.message });
  }
});

// --- 3. BIẾN QUẢN LÝ DỮ LIỆU BOSS & THÔNG BÁO ---
let isBaselineLoaded = false;
const processedIds = new Set();
const processedMaintenanceIds = new Set();
const processedItemIds = new Set();

let lastNumberFourTime = null;
let lastNumberFourMap = null;
let previousExpectedTimeStr = null;
let currentDelayComment = null;

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

function isAllowedPredictionMap(mapName) {
  if (!mapName) return false;
  const mapLower = mapName.toLowerCase();
  return mapLower.includes('núi khỉ đỏ') || mapLower.includes('hang khỉ đen') || mapLower.includes('núi khỉ đen');
}

function isDivineItem(item) {
  const category = (item.category || item.type || "").toLowerCase();
  const title = (item.title || "").toLowerCase();
  const value = (item.value || "").toLowerCase();
  const equipment = (item.equipment || item.trangbi || "").toLowerCase();
  
  const combined = category + title + value + equipment;
  
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

function parseCustomDate(timeStr) {
  if (!timeStr) return null;
  const date = new Date(timeStr.replace(/-/g, '/'));
  return isNaN(date.getTime()) ? null : date;
}

function formatTimeWithoutDate(timeStr) {
  const date = parseCustomDate(timeStr);
  if (!date) return timeStr ? timeStr.replace(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s*/, '') : "Chưa xác định";

  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function calculatePredictionCustom(numberFourTimeStr, addMinutes) {
  const actualDate = parseCustomDate(numberFourTimeStr);
  if (!actualDate) return null;

  const expectedDate = new Date(actualDate.getTime() + addMinutes * 60 * 1000);
  const h = String(expectedDate.getHours()).padStart(2, '0');
  const m = String(expectedDate.getMinutes()).padStart(2, '0');
  const s = String(expectedDate.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function calculateDelayWithPrevious(newNumberFourTimeStr, oldExpectedTimeStr) {
  try {
    if (!newNumberFourTimeStr || !oldExpectedTimeStr) return null;

    const now = new Date();
    const datePart = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
    const newFormatted = formatTimeWithoutDate(newNumberFourTimeStr);
    
    const realDate = new Date(`${datePart}${newFormatted}`);
    const expectedDate = new Date(`${datePart}${oldExpectedTimeStr}`);

    if (isNaN(realDate.getTime()) || isNaN(expectedDate.getTime())) return null;

    const diffMs = realDate.getTime() - expectedDate.getTime();
    const diffSec = Math.floor(Math.abs(diffMs) / 1000);

    if (diffSec === 0) return "đúng giờ so với dự kiến trước";

    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;

    let timeText = "";
    if (mins > 0 && secs > 0) timeText = `${mins} phút ${secs} giây`;
    else if (mins > 0) timeText = `${mins} phút`;
    else timeText = `${secs} giây`;

    return diffMs > 0 ? `trễ hơn so với dự kiến trước ${timeText}` : `sớm hơn so với dự kiến trước ${timeText}`;
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

  if (isNumberFour(bossName)) {
    lastNumberFourTime = timeStr;
    lastNumberFourMap = mapName;
  }

  return { bossName, mapName, serverName, timeStr };
}

async function sendDiscordEmbed(item) {
  const info = extractInfo(item);
  
  if (!isTargetBoss(info.bossName) || !isAllowedPredictionMap(info.mapName)) return;

  let delayComment = null;
  if (isNumberFour(info.bossName) && previousExpectedTimeStr) {
    delayComment = calculateDelayWithPrevious(info.timeStr, previousExpectedTimeStr);
    currentDelayComment = delayComment;
  }

  // Phát Socket Realtime tới các App kết nối
  io.emit('new-boss', {
    bossName: info.bossName,
    mapName: info.mapName,
    serverName: info.serverName,
    timeStr: info.timeStr,
    timestamp: Date.now(),
    delayComment
  });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (webhookUrl) {
    const fields = [
      { name: "⚔️ Tên Boss", value: `**${info.bossName}**`, inline: true },
      { name: "🟟️ Bản đồ", value: `**${info.mapName}**`, inline: true },
      { name: "🟟️ Máy chủ", value: `**${info.serverName}**`, inline: true },
      { name: "⏰ Thời gian ra", value: `\`${info.timeStr}\``, inline: false }
    ];

    if (delayComment) {
      fields.push({ name: "⏱️ Đánh giá độ trễ", value: `*(${delayComment})*`, inline: false });
    }

    fields.push({ name: "🟟 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false });

    try {
      await axios.post(webhookUrl, {
        username: "Han Ne",
        avatar_url: "https://i.imgur.com/4M34hi2.png",
        embeds: [{
          title: "🟟 BOSS TIỂU ĐỘI SÁT THỦ XUẤT HIỆN! 🟟",
          color: 16724736,
          fields,
          footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️ | Anh Han Bảo Vậy" }
        }]
      });
    } catch (err) {
      console.error("[Discord Error] Lỗi:", err.message);
    }
  }

  if (isCaptain(info.bossName) && lastNumberFourTime && isAllowedPredictionMap(lastNumberFourMap)) {
    const expectedTimeStr = calculatePredictionCustom(lastNumberFourTime, 15);
    const expectedSupportTimeStr = calculatePredictionCustom(lastNumberFourTime, 7.5);
    const formattedNumberFourTime = formatTimeWithoutDate(lastNumberFourTime);
    const predictionMap = lastNumberFourMap || "Không rõ";

    if (expectedTimeStr) {
      previousExpectedTimeStr = expectedTimeStr;

      io.emit('new-prediction', {
        numberFourTime: formattedNumberFourTime,
        mapName: predictionMap,
        expectedTime: expectedTimeStr,
        expectedSupportTime: expectedSupportTimeStr,
        delayComment: currentDelayComment,
        timestamp: Date.now()
      });

      const predictionFields = [
        { name: "🟟 Số 4 xuất hiện", value: `\`${formattedNumberFourTime}\``, inline: true },
        { name: "🟟️ Bản đồ Số 4", value: `**${predictionMap}**`, inline: true },
        { name: "⏰ Dự kiến ra tiếp", value: `**${expectedTimeStr}**`, inline: false },
        { name: "⏰ Dự kiến hỗ trợ", value: `**${expectedSupportTimeStr}**`, inline: false }
      ];

      if (currentDelayComment) {
        predictionFields.push({ name: "⏱️ Đánh giá độ trễ", value: `*(${currentDelayComment})*`, inline: false });
      }

      predictionFields.push({ name: "🟟 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false });

      if (webhookUrl) {
        setTimeout(async () => {
          try {
            await axios.post(webhookUrl, {
              username: "Han Ne",
              avatar_url: "https://i.imgur.com/4M34hi2.png",
              embeds: [{
                title: "⏳ THỜI GIAN DỰ KIẾN VÒNG TIẾP THEO ⏳",
                color: 3447003,
                fields: predictionFields,
                footer: { text: "⚔️ Hệ Thống Dự Kiến 15 Sao ⚔️ | Anh Han Bảo Vậy" }
              }]
            });
          } catch (err) {
            console.error("[Discord Error Prediction] Lỗi:", err.message);
          }
        }, 1000);
      }
    }
  }
}

async function sendMaintenanceWebhook(item) {
  const rawTime = item.time || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const formattedTime = formatTimeWithoutDate(rawTime);
  const contentText = item.value || item.title || "Hệ thống chuẩn bị bảo trì.";
  const serverName = item.server || "15 sao";

  io.emit('new-maintenance', { formattedTime, contentText, serverName });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await axios.post(webhookUrl, {
      username: "millims15",
      avatar_url: "https://i.imgur.com/4M34hi2.png",
      embeds: [{
        title: "🟟️ THÔNG BÁO BẢO TRÌ HỆ THỐNG 🟟️",
        color: 16776960,
        fields: [
          { name: "🟟️ Máy chủ", value: `**${serverName}**`, inline: true },
          { name: "⏰ Thời gian", value: `\`${formattedTime}\``, inline: false },
          { name: "🟟 Nội dung", value: String(contentText), inline: false },
          { name: "🟟 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Boss 15 Sao ⚔️ | Anh Han Bảo Vậy" }
      }]
    });
  } catch (err) {
    console.error("[Discord Error Maintenance] Lỗi:", err.message);
  }
}

async function sendDivineItemWebhook(item) {
  const rawTime = item.time || item.thoiGian || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const player = item.player || item.nguoiChoi || item.name || "Không rõ";
  const equipmentName = item.equipment || item.trangbi || item.value || item.title || "Đồ thần linh";
  const mapName = item.map || item.mapName || "Không rõ";
  const serverName = item.server || "15 sao";

  io.emit('new-divine-item', { player, equipmentName, mapName, serverName, rawTime });

  const webhookUrl = process.env.DISCORD_WEBHOOK_URL_2 || process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await axios.post(webhookUrl, {
      username: "millims15",
      avatar_url: "https://i.imgur.com/4M34hi2.png",
      embeds: [{
        title: "✨ THÔNG BÁO RƠI ĐỒ THẦN LINH ✨",
        color: 65535,
        fields: [
          { name: "🟟️ Máy chủ", value: `**${serverName}**`, inline: true },
          { name: "🟟 Người chơi", value: `**${player}**`, inline: true },
          { name: "🟟️ Trang bị", value: `**${equipmentName}**`, inline: false },
          { name: "🟟️ Bản đồ", value: `**${mapName}**`, inline: false },
          { name: "⏰ Thời gian", value: `\`${rawTime}\``, inline: false },
          { name: "🟟 Hỗ trợ Zalo", value: "Lỗi thông báo liên hệ Zalo **0366 517 900** (Han Đây)", inline: false }
        ],
        footer: { text: "⚔️ Hệ Thống Báo Đồ Thần Linh 15 Sao ⚔️ | Anh Han Bảo Vậy" }
      }]
    });
  } catch (err) {
    console.error("[Discord Error Divine Item] Lỗi:", err.message);
  }
}

function cleanupSet(setInstance, maxSize = 800, keepSize = 400) {
  if (setInstance.size > maxSize) {
    const arr = Array.from(setInstance);
    arr.slice(0, arr.length - keepSize).forEach(id => setInstance.delete(id));
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
          const id = item.id || `${item.bossName || item.title}_${item.time}`;
          processedIds.add(id);

          const category = String(item.category || item.type || "").toLowerCase();
          const contentStr = String(item.value || item.title || "").toLowerCase();
          
          if (category.includes('bảo trì') || contentStr.includes('bảo trì')) {
            const minuteKey = formatTimeWithoutDate(item.time || "");
            processedMaintenanceIds.add(`maint_${item.id || minuteKey}`);
          }
        });
        isBaselineLoaded = true;
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

    cleanupSet(processedIds);
    cleanupSet(processedMaintenanceIds);
    cleanupSet(processedItemIds);

  } catch (error) {
    console.error('[API Fetch Error]:', error.message);
  } finally {
    setTimeout(fetchBossApi, 5000);
  }
}

app.get('/', (req, res) => {
  res.send('Boss & Maintenance & Divine Item Monitor Service is running...');
});

server.listen(PORT, () => {
  console.log("Server đang chạy tại port " + PORT);
  fetchBossApi();
});
