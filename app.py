"""
Nakiwhiteware Ops HQ - Flask backend.
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


@app.route("/api/geocode-missing", methods=["POST"])
def geocode_missing():
    """For each open pickup without a precise pin, query Nominatim with a
    progressive fallback chain (full address > street + town > town only)
    and write any new coords to the cache so /api/pickups serves them next.

    Body (optional): {"provider": "google"|"nominatim", "google_key": "..."}
    Default: nominatim (free).
    """
    try:
        import csv
        import io
        import time
        cache = load_geocache()
        # Pull current pickups
        sheet_url = (
            f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"
            f"/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(SHEET_TAB)}"
        )
        rows = list(csv.reader(io.StringIO(
            urllib.request.urlopen(sheet_url, timeout=15).read().decode("utf-8")
        )))
        targets = []
        for row in rows[1:]:
            while len(row) < 25:
                row.append("")
            name = (row[1].strip() + " " + row[2].strip()).strip()
            street = row[5].strip()
            town = row[6].strip()
            lat = row[23].strip()
            lng = row[24].strip()
            status = row[22].strip().upper() if len(row) > 22 else ""
            if status == "DONE":
                continue
            if not name and not street:
                continue
            if lat and lng:
                continue  # already has a precise pin from the sheet
            key = " ".join((", ".join(p for p in [street, town, "Taranaki", "New Zealand"] if p)).lower().split())
            if key in cache:
                continue
            targets.append({"name": name, "street": street, "town": town, "key": key})

        body = request.get_json(silent=True) or {}
        google_key = body.get("google_key", "").strip() or os.environ.get("GOOGLE_GEOCODING_KEY", "").strip()
        # Default to Google when a key is set (more accurate on rural NZ),
        # otherwise free Nominatim.
        default_provider = "google" if google_key else "nominatim"
        provider = (body.get("provider") or default_provider).lower()

        new_entries = {}
        for t in targets:
            coords = None
            if provider == "google" and google_key:
                coords = _google_geocode(t, google_key)
            else:
                coords = _nominatim_chain(t)
                time.sleep(1.05)
            if coords:
                cache[t["key"]] = coords
                new_entries[t["key"]] = coords

        if new_entries:
            save_geocache(cache)
        return jsonify({
            "status": "ok",
            "considered": len(targets),
            "geocoded": len(new_entries),
            "provider": provider,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def _nominatim_chain(stop):
    """Progressive fallback: full -> street+town -> street only -> town only."""
    queries = []
    street = stop["street"]
    town = stop["town"]
    if street and town:
        queries.append(f"{street}, {town}, Taranaki, New Zealand")
        if " " in street and street.split()[0][0].isdigit():
            road = " ".join(street.split()[1:])
            if road:
                queries.append(f"{road}, {town}, Taranaki, New Zealand")
    if street:
        queries.append(f"{street}, Taranaki, New Zealand")
    if town:
        queries.append(f"{town}, Taranaki, New Zealand")
    seen = set()
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        try:
            url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
                "q": q, "format": "json", "limit": "1", "countrycodes": "nz",
            })
            req = urllib.request.Request(url, headers={
                "User-Agent": "NakiWreckOps/1.0 (nakiwreckremoval@gmail.com)",
                "Accept": "application/json",
            })
            r = json.loads(urllib.request.urlopen(req, timeout=15).read().decode("utf-8"))
            if r:
                return {"lat": float(r[0]["lat"]), "lng": float(r[0]["lon"])}
        except Exception:
            pass
    return None


def _google_geocode(stop, api_key):
    address = ", ".join(p for p in [stop["street"], stop["town"], "Taranaki", "New Zealand"] if p)
    url = "https://maps.googleapis.com/maps/api/geocode/json?" + urllib.parse.urlencode({
        "address": address,
        "key": api_key,
        "region": "nz",
        "components": "country:NZ",
    })
    try:
        r = json.loads(urllib.request.urlopen(url, timeout=15).read().decode("utf-8"))
        results = r.get("results") or []
        if results:
            loc = results[0]["geometry"]["location"]
            return {"lat": float(loc["lat"]), "lng": float(loc["lng"])}
    except Exception:
        pass
    return None


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


@app.route("/api/send-sms", methods=["POST"])
def send_sms():
    """Send SMS via ClickSend. Body: {"messages": [{"to":"+64...", "body":"..."}]}.
    Requires CLICKSEND_USERNAME + CLICKSEND_API_KEY env vars."""
    try:
        import base64
        data = request.get_json()
        messages = data.get("messages") or []
        if not messages:
            return jsonify({"error": "No messages provided"}), 400

        username = os.environ.get("CLICKSEND_USERNAME", "").strip()
        api_key = os.environ.get("CLICKSEND_API_KEY", "").strip()
        if not username or not api_key:
            return jsonify({
                "status": "skipped",
                "error": "ClickSend credentials not configured. Set CLICKSEND_USERNAME and CLICKSEND_API_KEY env vars.",
            }), 200

        sender = os.environ.get("CLICKSEND_FROM", "NakiWreck")[:11]
        prepared = []
        for m in messages:
            to = str(m.get("to", "")).strip()
            body = str(m.get("body", "")).strip()
            if not to or not body:
                continue
            # Normalise NZ mobile to E.164
            digits = "".join(c for c in to if c.isdigit() or c == "+")
            if digits.startswith("0"):
                digits = "+64" + digits[1:]
            elif digits.startswith("64") and not digits.startswith("+64"):
                digits = "+" + digits
            elif not digits.startswith("+"):
                digits = "+64" + digits
            prepared.append({
                "source": "naki-ops",
                "from": sender,
                "to": digits,
                "body": body[:1600],
            })

        if not prepared:
            return jsonify({"error": "No valid phone numbers in messages"}), 400

        auth = base64.b64encode(f"{username}:{api_key}".encode()).decode()
        body = json.dumps({"messages": prepared}).encode("utf-8")
        req = urllib.request.Request(
            "https://rest.clicksend.com/v3/sms/send",
            data=body,
            headers={
                "Authorization": "Basic " + auth,
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=15)
            result = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as he:
            err_body = he.read().decode("utf-8", errors="ignore")
            return jsonify({"status": "error", "http": he.code, "body": err_body[:500]}), 500

        sent = (result.get("data") or {}).get("messages") or []
        ok = [m for m in sent if str(m.get("status", "")).upper() == "SUCCESS"]
        return jsonify({
            "status": "ok",
            "requested": len(prepared),
            "sent": len(ok),
            "raw": result.get("response_msg") or result.get("response_code") or "",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    print(f"Nakiwhiteware Ops HQ - http://localhost:{port}")
    app.run(host="0.0.0.0", port=port)
