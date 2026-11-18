# Observatoire mondial du piratage

Un site web qui se met à jour tout seul et dresse l'état du piratage dans le monde,
en deux domaines :

- **Piratage audiovisuel** : IPTV illégale, sites et streaming pirates, sport en direct,
  actions en justice, blocages, démantèlements, études chiffrées.
- **Cyberattaques** : rançongiciels, fuites de données, failles critiques, attaques
  étatiques, hameçonnage, déni de service, logiciels malveillants, arrestations.

```
flux RSS → Claude (tri, classement, pays, gravité, résumé) → base SQLite → page web
```

Même principe que *bonnes-nouvelles* et *tv-numerique*, mais sans publication : le
résultat est un tableau de bord. Rien n'est envoyé nulle part.

## Ce que montre la page

- **Synthèse** des dernières 24 heures, rédigée par Claude (toutes les 3 h par défaut).
- **Indicateurs** : nombre d'événements, gravité élevée ou critique, pays concernés, sources.
- **Carte du monde** colorée selon le nombre d'événements par pays (clic = filtre).
- **Classement des pays**, **évolution** dans le temps et **répartition par type**.
- **Fil des événements** : titre et résumé en français, domaine, type, gravité, pays,
  lien vers l'article d'origine. Les nouveautés sont marquées « Nouveau ».
- **Filtres** : domaine (tout, audiovisuel, cyber), période (24 h, 7 j, 30 j), pays.

La page se rafraîchit seule chaque minute, sans recharger. Les flux sont relus toutes les
30 minutes (`COLLECT_INTERVAL_MINUTES`) : c'est le vrai rythme du « temps réel », celui de
la presse.

## Installation

```bash
cd veille-piratage
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis renseignez ANTHROPIC_API_KEY
python app.py --check-feeds   # vérifie que les flux RSS répondent
python app.py                 # collecte + site sur http://127.0.0.1:8082
```

La première collecte démarre immédiatement ; la page se remplit en quelques minutes.

## Rendre le site accessible

- **Sur votre réseau local** : `WEB_HOST=0.0.0.0`, puis ouvrez `http://<ip-du-pi>:8082`.
- **Sur Internet** : placez-le derrière un reverse proxy HTTPS (Caddy, Nginx) ou un
  tunnel (Cloudflare Tunnel, Tailscale Funnel). Le site est en lecture seule ; ajoutez
  `WEB_PASSWORD` si vous ne voulez pas qu'il soit public.

## Coût

Claude évalue les articles par lots de 8. Avec les réglages par défaut (au plus 40
articles toutes les 30 minutes, soit 5 appels, plus une synthèse toutes les 3 h), cela
représente au maximum environ 250 appels par jour à Claude Haiku, en pratique moins car
les articles déjà vus ne sont jamais réévalués. Baissez `MAX_ARTICLES_PER_RUN` ou
augmentez `COLLECT_INTERVAL_MINUTES` pour réduire la facture.

## Sources

Dictionnaire `FEEDS` dans `collector.py` :

- Audiovisuel : TorrentFreak et des recherches Google Actualités (anglais et français)
  sur l'IPTV pirate, le sport piraté et les blocages.
- Cyber : BleepingComputer, The Hacker News, The Record, SecurityWeek, Krebs on Security,
  CERT-FR, ZATAZ et des recherches Google Actualités (anglais et français).

Vérifiez-les avec `--check-feeds`, retirez celles qui sont vides et ajoutez les vôtres
(la fonction `google_news("votre recherche")` crée un flux à partir d'une recherche).

## Garde-fous

- Le contenu des articles est traité comme non fiable (consigne anti-injection dans le prompt).
- Les codes pays sont vérifiés (ISO 3166) ; types et gravité sont limités à des listes fixes.
- Doublons évités : URL déjà vues, et même affaire reprise par plusieurs médias.
- Tout le texte est inséré dans la page de façon échappée ; politique de sécurité (CSP) stricte.
- Les bibliothèques et la carte sont fournies localement (`static/vendor`) : aucun appel
  à un site tiers depuis le navigateur.

Limites : les titres et résumés sont rédigés par une IA à partir des flux RSS, et
l'attribution des pays ou de la gravité peut être imparfaite. Les très petits pays
(Singapour, Malte...) n'apparaissent pas sur la carte mais figurent dans le classement.

## Lancement automatique sur le Raspberry Pi

`/etc/systemd/system/veille-piratage.service` (adaptez l'utilisateur et le chemin) :

```ini
[Unit]
Description=Observatoire mondial du piratage
After=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/bonnes-nouvelles-x/veille-piratage
ExecStart=/home/pi/bonnes-nouvelles-x/veille-piratage/venv/bin/python app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now veille-piratage
```

Crédits : d3, topojson-client et world-atlas (licence ISC, Mike Bostock), données
cartographiques Natural Earth (domaine public).
