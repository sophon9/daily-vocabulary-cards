# Daily Vocabulary Cards

เว็บแอปสำหรับสร้างและพิมพ์บัตรคำศัพท์ภาษาอังกฤษ–ไทย จำนวน 10 ใบต่อกระดาษ A4

## คุณสมบัติ

- แยกคลังคำศัพท์ ป.3–ป.6 จำนวน 400 รายการต่อระดับชั้น
- 12 หมวดคำศัพท์
- สุ่ม 10 คำ หรือเลือกเอง
- เปลี่ยนเฉพาะคำได้
- โหมดสีและประหยัดหมึก
- พิมพ์ A4 แบบ 2 คอลัมน์ × 5 แถว พร้อมเส้นตัด
- ประวัติการพิมพ์แยกเป็นอีกแท็บ
- โหมดไม่ใช้คำที่เคยพิมพ์
- อนุญาตให้นำคำเก่ากลับมาใช้ซ้ำ
- ไม่มีระบบบัญชี
- ประวัติเก็บใน SQLite บนเครื่องเซิร์ฟเวอร์

## ติดตั้งบน Windows

```bat
cd daily-vocabulary-cards
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

เปิดจากเครื่องเซิร์ฟเวอร์:

`http://127.0.0.1:5000`

เปิดจากเครื่องอื่นใน Local Network:

`http://IP-ของเครื่องเซิร์ฟเวอร์:5000`

หา IP บน Windows ด้วย:

```bat
ipconfig
```

หากเข้าไม่ได้ ให้เปิด Windows Firewall สำหรับ TCP port 5000 หรืออนุญาต Python ผ่าน Firewall

## Linux / Raspberry Pi

```bash
cd daily-vocabulary-cards
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

จากนั้นเปิด `http://IP-ของเครื่อง:5000`

## หมายเหตุ

ไฟล์ `history.db` จะถูกสร้างอัตโนมัติเมื่อเปิดแอปครั้งแรก
