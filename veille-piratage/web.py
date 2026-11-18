"""Site web de l'observatoire : une page qui se met à jour seule, et une API JSON."""
import os
import secrets

from flask import Flask, Response, jsonify, request, send_from_directory

import collector

PASSWORD = os.getenv("WEB_PASSWORD", "")
STATIC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

flask_app = Flask(__name__, static_folder=STATIC, static_url_path="/static")


@flask_app.before_request
def guard():
    if PASSWORD:
        auth = request.authorization
        if not auth or not secrets.compare_digest(
            (auth.password or "").encode(), PASSWORD.encode()
        ):
            return Response(
                "Authentification requise",
                401,
                {"WWW-Authenticate": 'Basic realm="Observatoire"'},
            )
    return None


@flask_app.after_request
def headers(resp):
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        "connect-src 'self'; frame-ancestors 'none'"
    )
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@flask_app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


@flask_app.get("/api/state")
def api_state():
    return jsonify(collector.state())


def serve():
    host = os.getenv("WEB_HOST", "127.0.0.1")
    port = int(os.getenv("WEB_PORT", "8082"))
    if host not in ("127.0.0.1", "localhost") and not PASSWORD:
        # Le site est en lecture seule : il peut être public. Le mot de passe reste possible.
        print("Attention : site accessible sans mot de passe (WEB_PASSWORD vide).")
    print(f"Observatoire : http://{host}:{port}")
    flask_app.run(host=host, port=port, threaded=True)
