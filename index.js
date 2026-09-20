// Hàm trích xuất thông tin Boss và Map nâng cao (Đã tối ưu riêng cho NRO)
function extractInfo(item) {
  // Lấy toàn bộ nội dung văn bản từ các trường có thể có của API
  const fullText = (item.content || item.title || item.message || item.description || "").trim();

  // 1. Trích xuất Tên Boss
  let bossName = item.bossName || item.boss || item.name || item.boss_name || "";
  if (!bossName && fullText) {
    const bossMatch = fullText.match(/(?:Boss|boss)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+vừa|\s+xuất|\s+tại|\s+ở|\s*-\s*|\s*Map|\n|$)/i);
    if (bossMatch && bossMatch[1]) {
      bossName = bossMatch[1].trim();
    }
  }

  // 2. Trích xuất Tên Map
  let mapName = item.mapName || item.map || item.map_name || item.location || item.zone || item.mapTitle || item.map_title || "";
  
  if (!mapName && fullText) {
    // Regex 1: Tìm theo cú pháp "Map: X", "tại X", "ở X"
    const mapMatch = fullText.match(/(?:Map|map)\s*[:\s]\s*([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+server|\s+máy chủ|\s+\d+sao|\s*-\s*|\(|\n|$)/i) ||
                     fullText.match(/(?:tại|ở)\s+([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+server|\s+máy chủ|\s+\d+sao|\s*-\s*|\(|\n|$)/i);
    
    if (mapMatch && mapMatch[1]) {
      mapName = mapMatch[1].trim();
    } else {
      // Regex 2 (Dự phòng): Tự nhận diện các từ khóa địa danh NRO phổ biến trong văn bản
      const nroLocationMatch = fullText.match(/(?:Thung lũng|Rừng|Đảo|Thành phố|Đông|Tây|Nam|Bắc|Trạm|Căn cứ|Vực|Tháp|Làng|Hành tinh|Đồi|Nghĩa địa|Rạn ngọc|Đầm lầy|Đỉnh|Hang|Thảo nguyên|Đại ngàn)\s+[A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+/i);
      if (nroLocationMatch) {
        mapName = nroLocationMatch[0].trim();
      }
    }
  }

  // Nếu vẫn không tìm thấy, kiểm tra xem API có gửi object 'map' bên trong không
  if (typeof item.map === 'object' && item.map !== null) {
    mapName = item.map.name || item.map.title || mapName;
  }

  // Chuẩn hóa kết quả hiển thị
  if (!bossName) bossName = "Chưa rõ";
  if (!mapName) mapName = "Chưa rõ";

  const serverName = item.server || "15 sao";
  const timeStr = item.time || item.createdAt || new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  return { bossName, mapName, serverName, timeStr };
}
