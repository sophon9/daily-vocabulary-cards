from flask import Flask, render_template, request, jsonify
from pathlib import Path
import eng_to_ipa as ipa
import os
import json, sqlite3, random
from datetime import datetime

BASE = Path(__file__).resolve().parent
app = Flask(__name__)
VOCAB = json.loads((BASE / "vocabulary.json").read_text(encoding="utf-8"))

MASTER_WORDS = []
for file_path in sorted((BASE / "data").glob("words_*.json")):
    MASTER_WORDS.extend(json.loads(file_path.read_text(encoding="utf-8")))

PRONUNCIATION_OVERRIDES = {
    "whiteboard": "ˈwaɪtˌbɔrd",
}


def pronunciation_for(text):
    word = str(text).strip().lower()
    if not word:
        return ""
    if word in PRONUNCIATION_OVERRIDES:
        return PRONUNCIATION_OVERRIDES[word]
    converted = ipa.convert(word)
    return "" if "*" in converted else converted


for word in MASTER_WORDS:
    word["pronunciation"] = pronunciation_for(word["en"])
    word["source"] = "built_in"

GRADE_POOLS = {}
for index, grade in enumerate((3, 4, 5, 6)):
    shift = index * 20
    rotated = MASTER_WORDS[shift:] + MASTER_WORDS[:shift]
    selected = rotated[:400]
    GRADE_POOLS[str(grade)] = sorted(
        selected, key=lambda word: ((len(word["en"]) + index) % 7, word["category"], word["en"])
    )

DB = BASE / "history.db"

def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db():
    with db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS print_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            printed_at TEXT NOT NULL,
            grade INTEGER NOT NULL,
            category TEXT NOT NULL,
            words_json TEXT NOT NULL,
            child_id INTEGER
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS printed_words (
            grade INTEGER NOT NULL,
            word_en TEXT NOT NULL,
            printed_at TEXT NOT NULL,
            PRIMARY KEY (grade, word_en)
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS custom_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            en TEXT NOT NULL COLLATE NOCASE UNIQUE,
            th TEXT NOT NULL,
            pronunciation TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS children (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS remembered_words (
            child_id INTEGER NOT NULL,
            word_key TEXT NOT NULL,
            word_en TEXT NOT NULL,
            word_th TEXT NOT NULL,
            remembered_at TEXT NOT NULL,
            PRIMARY KEY (child_id, word_key),
            FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
        )""")
        history_columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(print_history)").fetchall()
        }
        if "child_id" not in history_columns:
            conn.execute("ALTER TABLE print_history ADD COLUMN child_id INTEGER")
        if conn.execute("SELECT COUNT(*) FROM children").fetchone()[0] == 0:
            now = datetime.now().isoformat(timespec="seconds")
            conn.execute(
                "INSERT INTO children(name,created_at) VALUES (?,?)",
                ("เด็กคนที่ 1", now)
            )

@app.get("/")
def home():
    return render_template("index.html", categories=VOCAB["categories"])

@app.get("/api/words")
def words():
    grade = request.args.get("grade", "3")
    category = request.args.get("category", "all")
    no_repeat = request.args.get("no_repeat", "false").lower() == "true"
    mode = request.args.get("mode", "random")
    child_id = request.args.get("child_id", type=int)
    hide_remembered = request.args.get("hide_remembered", "true").lower() == "true"
    limit = min(max(int(request.args.get("limit", 10)), 1), 100)
    with db() as conn:
        custom_pool = [{
            "id": row["id"], "en": row["en"], "th": row["th"],
            "pronunciation": row["pronunciation"], "category": "custom",
            "source": "custom"
        } for row in conn.execute(
            "SELECT id,en,th,pronunciation FROM custom_words ORDER BY en COLLATE NOCASE"
        ).fetchall()]
    if category == "custom":
        pool = custom_pool
    else:
        pool = list(GRADE_POOLS.get(grade, []))
    if category not in ("all", "custom"):
        pool = [w for w in pool if w["category"] == category]
    elif category == "all":
        pool.extend(custom_pool)
    if no_repeat:
        with db() as conn:
            used = {r["word_en"] for r in conn.execute(
                "SELECT word_en FROM printed_words WHERE grade=?", (int(grade),)
            ).fetchall()}
        pool = [w for w in pool if w["en"] not in used]
    if child_id and hide_remembered:
        with db() as conn:
            remembered = {row["word_key"] for row in conn.execute(
                "SELECT word_key FROM remembered_words WHERE child_id=?", (child_id,)
            ).fetchall()}
        pool = [word for word in pool if word["en"].strip().casefold() not in remembered]
    if mode == "random":
        random.shuffle(pool)
        pool = pool[:limit]
    return jsonify({"words": pool, "remaining": len(pool)})


@app.get("/api/children")
def children():
    with db() as conn:
        rows = conn.execute(
            """SELECT c.id,c.name,c.created_at,COUNT(r.word_key) AS remembered_count
               FROM children c LEFT JOIN remembered_words r ON r.child_id=c.id
               GROUP BY c.id ORDER BY c.id"""
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/children")
def create_child():
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    if not name:
        return jsonify({"error": "กรุณากรอกชื่อเด็ก"}), 400
    if len(name) > 80:
        return jsonify({"error": "ชื่อยาวเกินไป"}), 400
    now = datetime.now().isoformat(timespec="seconds")
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO children(name,created_at) VALUES (?,?)", (name, now)
        )
    return jsonify({"id": cursor.lastrowid, "name": name}), 201


@app.patch("/api/children/<int:child_id>")
def update_child(child_id):
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    if not name or len(name) > 80:
        return jsonify({"error": "กรุณากรอกชื่อไม่เกิน 80 ตัวอักษร"}), 400
    with db() as conn:
        cursor = conn.execute("UPDATE children SET name=? WHERE id=?", (name, child_id))
    if cursor.rowcount == 0:
        return jsonify({"error": "ไม่พบผู้เรียน"}), 404
    return jsonify({"ok": True})


@app.delete("/api/children/<int:child_id>")
def delete_child(child_id):
    with db() as conn:
        if conn.execute("SELECT COUNT(*) FROM children").fetchone()[0] <= 1:
            return jsonify({"error": "ต้องมีผู้เรียนอย่างน้อย 1 คน"}), 400
        cursor = conn.execute("DELETE FROM children WHERE id=?", (child_id,))
    if cursor.rowcount == 0:
        return jsonify({"error": "ไม่พบผู้เรียน"}), 404
    return jsonify({"ok": True})


@app.get("/api/remembered")
def remembered_words():
    child_id = request.args.get("child_id", type=int)
    if not child_id:
        return jsonify({"error": "กรุณาระบุผู้เรียน"}), 400
    with db() as conn:
        rows = conn.execute(
            """SELECT word_en,word_th,remembered_at FROM remembered_words
               WHERE child_id=? ORDER BY remembered_at DESC,word_en COLLATE NOCASE""",
            (child_id,)
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/remembered")
def remember_word():
    payload = request.get_json(silent=True) or {}
    child_id = payload.get("child_id")
    word_en = str(payload.get("word_en", "")).strip()
    word_th = str(payload.get("word_th", "")).strip()
    if not isinstance(child_id, int) or not word_en:
        return jsonify({"error": "ข้อมูลผู้เรียนหรือคำศัพท์ไม่ถูกต้อง"}), 400
    now = datetime.now().isoformat(timespec="seconds")
    with db() as conn:
        if not conn.execute("SELECT 1 FROM children WHERE id=?", (child_id,)).fetchone():
            return jsonify({"error": "ไม่พบผู้เรียน"}), 404
        conn.execute(
            """INSERT INTO remembered_words(child_id,word_key,word_en,word_th,remembered_at)
               VALUES (?,?,?,?,?)
               ON CONFLICT(child_id,word_key) DO UPDATE SET
                 word_en=excluded.word_en,word_th=excluded.word_th,
                 remembered_at=excluded.remembered_at""",
            (child_id, word_en.casefold(), word_en, word_th, now)
        )
    return jsonify({"ok": True})


@app.delete("/api/remembered")
def forget_word():
    payload = request.get_json(silent=True) or {}
    child_id = payload.get("child_id")
    word_en = str(payload.get("word_en", "")).strip()
    if not isinstance(child_id, int) or not word_en:
        return jsonify({"error": "ข้อมูลไม่ถูกต้อง"}), 400
    with db() as conn:
        cursor = conn.execute(
            "DELETE FROM remembered_words WHERE child_id=? AND word_key=?",
            (child_id, word_en.casefold())
        )
    if cursor.rowcount == 0:
        return jsonify({"error": "ไม่พบคำศัพท์"}), 404
    return jsonify({"ok": True})


@app.post("/api/pronunciations")
def pronunciations():
    payload = request.get_json(silent=True) or {}
    requested_words = payload.get("words")
    if not isinstance(requested_words, list):
        return jsonify({"error": "words must be a list"}), 400
    if len(requested_words) > 100:
        return jsonify({"error": "a maximum of 100 words is allowed"}), 400
    if any(not isinstance(word, str) for word in requested_words):
        return jsonify({"error": "every word must be text"}), 400
    return jsonify({
        "pronunciations": [pronunciation_for(word) for word in requested_words]
    })


@app.get("/api/custom-words")
def custom_words():
    with db() as conn:
        rows = conn.execute(
            """SELECT id,en,th,pronunciation,created_at,updated_at
               FROM custom_words ORDER BY en COLLATE NOCASE"""
        ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.post("/api/custom-words")
def save_custom_words():
    payload = request.get_json(silent=True) or {}
    submitted = payload.get("words")
    if not isinstance(submitted, list) or not submitted:
        return jsonify({"error": "กรุณาส่งคำศัพท์อย่างน้อย 1 คำ"}), 400
    if len(submitted) > 500:
        return jsonify({"error": "บันทึกได้สูงสุดครั้งละ 500 คำ"}), 400

    cleaned = []
    for index, word in enumerate(submitted, start=1):
        if not isinstance(word, dict):
            return jsonify({"error": f"ข้อมูลแถวที่ {index} ไม่ถูกต้อง"}), 400
        en = str(word.get("en", "")).strip()
        th = str(word.get("th", "")).strip()
        pronunciation = str(word.get("pronunciation", "")).strip().strip("/")
        if not en or not th:
            return jsonify({"error": f"แถวที่ {index} ต้องมีคำอังกฤษและคำแปลไทย"}), 400
        if len(en) > 100 or len(th) > 200 or len(pronunciation) > 200:
            return jsonify({"error": f"ข้อความในแถวที่ {index} ยาวเกินไป"}), 400
        pronunciation = pronunciation or pronunciation_for(en)
        if not pronunciation:
            return jsonify({
                "error": f"ไม่พบคำอ่านของ {en} กรุณากรอกคำอ่านเอง",
                "row": index,
            }), 400
        cleaned.append((en, th, pronunciation))

    now = datetime.now().isoformat(timespec="seconds")
    with db() as conn:
        for en, th, pronunciation in cleaned:
            conn.execute(
                """INSERT INTO custom_words(en,th,pronunciation,created_at,updated_at)
                   VALUES (?,?,?,?,?)
                   ON CONFLICT(en) DO UPDATE SET
                     th=excluded.th,
                     pronunciation=excluded.pronunciation,
                     updated_at=excluded.updated_at""",
                (en, th, pronunciation, now, now)
            )
    return jsonify({"ok": True, "saved": len(cleaned)})


@app.delete("/api/custom-words/<int:word_id>")
def delete_custom_word(word_id):
    with db() as conn:
        cursor = conn.execute("DELETE FROM custom_words WHERE id=?", (word_id,))
    if cursor.rowcount == 0:
        return jsonify({"error": "ไม่พบคำศัพท์"}), 404
    return jsonify({"ok": True})

@app.post("/api/print")
def record_print():
    payload = request.get_json(force=True)
    grade = int(payload["grade"])
    category = payload.get("category", "all")
    child_id = payload.get("child_id")
    words = payload.get("words", [])
    now = datetime.now().isoformat(timespec="seconds")
    with db() as conn:
        conn.execute(
            """INSERT INTO print_history
               (printed_at,grade,category,words_json,child_id) VALUES (?,?,?,?,?)""",
            (now, grade, category, json.dumps(words, ensure_ascii=False), child_id)
        )
        for w in words:
            conn.execute(
                "INSERT OR REPLACE INTO printed_words(grade,word_en,printed_at) VALUES (?,?,?)",
                (grade, w["en"], now)
            )
    return jsonify({"ok": True})

@app.get("/api/history")
def history():
    with db() as conn:
        rows = conn.execute(
            """SELECT h.id,h.printed_at,h.grade,h.category,h.words_json,
                      h.child_id,c.name AS child_name
               FROM print_history h LEFT JOIN children c ON c.id=h.child_id
               ORDER BY h.id DESC LIMIT 200"""
        ).fetchall()
    return jsonify([{
        "id": r["id"], "printed_at": r["printed_at"], "grade": r["grade"],
        "category": r["category"], "child_id": r["child_id"],
        "child_name": r["child_name"], "words": json.loads(r["words_json"])
    } for r in rows])

@app.delete("/api/history")
def clear_history():
    with db() as conn:
        conn.execute("DELETE FROM print_history")
        conn.execute("DELETE FROM printed_words")
    return jsonify({"ok": True})

@app.post("/api/reuse")
def reuse_words():
    payload = request.get_json(force=True)
    grade = int(payload["grade"])
    with db() as conn:
        for word in payload.get("words", []):
            conn.execute("DELETE FROM printed_words WHERE grade=? AND word_en=?", (grade, word))
    return jsonify({"ok": True})

if __name__ == "__main__":
    init_db()
    app.run(
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "5000")),
        debug=False,
    )
