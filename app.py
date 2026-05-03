"""
Naki Wreck Ops HQ - Flask backend.
Reads Google Sheets via CSV export and serves the local operations console.
"""
import json
import os
import urllib.request
import urllib.parse
from flask import Flask, render_template, jsonify, request, redirect, session, url_for

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get("SECRET_KEY", "local-dev-secret-change-on-host")

SHEET_ID = "18D6Z6TpjTS9MPXedcF-s4qMMOs_J3b65bj63SRGj5L0"
SHEET_TAB = "Form responses"

CACHE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geocache.json")
SAMPLE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sample-pickups.json")


def app_pin():
    return os.environ.get("APP_PIN", "").strip()


@app.before_request
def require_pin():
    """Protect hosted customer data when APP_PIN is configured."""
    if not app_pin():
        return None
    endpoint = request.endpoint or ""
    if endpoint in ("login", "static", "manifest_file", "icon_file", "service_worker", "health"):
        return None
    if session.get("authed"):
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "Passcode required"}), 401
    return redirect(url_for("login", next=request.path))


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


@app.route("/login", methods=["GET", "POST"])
def login():
    error = ""
    if request.method == "POST":
        if request.form.get("pin", "").strip() == app_pin():
            session["authed"] = True
            return redirect(request.args.get("next") or url_for("index"))
        error = "Wrong passcode"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/classic")
def classic():
    return render_template("legacy.html")


@app.route("/manifest.json")
def manifest_file():
    return app.send_static_file("manifest.json")


@app.route("/icon.png")
def icon_file():
    return app.send_static_file("icon.png")


@app.route("/sw.js")
def service_worker():
    return app.send_static_file("sw.js")


@app.route("/api/pickups")
def get_pickups():
    """Fetch pickup data from Google Sheets CSV export (no API key needed)."""
    if request.args.get("sample") == "1":
        return sample_pickups()

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
            while len(row) < 25:
                row.append("")

            # Skip section markers ("Next pickup day", "Done") that some users
            # write into the date column as headings between groups.
            date_val = str(row[0]).strip().lower()
            if date_val.startswith("next") or date_val.startswith("done"):
                continue

            # Skip rows that have no real customer info. A row with at least a
            # name or a street is a real pickup, even if Date column is blank
            # (happens when Woody adds a stop manually without a timestamp).
            name_val = (str(row[1]).strip() + " " + str(row[2]).strip()).strip()
            street_val = str(row[5]).strip()
            if not name_val and not street_val:
                continue

            # Skip collected/done items
            status = str(row[22]).strip().upper() if len(row) > 22 else ""
            if status == "DONE":
                continue

            appliances = []
            for i in range(9, 19):
                val = str(row[i]).strip()
                if val and val.lower() not in ("", "none", "n/a", "0"):
                    appliances.append(val)

            # Read pre-cached lat/lng from columns X,Y (indices 23,24)
            lat = str(row[23]).strip() if len(row) > 23 else ""
            lng = str(row[24]).strip() if len(row) > 24 else ""

            pickup = {
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
                "submission_id": row[21] if len(row) > 21 else "",
                "status": row[22] if len(row) > 22 else ""
            }

            # Include pre-cached coords if available
            if lat and lng:
                try:
                    pickup["lat"] = float(lat)
                    pickup["lng"] = float(lng)
                except ValueError:
                    pass

            pickups.append(pickup)

        return jsonify({"pickups": pickups})

    except Exception as e:
        return jsonify({"error": str(e), "pickups": []}), 500


@app.route("/api/sample-pickups")
def sample_pickups():
    """Local demo data so the ops console can be previewed without sheet access."""
    try:
        with open(SAMPLE_FILE, "r", encoding="utf-8") as f:
            return jsonify({"pickups": json.load(f)})
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
        sub_ids = data.get("submission_ids") or [data.get("submission_id", "")]
        sub_ids = [str(sub_id).strip() for sub_id in sub_ids if str(sub_id).strip()]
        name = data.get("name", "")
        if not sub_ids:
            return jsonify({"error": "No submission ID provided"}), 400

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
        existing_ids = {str(item.get("submission_id", "")).strip() for item in collected}
        timestamp = datetime.now().isoformat()
        for sub_id in sub_ids:
            if sub_id in existing_ids:
                continue
            collected.append({
                "submission_id": sub_id,
                "name": name,
                "collected_at": timestamp
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


@app.route("/api/sync-sheets", methods=["POST"])
def sync_sheets():
    """Re-fetch data from Google Sheets. The frontend already does this via
    /api/pickups, so this endpoint just triggers a fresh pull and returns status."""
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
        count = max(0, len(rows) - 1)
        return jsonify({"status": "ok", "output": f"Synced {count} rows from Google Sheets"})
    except Exception as e:
        return jsonify({"error": str(e), "output": "Sync failed"}), 500


@app.route("/api/send-telegram", methods=["POST"])
def send_telegram():
    """Send a message to Woody's Telegram via the ClaudeClaw bot.
    Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars."""
    try:
        data = request.get_json()
        message = data.get("message", "")
        if not message:
            return jsonify({"error": "No message provided"}), 400

        bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
        chat_id = os.environ.get("TELEGRAM_CHAT_ID", "8661352768")

        if not bot_token:
            return jsonify({"error": "TELEGRAM_BOT_TOKEN not configured", "status": "skipped"}), 200

        tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": message,
            "parse_mode": "HTML"
        }).encode("utf-8")

        req = urllib.request.Request(
            tg_url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        resp = urllib.request.urlopen(req, timeout=10)
        result = json.loads(resp.read().decode("utf-8"))

        return jsonify({"status": "ok", "telegram_ok": result.get("ok", False)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health")
def health():
    """Keep-alive endpoint — prevents Render free tier from sleeping."""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5555))
    print(f"Naki Wreck Ops HQ - http://localhost:{port}")
    app.run(host="0.0.0.0", port=port)
