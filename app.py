from flask import Flask, render_template, request, jsonify
from pathlib import Path
import json, sqlite3, random
from datetime import datetime

BASE = Path(__file__).resolve().parent
app = Flask(__name__)
VOCAB = json.loads((BASE / "vocabulary.json").read_text(encoding="utf-8"))

MASTER_WORDS = []
for file_path in sorted((BASE / "data").glob("words_*.json")):
    MASTER_WORDS.extend(json.loads(file_path.read_text(encoding="utf-8")))

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
    return conn

def init_db():
    with db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS print_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            printed_at TEXT NOT NULL,
            grade INTEGER NOT NULL,
            category TEXT NOT NULL,
            words_json TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS printed_words (
            grade INTEGER NOT NULL,
            word_en TEXT NOT NULL,
            printed_at TEXT NOT NULL,
            PRIMARY KEY (grade, word_en)
        )""")

@app.get("/")
def home():
    return render_template("index.html", categories=VOCAB["categories"])

@app.get("/api/words")
def words():
    grade = request.args.get("grade", "3")
    category = request.args.get("category", "all")
    no_repeat = request.args.get("no_repeat", "false").lower() == "true"
    mode = request.args.get("mode", "random")
    limit = min(max(int(request.args.get("limit", 10)), 1), 100)
    pool = list(GRADE_POOLS.get(grade, []))
    if category != "all":
        pool = [w for w in pool if w["category"] == category]
    if no_repeat:
        with db() as conn:
            used = {r["word_en"] for r in conn.execute(
                "SELECT word_en FROM printed_words WHERE grade=?", (int(grade),)
            ).fetchall()}
        pool = [w for w in pool if w["en"] not in used]
    if mode == "random":
        random.shuffle(pool)
        pool = pool[:limit]
    return jsonify({"words": pool, "remaining": len(pool)})

@app.post("/api/print")
def record_print():
    payload = request.get_json(force=True)
    grade = int(payload["grade"])
    category = payload.get("category", "all")
    words = payload.get("words", [])
    now = datetime.now().isoformat(timespec="seconds")
    with db() as conn:
        conn.execute(
            "INSERT INTO print_history(printed_at,grade,category,words_json) VALUES (?,?,?,?)",
            (now, grade, category, json.dumps(words, ensure_ascii=False))
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
            "SELECT id, printed_at, grade, category, words_json FROM print_history ORDER BY id DESC LIMIT 200"
        ).fetchall()
    return jsonify([{
        "id": r["id"], "printed_at": r["printed_at"], "grade": r["grade"],
        "category": r["category"], "words": json.loads(r["words_json"])
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
    app.run(host="0.0.0.0", port=5000, debug=False)
