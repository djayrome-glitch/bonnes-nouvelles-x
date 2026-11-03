"""Interface web de validation : modifier, approuver ou rejeter les tweets avant publication."""
import os
import secrets

from flask import Flask, Response, abort, redirect, render_template_string, request, url_for

import bot

PASSWORD = os.getenv("WEB_PASSWORD", "")
CSRF = secrets.token_hex(16)  # change à chaque démarrage
TABS = [
    ("pending", "À valider"),
    ("published", "Publiés"),
    ("rejected", "Rejetés"),
    ("failed", "Échecs"),
]
STATUSES = [k for k, _ in TABS]

flask_app = Flask(__name__)


def _same(a, b):
    return secrets.compare_digest(a.encode(), b.encode())


@flask_app.before_request
def guard():
    if PASSWORD:
        auth = request.authorization
        if not auth or not _same(auth.password or "", PASSWORD):
            return Response(
                "Authentification requise", 401, {"WWW-Authenticate": 'Basic realm="Bot X"'}
            )
    if request.method == "POST" and not _same(request.form.get("csrf", ""), CSRF):
        abort(400)


@flask_app.after_request
def headers(resp):
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


def _back():
    back = request.form.get("back", "pending")
    return back if back in STATUSES else "pending"


@flask_app.get("/")
def index():
    status = request.args.get("status", "pending")
    if status not in STATUSES:
        status = "pending"
    order = "ASC" if status == "pending" else "DESC"
    con = bot.db()
    try:
        rows = con.execute(
            f"SELECT * FROM queue WHERE status=? ORDER BY id {order} LIMIT 100", (status,)
        ).fetchall()
        counts = {s: bot.count_status(con, s) for s in STATUSES}
    finally:
        con.close()
    return render_template_string(
        PAGE,
        rows=rows,
        counts=counts,
        status=status,
        tabs=TABS,
        csrf=CSRF,
        dry_run=bot.DRY_RUN,
        review=bot.REVIEW_MODE,
        msg=request.args.get("msg"),
        ok=request.args.get("ok") == "1",
    )


@flask_app.post("/approve/<int:qid>")
def approve(qid):
    con = bot.db()
    try:
        ok, msg = bot.publish_queued(con, qid, request.form.get("tweet", ""))
    finally:
        con.close()
    return redirect(url_for("index", status=_back(), msg=msg, ok=int(ok)))


@flask_app.post("/reject/<int:qid>")
def reject(qid):
    con = bot.db()
    try:
        done = bot.reject(con, qid)
    finally:
        con.close()
    msg = "Tweet rejeté." if done else "Ce tweet est introuvable ou déjà traité."
    return redirect(url_for("index", status=_back(), msg=msg, ok=int(done)))


@flask_app.post("/generate")
def generate():
    try:
        n = bot.run_once()
        if n is None:
            msg, ok = "Un cycle est déjà en cours, réessayez dans un instant.", 0
        elif n == 0:
            msg, ok = "Rien de nouveau à proposer pour l'instant.", 1
        else:
            msg, ok = f"{n} tweet(s) généré(s).", 1
    except Exception as e:  # noqa: BLE001
        msg, ok = f"Erreur : {e}", 0
    return redirect(url_for("index", status="pending", msg=msg, ok=ok))


def serve():
    host = os.getenv("WEB_HOST", "127.0.0.1")
    port = int(os.getenv("WEB_PORT", "8080"))
    if host not in ("127.0.0.1", "localhost") and not PASSWORD:
        raise SystemExit("WEB_PASSWORD est obligatoire quand WEB_HOST n'est pas local.")
    print(f"Interface de validation : http://{host}:{port}")
    flask_app.run(host=host, port=port, threaded=True)


PAGE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bonnes nouvelles · validation</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1c1f23;--muted:#6b7280;--line:#e3e6ea;--accent:#1d9bf0;--ok:#15803d;--bad:#b91c1c;--warn:#fef3c7;--warnfg:#92400e}
@media (prefers-color-scheme:dark){:root{--bg:#0f1114;--card:#171a1f;--fg:#e8eaed;--muted:#9aa3ad;--line:#272c33;--accent:#4db3ff;--ok:#4ade80;--bad:#f87171;--warn:#3a2f10;--warnfg:#fcd34d}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:16px}
header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
h1{font-size:1.25rem;margin:0}
.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.tabs a{padding:6px 12px;border:1px solid var(--line);border-radius:999px;color:var(--fg);text-decoration:none;background:var(--card);font-size:.9rem}
.tabs a.on{background:var(--accent);border-color:var(--accent);color:#fff}
.banner{padding:10px 12px;border-radius:10px;margin-top:10px;background:var(--warn);color:var(--warnfg);font-size:.9rem}
.flash{padding:10px 12px;border-radius:10px;margin-top:10px;border:1px solid var(--line);background:var(--card)}
.flash.ok{border-color:var(--ok);color:var(--ok)}
.flash.bad{border-color:var(--bad);color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px}
.meta{display:flex;gap:10px;color:var(--muted);font-size:.8rem;align-items:center}
.tag{background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
h3{font-size:.95rem;margin:8px 0}
h3 a{color:var(--fg)}
textarea{width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--fg);resize:vertical}
.link{font-size:.8rem;color:var(--muted);word-break:break-all;margin:4px 0 8px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.count{margin-right:auto;font-size:.85rem;color:var(--muted)}
.count.over{color:var(--bad);font-weight:600}
button{font:inherit;border:0;border-radius:10px;padding:8px 14px;cursor:pointer;background:var(--accent);color:#fff}
button.ghost{background:transparent;color:var(--fg);border:1px solid var(--line)}
.err{color:var(--bad);font-size:.85rem;margin-top:6px}
.empty{color:var(--muted);text-align:center;padding:40px 0}
.final{white-space:pre-wrap;margin:6px 0}
</style>
</head>
<body>
<main>
<header>
  <h1>Bonnes nouvelles · validation</h1>
  <form method="post" action="{{ url_for('generate') }}">
    <input type="hidden" name="csrf" value="{{ csrf }}">
    <button class="ghost" type="submit">Chercher de nouvelles actus</button>
  </form>
</header>
{% if dry_run %}<div class="banner">Mode simulation (DRY_RUN) : rien n'est réellement publié sur X.</div>{% endif %}
{% if not review %}<div class="banner">Mode automatique : les tweets sont publiés sans validation préalable.</div>{% endif %}
{% if msg %}<div class="flash {{ 'ok' if ok else 'bad' }}">{{ msg }}</div>{% endif %}
<nav class="tabs">
{% for key, label in tabs %}<a class="{{ 'on' if key == status else '' }}" href="{{ url_for('index', status=key) }}">{{ label }} ({{ counts[key] }})</a>{% endfor %}
</nav>

{% for r in rows %}
<article class="card">
  <div class="meta"><span class="tag">{{ r.category }}</span><span>{{ r.created_at[:16].replace('T', ' ') }} UTC</span></div>
  <h3><a href="{{ r.url }}" target="_blank" rel="noopener noreferrer">{{ r.title }}</a></h3>
  {% if status in ('pending', 'failed') %}
  <form method="post" action="{{ url_for('approve', qid=r.id) }}">
    <input type="hidden" name="csrf" value="{{ csrf }}">
    <input type="hidden" name="back" value="{{ status }}">
    <textarea name="tweet" rows="4" data-count="c{{ r.id }}">{{ r.tweet }}</textarea>
    <div class="link">+ lien : {{ r.url }}</div>
    <div class="row">
      <span class="count" id="c{{ r.id }}"></span>
      <button type="submit" class="ghost" formaction="{{ url_for('reject', qid=r.id) }}" formnovalidate>Rejeter</button>
      <button type="submit">Publier</button>
    </div>
    {% if r.error %}<div class="err">{{ r.error }}</div>{% endif %}
  </form>
  {% else %}
  <div class="final">{{ r.tweet }}</div>
  {% if status == 'published' %}
    <div class="meta">
    {% if r.tweet_id == 'dry-run' %}<span>simulé</span>
    {% else %}<a href="https://x.com/i/status/{{ r.tweet_id }}" target="_blank" rel="noopener noreferrer">Voir sur X</a>{% endif %}
    </div>
  {% endif %}
  {% endif %}
</article>
{% else %}
<div class="empty">Rien ici pour l'instant.</div>
{% endfor %}
</main>
<script>
function xlen(s){var n=0;for(const ch of s){n+=ch.codePointAt(0)>65535?2:1}return n}
document.querySelectorAll('textarea[data-count]').forEach(function(t){
  var out=document.getElementById(t.dataset.count);
  function upd(){var n=xlen(t.value.trim())+24;out.textContent=n+'/280';out.classList.toggle('over',n>280)}
  t.addEventListener('input',upd);upd();
});
</script>
</body>
</html>
"""
