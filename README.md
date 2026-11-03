# Bot X – Bonnes nouvelles (médecine, ingénierie, sciences)

Le bot lit des flux RSS scientifiques (anglais et français), demande à Claude de ne retenir
que les vraies bonnes nouvelles, rédige un tweet sobre et factuel, puis vous le propose dans
une **interface web de validation** avant publication sur X.

```
flux RSS → Claude (tri + rédaction) → file de validation (web) → X
```

## Installation

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # puis remplissez vos clés
```

## Clés nécessaires

1. **Claude** : clé API sur https://console.anthropic.com
2. **X** : créez une app sur https://developer.x.com, activez les droits
   *Read and Write*, puis générez les 4 clés (API Key/Secret, Access Token/Secret).
   La publication via l'API X dépend de votre offre développeur : vérifiez les tarifs
   et quotas actuels.

## Utilisation

```bash
python app.py          # bot + interface web sur http://127.0.0.1:8080
python app.py --once   # un seul cycle de collecte (test), sans interface
```

Dans l'interface, chaque tweet proposé peut être **modifié**, **publié** ou **rejeté**.
Un compteur indique la longueur réelle (lien X compris). Les onglets donnent l'historique
(publiés, rejetés, échecs, avec possibilité de réessayer).

## Deux interrupteurs de sécurité

| Variable | Défaut | Effet |
|---|---|---|
| `DRY_RUN` | `true` | Simulation : rien n'est envoyé à X. Mettre `false` pour publier vraiment. |
| `REVIEW_MODE` | `true` | Validation manuelle. Avec `false`, le bot publie seul (max `MAX_POSTS_PER_DAY` par jour). |

Démarrage conseillé : garder les deux à `true` quelques jours, juger la qualité des
tweets, puis passer `DRY_RUN=false` en gardant la validation.

## Garde-fous intégrés

- Claude écarte l'alarmisme, la publicité, la politique, l'opinion et les résultats
  surinterprétés (« chez la souris » présenté comme une guérison humaine).
- Les tweets contenant un lien ou une @mention sont refusés ; le lien source est ajouté par le bot.
- Le contenu des articles est traité comme non fiable (consigne anti-injection dans le prompt).
- Pas de doublons (base SQLite `bot.db`), file d'attente plafonnée, double clic neutralisé.
- Interface protégée par jeton CSRF ; mot de passe obligatoire si elle n'est pas locale.

## Sources

Anglais : Medical Xpress, TechXplore, Phys.org, ScienceDaily, EurekAlert.
Français : Futura (santé, high-tech, matière, espace), CNRS Le journal.
Modifiez le dictionnaire `FEEDS` dans `bot.py` pour en ajouter. Un flux vide ou
inaccessible est signalé dans les logs (`Flux vide ou inaccessible`).

## Hébergement 24h/24

Un petit serveur (VPS), un Raspberry Pi ou un service type Railway/Render suffit :
lancez `python app.py`. Si l'interface doit être joignable depuis Internet, définissez
`WEB_HOST=0.0.0.0` et un `WEB_PASSWORD` solide, et placez-la derrière HTTPS
(reverse proxy). Le serveur Flask intégré convient à un usage personnel.

## Conseils

- Indiquez sur le profil du compte que les tweets sont rédigés avec l'aide d'une IA.
- Relisez toujours les chiffres et les nuances (« premiers essais », « chez l'animal »).
- Ne commitez jamais `.env` (déjà dans `.gitignore`).
