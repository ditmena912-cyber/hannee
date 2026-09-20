import time
import re
import requests
from datetime import datetime

# Thay URL Webhook của bạn vào đây:
DISCORD_WEBHOOK_URL = "YOUR_WEBHOOK_URL_HERE"
API_URL = "https://service.dungpham.com.vn/api/thong-bao"

# Bộ nhớ lưu các ID đã xử lý để tránh spam lặp lại
processed_ids = set()
is_baseline_loaded = False

def extract_info(item):
    """
    Trích xuất tên Boss và Map từ các thuộc tính API hoặc bóc tách Regex từ chuỗi nội dung.
    """
    full_text = item.get("content") or item.get("title") or item.get("message") or ""
    
    # 1. Trích xuất Tên Boss
    boss_name = item.get("bossName") or item.get("boss") or item.get("name") or ""
    if not boss_name and full_text:
        # Tìm Boss từ chuỗi (ví dụ: "Boss Số 2 vừa xuất hiện..." hoặc "Boss: Tiểu đội trưởng")
        boss_match = re.search(r'(?:Boss|boss)\s*:\s*([^.\n]+?)(?=\s*-\s*|\s*Map|\s*tại|\s*vừa|\s*xuất|\n|$)', full_text, re.IGNORECASE) or \
                     re.search(r'(?:Boss|boss)\s+([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+vừa|\s+xuất|\s+tại|\s+ở|$)', full_text, re.IGNORECASE)
        if boss_match:
            boss_name = boss_match.group(1).strip()
            
    # 2. Trích xuất Tên Map (Bóc tách chi tiết tránh trượt)
    map_name = item.get("mapName") or item.get("map") or item.get("map_name") or item.get("location") or item.get("zone") or ""
    if not map_name and full_text:
        # Tìm Map từ chuỗi (ví dụ: "tại Đảo Kame" hoặc "Map: Namếch")
        map_match = re.search(r'(?:Map|map)\s*:\s*([^.\n]+?)(?=\s*-\s*|\s*Thời gian|\s*Server|\s*máy chủ|\n|$)', full_text, re.IGNORECASE) or \
                    re.search(r'(?:tại|ở|map)\s+([A-Za-z0-9\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]+?)(?=\s+server|\s+máy chủ|\s+\d+sao|\s*-\s*|\(|\n|$)', full_text, re.IGNORECASE)
        if map_match:
            map_name = map_match.group(1).strip()
            
    # Chuẩn hóa giá trị hiển thị
    if not boss_name:
        boss_name = "Chưa rõ"
    if not map_name:
        map_name = "Chưa rõ"
        
    server_name = item.get("server") or "15 sao"
    spawn_time = item.get("time") or item.get("createdAt") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    return {
        "boss": boss_name,
        "map": map_name,
        "server": server_name,
        "time": spawn_time
    }

def send_to_discord(data):
    """
    Gửi thông báo dạng Embed lên Discord Webhook
    """
    payload = {
        "username": "millims15", # Tên Bot đã đổi
        "avatar_url": "https://i.imgur.com/4M34hi2.png",
        "embeds": [
            {
                "title": "BOSS MỚI XUẤT HIỆN!",
                "color": 15158332, # Màu đỏ
                "fields": [
                    {"name": "Boss", "value": str(data["boss"]), "inline": True},
                    {"name": "Map", "value": str(data["map"]), "inline": True},
                    {"name": "Máy chủ", "value": str(data["server"]), "inline": True},
                    {"name": "Thời gian", "value": str(data["time"]), "inline": False}
                ],
                "footer": {"text": "Hệ Thống Báo Boss 15 Sao"} # Nguồn đã đổi
            }
        ]
    }
    
    try:
        res = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        if res.status_code == 204:
            print(f"[THÀNH CÔNG] Đã gửi Boss: {data['boss']} | Map: {data['map']}")
        else:
            print(f"[LỖI DISCORD] Mã phản hồi: {res.status_code}")
    except Exception as e:
        print(f"[LỖI GỬI WEBHOOK]: {e}")

def fetch_boss_api():
    global is_baseline_loaded
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    params = {
        "server": "15 sao",
        "category": "BOSS",
        "size": 100,
        "sort": "id,desc"
    }
    
    try:
        response = requests.get(API_URL, headers=headers, params=params, timeout=10)
        if response.status_code != 200:
            print(f"[LỖI API] Mã lỗi HTTP: {response.status_code}")
            return

        res_json = response.json()
        data_list = res_json if isinstance(res_json, list) else res_json.get("content", [])

        if not isinstance(data_list, list):
            return

        # Thiết lập Baseline ban đầu khi mới bật code để tránh dồn tin nhắn cũ
        if not is_baseline_loaded:
            for item in data_list:
                item_id = item.get("id") or f"{item.get('bossName') or item.get('title')}_{item.get('time')}"
                processed_ids.add(item_id)
            is_baseline_loaded = True
            print(f"[BASELINE] Khởi tạo mốc ban đầu với {len(processed_ids)} thông báo cũ.")
            return

        # Quét và lọc thông báo mới
        new_items = []
        for item in data_list:
            item_id = item.get("id") or f"{item.get('bossName') or item.get('title')}_{item.get('time')}"
            
            # Lọc đúng máy chủ 15 sao
            server_str = str(item.get("server", ""))
            is_server_15 = not server_str or "15" in server_str

            if item_id not in processed_ids and is_server_15:
                processed_ids.add(item_id)
                new_items.append(item)

        # Gửi thông báo từ cũ đến mới
        for item in reversed(new_items):
            info = extract_info(item)
            send_to_discord(info)

        # Dọn dẹp tập hợp bộ nhớ tránh tràn RAM khi chạy lâu
        if len(processed_ids) > 500:
            ids_list = list(processed_ids)
            for old_id in ids_list[:-200]:
                processed_ids.remove(old_id)

    except Exception as e:
        print(f"[LỖI LẤY DỮ LIỆU API]: {e}")

print("--- Đang khởi chạy Bot theo dõi Boss 15 Sao (millims15) ---")

while True:
    fetch_boss_api()
    time.sleep(5)
