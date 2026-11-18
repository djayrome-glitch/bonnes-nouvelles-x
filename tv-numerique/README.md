# Bot LinkedIn – Veille TV numérique (technique et industrie)

Le bot lit des flux RSS internationaux spécialisés (diffusion, streaming/OTT, industrie),
demande à Claude de ne retenir que les actualités importantes du secteur, rédige un post
LinkedIn en français, puis vous le propose dans une **interface web de validation** avant
publication.

```
flux RSS → Claude (tri + importance + rédaction) → file de validation (web) → LinkedIn
```

Il reprend le fonctionnement de *bonnes-nouvelles* et peut tourner sur le même Raspberry Pi
(dossier, `.env`, base et port distincts : 8081 par défaut).

## Installation

```bash
cd tv-numerique
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis remplissez vos clés
python app.py --check-feeds   # vérifie que les flux RSS répondent
```

## Clés nécessaires

1. **Claude** : clé API sur https://console.anthropic.com (la même que pour l'autre bot convient).
2. **LinkedIn** :
   1. Créez une app sur https://www.linkedin.com/developers/apps (elle doit être rattachée à
      une page LinkedIn ; une page de test suffit).
   2. Onglet **Products** : ajoutez *Share on LinkedIn* et
      *Sign In with LinkedIn using OpenID Connect*.
   3. Onglet **Auth** : copiez *Client ID* et *Client Secret* dans `.env`, et ajoutez
      `http://localhost:8765/callback` dans *Authorized redirect URLs*.
   4. Lancez `python linkedin_auth.py` et suivez les instructions : le jeton, sa date
      d'expiration et votre identifiant (`urn:li:person:...`) sont écrits dans `.env`.

   **Le jeton LinkedIn expire au bout de 60 jours.** L'interface affiche un avertissement
   7 jours avant ; relancez alors `python linkedin_auth.py` (pas besoin de redémarrer le bot).

   Publier sur une **page entreprise** plutôt que sur votre profil demande l'accès
   *Community Management API*, soumis à validation par LinkedIn. Une fois obtenu, mettez
   `LINKEDIN_AUTHOR_URN=urn:li:organization:<id>` et ajoutez le droit `w_organization_social`.

## Utilisation

```bash
python app.py                 # bot + interface web sur http://127.0.0.1:8081
python app.py --once          # un seul cycle de collecte (test), sans interface
python app.py --check-feeds   # état de chaque flux RSS
```

Dans l'interface, chaque post proposé affiche sa catégorie, sa source et son importance
(★ à ★★★★★) ; il peut être **modifié**, **publié** ou **rejeté**. L'article source est
joint au post sous forme d'aperçu de lien. Les onglets donnent l'historique (publiés,
rejetés, échecs, avec possibilité de réessayer).

## Deux interrupteurs de sécurité

| Variable | Défaut | Effet |
|---|---|---|
| `DRY_RUN` | `true` | Simulation : rien n'est envoyé à LinkedIn. Mettre `false` pour publier vraiment. |
| `REVIEW_MODE` | `true` | Validation manuelle. Avec `false`, le bot publie seul (max `MAX_POSTS_PER_DAY` par jour). |

## Ce que Claude retient

Toutes les actualités **significatives pour les professionnels**, positives ou négatives :
normes et déploiements (DVB, ATSC 3.0, 5G Broadcast, codecs, HDR), streaming, CTV et FAST,
production IP et cloud, équipements, satellites, accords, rachats, résultats, audiences,
régulation et fréquences.

Il écarte : critiques de programmes, people, bons plans, guides d'achat, contenus
sponsorisés, opinions, rumeurs et informations mineures. Il évite aussi les doublons
(même annonce reprise par plusieurs sources) en comparant avec les 40 derniers sujets.
`MIN_IMPORTANCE` (3 par défaut) règle la sévérité du tri.

## Garde-fous

- Posts factuels : aucun chiffre ou nom absent de l'article, annonces attribuées à leur auteur.
- Les posts contenant un lien ou une @mention sont refusés ; le lien est joint par le bot.
- Le contenu des articles est traité comme non fiable (consigne anti-injection dans le prompt).
- Caractères spéciaux échappés pour LinkedIn ; les hashtags restent cliquables.
- Pas de doublons d'URL (base SQLite `tv.db`), file d'attente plafonnée, double clic neutralisé.
- Interface protégée par jeton CSRF ; mot de passe obligatoire si elle n'est pas locale.

## Sources

Dictionnaire `FEEDS` dans `bot.py` : TV Technology, TVBEurope, NewscastStudio, SVG Europe,
StreamTV Insider, Media Play News, Cord Cutters News, Broadband TV News, Advanced Television,
Digital TV Europe, TVNewsCheck, Via Satellite. Vérifiez-les avec `--check-feeds` et
retirez ou remplacez celles qui sont vides.

## Lancement automatique sur le Raspberry Pi

`/etc/systemd/system/tv-numerique.service` (adaptez l'utilisateur et le chemin) :

```ini
[Unit]
Description=Bot veille TV numérique
After=network-online.target

[Service]
User=pi
WorkingDirectory=/home/pi/bonnes-nouvelles-x/tv-numerique
ExecStart=/home/pi/bonnes-nouvelles-x/tv-numerique/venv/bin/python app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now tv-numerique
```

## Conseils

- Mentionnez sur le profil ou la page que les posts sont rédigés avec l'aide d'une IA.
- Relisez les chiffres et les noms propres avant de publier.
- Ne commitez jamais `.env` (déjà dans `.gitignore`).
