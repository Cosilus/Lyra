# polymarket-btc-bot

Bot autonome qui trade le marché Polymarket "Bitcoin Up or Down" (fenêtre de
5 minutes), en signant et soumettant les ordres directement contre les
smart contracts CTF Exchange de Polymarket (via leur CLOB API) — même
mécanisme de signature que celui déjà utilisé et vérifié en conditions
réelles par LyraiWalletApp, porté ici tel quel.

## ⚠️ Avant de lancer quoi que ce soit

- **Ce n'est pas un algorithme "gagnant garanti".** La stratégie a un edge
  théorique (voir plus bas) mais reste spéculative. Traite le capital que
  tu y mets comme perdable.
- **`LIVE_TRADING=false` par défaut.** Le bot ne passera jamais un ordre
  réel tant que tu n'as pas explicitement mis `LIVE_TRADING=true` dans
  `.env`.
- **La partie découverte de marché (`src/market.js`) n'a pas pu être
  testée en live** depuis cet environnement (accès réseau bloqué vers
  polymarket.com ici). Lance `npm run discover` et vérifie que ça trouve
  bien le bon marché avant de faire confiance au reste.
- **La partie signature/soumission d'ordre (`src/orders.js`,
  `src/clobAuth.js`) est un portage direct** du code déjà utilisé et
  confirmé fonctionnel dans LyraiWalletApp (`App.jsx`), pas du code
  neuf non testé.

## Stratégie : "confirmation de fin de fenêtre"

Le marché résout selon que le prix BTC à la clôture de la fenêtre de 5 min
est au-dessus ou en-dessous de son prix à l'ouverture. Plutôt que de
parier sur un momentum sans edge démontré, le bot attend la fin de la
fenêtre (par défaut les derniers 10%, ~30 secondes) : si BTC a déjà
bougé de façon significative depuis l'ouverture, l'issue est quasiment
jouée (seul un retournement brutal dans les dernières secondes peut
encore la changer), et le prix affiché par Polymarket pour ce côté n'a
parfois pas encore totalement rattrapé ce mouvement. C'est cet écart —
réel mais petit et jamais garanti — que la stratégie cherche à capter.

Les paramètres (`ENTRY_WINDOW_FRACTION`, `MIN_MOVE_THRESHOLD`,
`MAX_ENTRY_PRICE`, `MIN_ENTRY_PRICE`) contrôlent exactement quand entrer
et à quel prix arrêter de considérer qu'il reste de l'edge — voir
`.env.example` pour le détail de chacun.

## Installation

```bash
cd polymarket-btc-bot
npm install
cp .env.example .env
```

Remplis `.env` :
- `PRIVATE_KEY` : la clé privée du wallet Polygon qui contrôle ton compte
  Polymarket.
- `RPC_URL` : un endpoint RPC Polygon (public ou dédié).
- `DEV_DNS_OVERRIDE` : décommente si ton réseau ne résout pas
  correctement les domaines polymarket.com (mets `1.1.1.1`).

## Prérequis compte Polymarket : l'approbation initiale

Si ton compte a migré vers le nouveau système "deposit wallet" de
Polymarket (obligatoire depuis leur migration 2026 — c'est le cas de la
quasi-totalité des comptes actifs), le bot **ne peut pas** poser
l'approbation ERC-20 initiale pour toi : le `execute()` du deposit wallet
est restreint au relayer de Polymarket. Solution : passe **un seul petit
trade manuel sur polymarket.com** avec ce compte avant de lancer le bot —
ça pose l'approbation une fois pour toutes.

## Utilisation

```bash
# 1. Vérifier que la découverte de marché fonctionne chez toi
npm run discover

# 2. Tourner en simulation (aucun ordre réel, juste le raisonnement + journal)
npm run dry-run

# 3. Une fois validé, passer en réel (LIVE_TRADING=true dans .env)
npm start
```

Chaque trade (réel ou simulé) est journalisé dans `data/trades.json`. Le
bot relit ce fichier à chaque tour pour appliquer ses limites de risque
(perte max/jour, gain max/jour, pertes consécutives, nombre de trades/jour) —
elles survivent donc à un redémarrage du bot.

## Gestion du risque (`.env`)

| Variable | Rôle |
|---|---|
| `STAKE_USD` | Mise par trade |
| `MAX_DAILY_LOSS_USD` | Arrêt de la journée si atteint |
| `MAX_DAILY_PROFIT_USD` | Arrêt de la journée si atteint (sécurise le gain) |
| `MAX_CONSECUTIVE_LOSSES` / `CONSECUTIVE_LOSS_COOLDOWN_MIN` | Pause après une série de pertes |
| `MAX_TRADES_PER_DAY` | Plafond dur, indépendant du P&L |

Commence avec un `STAKE_USD` bas et des plafonds serrés, observe plusieurs
jours en `dry-run` avant de passer en réel, et surveille `data/trades.json`
régulièrement — rien ici ne remplace une supervision active.
