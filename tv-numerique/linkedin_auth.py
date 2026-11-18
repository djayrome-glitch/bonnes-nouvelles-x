"""Obtient un jeton LinkedIn (valable 60 jours) et l'enregistre dans .env.

    python linkedin_auth.py

Prérequis dans .env : LINKEDIN_CLIENT_ID et LINKEDIN_CLIENT_SECRET (voir README).
Fonctionne aussi sur un Raspberry Pi sans écran : ouvrez le lien sur n'importe quel
appareil, puis recopiez ici l'adresse sur laquelle LinkedIn vous a renvoyé.
"""
import os
import secrets
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

import requests
from dotenv import load_dotenv, set_key

ENV_PATH = Path(__file__).with_name(".env")
load_dotenv(ENV_PATH)

CLIENT_ID = os.getenv("LINKEDIN_CLIENT_ID", "").strip()
CLIENT_SECRET = os.getenv("LINKEDIN_CLIENT_SECRET", "").strip()
REDIRECT_URI = os.getenv("LINKEDIN_REDIRECT_URI", "http://localhost:8765/callback").strip()
SCOPES = "openid profile w_member_social"


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        sys.exit("Renseignez LINKEDIN_CLIENT_ID et LINKEDIN_CLIENT_SECRET dans .env.")

    state = secrets.token_urlsafe(16)
    url = "https://www.linkedin.com/oauth/v2/authorization?" + urlencode(
        {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
            "state": state,
            "scope": SCOPES,
        }
    )
    print("1. Ouvrez ce lien dans un navigateur et autorisez l'application :\n")
    print(url)
    print(
        "\n2. LinkedIn vous renvoie vers une adresse qui commence par\n"
        f"   {REDIRECT_URI}?code=...\n"
        "   La page affichera probablement une erreur : c'est normal.\n"
        "   Copiez l'adresse complète depuis la barre du navigateur.\n"
    )
    answer = input("3. Collez cette adresse ici : ").strip()
    params = parse_qs(urlparse(answer).query)
    if "error" in params:
        sys.exit(f"LinkedIn a refusé : {params.get('error_description', params['error'])[0]}")
    if params.get("state", [""])[0] != state:
        sys.exit("Adresse invalide ou provenant d'une autre tentative (state différent).")
    code = params.get("code", [""])[0]
    if not code:
        sys.exit("Aucun code trouvé dans l'adresse collée.")

    r = requests.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
        timeout=30,
    )
    if r.status_code != 200:
        sys.exit(f"Échec de l'échange du code ({r.status_code}) : {r.text[:300]}")
    tok = r.json()
    token = tok["access_token"]
    expires = date.today() + timedelta(seconds=int(tok.get("expires_in", 0)))

    me = requests.get(
        "https://api.linkedin.com/v2/userinfo",
        headers={"Authorization": f"Bearer {token}"},
        timeout=30,
    )
    if me.status_code != 200:
        sys.exit(f"Impossible de lire votre profil ({me.status_code}) : {me.text[:300]}")
    info = me.json()
    author = f"urn:li:person:{info['sub']}"

    set_key(ENV_PATH, "LINKEDIN_ACCESS_TOKEN", token)
    set_key(ENV_PATH, "LINKEDIN_TOKEN_EXPIRES", expires.isoformat())
    if not os.getenv("LINKEDIN_AUTHOR_URN", "").strip():
        set_key(ENV_PATH, "LINKEDIN_AUTHOR_URN", author)
    print(f"\nConnecté en tant que {info.get('name', '?')} ({author}).")
    print(f"Jeton enregistré dans .env, valable jusqu'au {expires.isoformat()}.")
    print("Le bot l'utilisera dès la prochaine publication (pas besoin de le redémarrer).")


if __name__ == "__main__":
    main()
