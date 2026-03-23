"""
Naki Wreck Route Planner - Flask Backend
Reads Google Sheets via API (works on Render + locally).
"""
import json
import os
import urllib.request
import urllib.parse
from flask import Flask, render_template, jsonify, request

app = Flask(__name__, static_folder='static')

SHEET_ID = "18D6Z6TpjTS9MPXedcF-s4qMMOs_J3b65bj63SRGj5L0"
SHEET_TAB = "Form responses"

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geocache.json")


def load_geocache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_geocache(cache):
    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
    except Exception:
        pass


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/manifest.json")
def manifest_file():
    return app.send_static_file("manifest.json")


@app.route("/icon.png")
def icon_file():
    return app.send_static_file("icon.png")


@app.route("/api/pickups")
def get_pickups():
    """Fetch pickup data from Google Sheets CSV export (no API key needed)."""
    try:
        import csv
        import io

        url = (
            f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"
            f"/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(SHEET_TAB)}"
        )
        resp = urllib.request.urlopen(url, timeout=15)
        text = resp.read().decode("utf-8")
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)

        if len(rows) < 2:
            return jsonify({"pickups": []})

        pickups = []
        for row in rows[1:]:
            while len(row) < 22:
                row.append("")

            date_val = str(row[0]).strip().lower()
            if not date_val or date_val.startswith("next") or date_val.startswith("done"):
                continue

            appliances = []
            for i in range(9, 19):
                val = str(row[i]).strip()
                if val and val.lower() not in ("", "none", "n/a", "0"):
                    appliances.append(val)

            pickups.append({
                "date": row[0],
                "first_name": row[1],
                "last_name": row[2],
                "phone": row[3],
                "email": row[4],
                "street": row[5],
                "town": row[6],
                "area": row[7],
                "rural": row[8],
                "appliances": appliances,
                "additional_info": row[19] if len(row) > 19 else "",
                "total": row[20] if len(row) > 20 else "",
                "submission_id": row[21] if len(row) > 21 else ""
            })

        return jsonify({"pickups": pickups})

    except Exception as e:
        return jsonify({"error": str(e), "pickups": []}), 500


@app.route("/api/geocache", methods=["GET"])
def get_geocache():
    return jsonify(load_geocache())


@app.route("/api/geocache", methods=["POST"])
def update_geocache():
    try:
        new_entries = request.get_json()
        cache = load_geocache()
        cache.update(new_entries)
        save_geocache(cache)
        return jsonify({"status": "ok", "count": len(cache)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/mark-collected", methods=["POST"])
def mark_collected():
    """Mark a pickup as collected — stores in local file, synced back to sheet by local script."""
    try:
        data = request.get_json()
        sub_id = data.get("submission_id", "")
        name = data.get("name", "")

        # Store collected items in a JSON file
        collected_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "collected.json")
        collected = []
        if os.path.exists(collected_file):
            try:
                with open(collected_file, "r") as f:
                    collected = json.load(f)
            except:
                collected = []

        from datetime import datetime
        collected.append({
            "submission_id": sub_id,
            "name": name,
            "collected_at": datetime.now().isoformat()
        })

        with open(collected_file, "w") as f:
            json.dump(collected, f, indent=2)

        return jsonify({"status": "ok", "count": len(collected)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/collected", methods=["GET"])
def get_collected():
    """Get list of collected submission IDs."""
    collected_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "collected.json")
    if os.path.exists(collected_file):
        try:
            with open(collected_file, "r") as f:
                return jsonify(json.load(f))
        except:
            pass
    return jsonify([])


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5555))
    print(f"Naki Wreck Route Planner — http://localhost:{port}")
    app.run(host="0.0.0.0", port=port)
