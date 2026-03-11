# 🎮 Red Tetris — Architecture Frontend

> Stack : **Next.js 14+ (App Router) + React + TypeScript + Redux Toolkit + Socket.IO Client**
> Document d'architecture et guide de développement — **sans code**

---

## ⚠️ Note préliminaire — Corrections et améliorations par rapport au brouillon

Plusieurs points du brouillon original ont été corrigés, clarifiés ou enrichis :

- **Tout le code supprimé** : ce document est une architecture, pas une implémentation
- **`spectrum.ts` ajouté** dans `game/` — le calcul du spectre est une fonction pure qui méritait son propre fichier, absent du brouillon
- **`useGameLoop` clarifié** : le brouillon hésitait entre `requestAnimationFrame` et `setInterval` — ce choix est tranché et justifié ici
- **Problème des stale closures** : sujet critique pour un jeu en temps réel, totalement absent du brouillon
- **Contrainte `'use client'` de Next.js App Router** : non mentionnée dans le brouillon, pourtant bloquante si oubliée
- **Double `REQUEST_PIECE` au démarrage** : mécanique absente du brouillon, essentielle pour afficher la pièce suivante dès le début
- **`linesJustCleared` manquant dans `gameSlice`** : champ indispensable pour que le middleware puisse émettre `LINES_CLEARED` au bon moment
- **`lockPiece` et ses effets de bord réseau** : le brouillon ne précisait pas que c'est le middleware qui gère les 3 émissions socket déclenchées par `lockPiece`
- **Architecture CSS** : section entièrement absente du brouillon, ajoutée ici
- **Cycle de vie du client** : section ajoutée pour faire le miroir avec l'architecture backend et garantir la cohérence
- **Pièce fantôme (ghost piece)** : concept mentionné nulle part dans le brouillon, ajouté comme composant visuel recommandé
- **Wall kick** : mécanisme de rotation absent du brouillon, pourtant nécessaire pour une expérience de jeu acceptable

---

## 📋 Table des matières

1. [Vue d'ensemble et responsabilités du client](#1-vue-densemble-et-responsabilités-du-client)
2. [Structure des dossiers](#2-structure-des-dossiers)
3. [Configuration Next.js et contraintes App Router](#3-configuration-nextjs-et-contraintes-app-router)
4. [Routing — Gestion de l'URL de jeu](#4-routing--gestion-de-lurl-de-jeu)
5. [Logique de jeu — Fonctions Pures](#5-logique-de-jeu--fonctions-pures)
6. [Gestion de l'état Redux](#6-gestion-de-létat-redux)
7. [Socket.IO Client — Connexion et Singleton](#7-socketio-client--connexion-et-singleton)
8. [Hooks Personnalisés](#8-hooks-personnalisés)
9. [Composants React](#9-composants-react)
10. [Architecture CSS](#10-architecture-css)
11. [Cycle de vie complet du client](#11-cycle-de-vie-complet-du-client)
12. [Synchronisation Client ↔ Serveur](#12-synchronisation-client--serveur)
13. [Tests unitaires Frontend](#13-tests-unitaires-frontend)
14. [Contraintes imposées par le sujet et pièges à éviter](#14-contraintes-imposées-par-le-sujet-et-pièges-à-éviter)

---

## 1. Vue d'ensemble et responsabilités du client

### Rôle général
- Le client est le **moteur de jeu local** de chaque joueur — il gère tout ce qui se passe visuellement sur le plateau
- Il est la **vue réactive** de l'état Redux — les composants ne font qu'afficher ce que le store contient
- Il est le **seul responsable** de la physique du jeu : mouvements, collisions, rotations, chute, effacement de lignes
- Il **rapporte** au serveur uniquement les événements significatifs : pose d'une pièce, lignes effacées, spectre, élimination

### Ce que le client gère
- La représentation locale du plateau (tableau 2D en mémoire)
- La boucle de jeu (gravité automatique, vitesse de chute)
- Les entrées clavier du joueur (déplacements, rotations, drops)
- La détection de collision sur le plateau local
- L'effacement des lignes complètes et le calcul des pénalités à signaler
- Le calcul du spectre à chaque changement de plateau
- La réception et l'affichage des spectres des adversaires
- L'application des lignes de pénalité reçues du serveur
- La détection du game over local (nouvelle pièce ne peut pas spawner)
- L'affichage de l'interface complète : plateau, lobby, spectres, overlay de fin

### Ce que le client ne gère PAS
- La génération des pièces — il les **demande** au serveur via `REQUEST_PIECE`
- La décision de qui gagne — le serveur envoie `GAME_OVER` avec le vainqueur
- La distribution des pénalités — il signale ses lignes effacées, le serveur calcule et distribue
- La liste authoritative des joueurs — le serveur envoie `ROOM_STATE`, `PLAYER_JOINED`, `PLAYER_LEFT`
- L'hôte de la room — le serveur désigne et transfère le rôle

### Principe fondamental : le client ne fait jamais confiance à lui-même pour les données partagées
- Les pièces viennent toujours du serveur
- La liste des joueurs vient toujours du serveur
- Le statut de la partie vient toujours du serveur
- Le client calcule son propre état local (plateau, collisions, lignes) mais soumet les résultats au serveur

---

## 2. Structure des dossiers

```
frontend/
│
├── nextjs_app/
│   ├── src/
│   │   ├── app/                            # App Router Next.js — pages et layouts
│   │   │   ├── layout.tsx                  # Layout global : Redux Provider, directive 'use client'
│   │   │   ├── page.tsx                    # Page d'accueil : formulaire de join
│   │   │   ├── globals.css                 # Reset CSS global et variables CSS
│   │   │   └── [room]/
│   │   │       └── [player]/
│   │   │           └── page.tsx            # Page de jeu : /<room>/<player>
│   │   │
│   │   ├── components/                     # Composants React — zéro logique de jeu, zéro 'this'
│   │   │   ├── Board/
│   │   │   │   ├── Board_Display.tsx       # Plateau 10×20 : fusion board + pièce active + ghost
│   │   │   │   └── Board.module.css
│   │   │   ├── Cell/
│   │   │   │   ├── Cell.tsx                # Case individuelle colorée
│   │   │   │   └── Cell.module.css
│   │   │   ├── Piece/
│   │   │   │   ├── NextPiece.tsx           # Aperçu de la pièce suivante (grille 4×4)
│   │   │   │   └── NextPiece.module.css
│   │   │   ├── Spectrum/
│   │   │   │   ├── Spectrum.tsx            # Vues compressées des plateaux adversaires
│   │   │   │   └── Spectrum.module.css
│   │   │   ├── GameInfo/
│   │   │   │   ├── GameInfo.tsx            # Panneau latéral : next piece + infos room
│   │   │   │   └── GameInfo.module.css
│   │   │   ├── Lobby/
│   │   │   │   ├── Lobby.tsx               # Salle d'attente avant la partie
│   │   │   │   └── Lobby.module.css
│   │   │   ├── Overlay/
│   │   │   │   ├── GameOverlay.tsx         # Écran game over ou victoire
│   │   │   │   └── GameOverlay.module.css
│   │   │   └── GameView/
│   │   │       ├── GameView.tsx            # Conteneur principal pendant la partie
│   │   │       └── GameView.module.css
│   │   │
│   │   ├── store/                          # Redux Toolkit
│   │   │   ├── index.ts                    # Configuration du store + types RootState/AppDispatch
│   │   │   ├── hooks.ts                    # useAppDispatch et useAppSelector typés
│   │   │   ├── slices/
│   │   │   │   ├── gameSlice.ts            # État local du plateau, pièce active, pénalités
│   │   │   │   ├── roomSlice.ts            # État de la room, joueurs, spectres
│   │   │   │   └── uiSlice.ts              # État UI : overlay, messages d'erreur
│   │   │   └── middleware/
│   │   │       └── socketMiddleware.ts     # Pont Redux ↔ Socket.IO
│   │   │
│   │   ├── game/                           # ⚠️  FONCTIONS PURES UNIQUEMENT — zéro 'this', zéro effet de bord
│   │   │   ├── board.ts                    # Création, validation, merge, pénalités
│   │   │   ├── pieces.ts                   # Définitions des 7 tetriminos + rotations
│   │   │   ├── movement.ts                 # Déplacements, wall kick, hard drop
│   │   │   ├── lines.ts                    # Détection et effacement de lignes
│   │   │   ├── spectrum.ts                 # Calcul du spectre à partir du plateau
│   │   │   └── gravity.ts                  # Calcul de l'intervalle de chute selon le niveau
│   │   │
│   │   ├── hooks/
│   │   │   ├── useSocket.ts                # Accès au singleton socket
│   │   │   ├── useGameLoop.ts              # Boucle de gravité automatique
│   │   │   └── useKeyboard.ts              # Capture des touches clavier
│   │   │
│   │   ├── socket/
│   │   │   ├── socket.ts                   # Instance socket.io-client (singleton)
│   │   │   └── events.ts                   # Réexport des constantes depuis shared/events.ts
│   │   │
│   │   └── types/
│   │       └── index.ts                    # Types TypeScript propres au client
│   │
│   ├── public/                             # Favicon, polices, assets statiques
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── tests/
│   └── game/                               # Tests Jest des fonctions pures uniquement
│       ├── board.test.ts
│       ├── pieces.test.ts
│       ├── movement.test.ts
│       ├── lines.test.ts
│       └── spectrum.test.ts
│
├── .env.local                              # Variables d'environnement (gitignored !)
├── .gitignore
└── README.md
```

### Principes de séparation des responsabilités

- **`app/`** : orchestration des pages et du layout — initialise Redux et la socket, délègue tout le reste
- **`components/`** : affichage pur — lit le store Redux, ne calcule rien, n'émet rien directement
- **`store/`** : source de vérité unique de l'état — les composants lisent ici, les hooks écrivent ici
- **`game/`** : cerveau du jeu — fonctions pures sans effets de bord, indépendantes de React et de Redux
- **`hooks/`** : effets et boucles — font le lien entre les événements (temps, clavier, socket) et le store
- **`socket/`** : configuration technique de la connexion — aucune logique métier
- **Règle d'import stricte** : `game/` ne doit jamais importer depuis `store/`, `hooks/`, `components/` ni `socket/` — c'est la seule couche vraiment isolée

---

## 3. Configuration Next.js et contraintes App Router

### Pourquoi Next.js App Router ?
- Le sujet impose l'URL `/<room>/<player>` — l'App Router gère nativement les **routes dynamiques imbriquées** via les dossiers `[room]` et `[player]`
- L'App Router de Next.js 14+ est le modèle recommandé pour les nouvelles applications
- Il permet une séparation claire entre les **Server Components** (rendu côté serveur, sans état) et les **Client Components** (interactifs, avec hooks et état)

### Contrainte critique : la directive `'use client'`
- Par défaut dans l'App Router, **tous les composants sont des Server Components**
- Un Server Component ne peut pas utiliser : `useState`, `useEffect`, `useSelector`, `socket.io`, `window`, `document`...
- **Tout composant interactif doit déclarer `'use client'` en première ligne**
- Cette directive se **propage vers le bas** : si un composant parent est `'use client'`, tous ses enfants le sont aussi implicitement
- **Stratégie recommandée** : déclarer `'use client'` le plus bas possible dans l'arbre — idéalement au niveau de la page `[room]/[player]/page.tsx` et du layout, pas dans chaque composant individuel
- Le `layout.tsx` global doit être `'use client'` car il contient le `Provider` Redux

### Configuration `next.config.ts`
- Le fichier de configuration Next.js doit inclure une option `webpack` pour exclure certains modules Node.js (`utf-8-validate`, `bufferutil`) qui sont des dépendances optionnelles de Socket.IO non disponibles dans le navigateur
- Sans cette configuration, Next.js tentera de bundler ces modules et produira des erreurs de build

### Variables d'environnement
- `NEXT_PUBLIC_SERVER_URL` : URL complète du serveur backend Node.js
  - Préfixée `NEXT_PUBLIC_` car elle doit être accessible dans le navigateur (côté client)
  - Les variables sans ce préfixe sont accessibles uniquement côté serveur Next.js — **ne pas oublier ce préfixe**
  - Valeur par défaut en développement : `http://localhost:3001`
- **Jamais de secrets dans les variables `NEXT_PUBLIC_`** — elles sont exposées dans le bundle JavaScript envoyé au navigateur

### `tsconfig.json`
- Doit inclure un alias de chemin `@/*` pointant vers `./src/*` pour éviter les imports relatifs profonds (`../../../`)
- L'option `strict: true` doit être activée — elle force un typage rigoureux qui prévient de nombreuses erreurs à l'exécution
- `moduleResolution: "bundler"` est recommandé pour Next.js 14+

---

## 4. Routing — Gestion de l'URL de jeu

### Schéma d'URL imposé par le sujet
- Le serveur backend s'attend à recevoir un `JOIN_ROOM` avec `{ room, playerName }`
- L'URL `http://<host>:<port>/<room>/<player_name>` encode directement ces deux paramètres
- Next.js App Router transforme les dossiers `[room]` et `[player]` en paramètres dynamiques extraits automatiquement

### `app/page.tsx` — Page d'accueil
- Affichée quand l'utilisateur arrive sur `/` sans paramètres
- Contient un formulaire simple avec deux champs : nom de la room et pseudo du joueur
- **Validation côté client** avant la navigation :
  - Les deux champs sont obligatoires et non vides
  - Les caractères autorisés sont limités (alphanumérique, tiret, underscore) — cohérence avec la sanitisation côté serveur
  - Longueur maximale : 20 caractères pour le pseudo, 30 pour la room
- Au submit : utilise `router.push()` de Next.js pour naviguer vers `/<room>/<player>` — **pas de rechargement de page**, c'est une SPA
- Ne doit pas initialiser de socket ni de connexion

### `app/[room]/[player]/page.tsx` — Page de jeu
- Point d'entrée unique de toute la session de jeu
- **Responsabilités au montage** (dans l'ordre) :
  1. Extraire `room` et `player` depuis les paramètres d'URL via `useParams()`
  2. Décoder les valeurs URL (`decodeURIComponent`) au cas où le nom contient des caractères encodés
  3. Dispatcher `setRoomInfo({ roomName, playerName })` dans Redux pour stocker l'identité locale
  4. Obtenir l'instance socket via `getSocket()` (singleton — ne crée pas une nouvelle connexion)
  5. Émettre `JOIN_ROOM` avec `{ room, playerName }` vers le serveur
- **Responsabilités au démontage** (cleanup du `useEffect`) :
  - Déconnecter la socket via `socket.disconnect()` et réinitialiser le singleton
  - Sans ce cleanup, la socket reste ouverte si le joueur navigue ailleurs
- **Affichage conditionnel** selon `gameStatus` dans le store :
  - `'waiting'` → afficher `<Lobby />`
  - `'playing'` ou `'ended'` → afficher `<GameView />`
  - En surimpression, si `overlayVisible === true` → afficher `<GameOverlay />`

### `app/layout.tsx` — Layout global
- Wrapping de toute l'application avec le `Provider` Redux
- Doit être `'use client'` car `Provider` est un composant React interactif
- Contient les balises `<html>` et `<body>`
- Importe `globals.css`
- Ne contient aucune logique de jeu ni de socket — uniquement la configuration des providers

---

## 5. Logique de jeu — Fonctions Pures

> ⚠️ **Règle absolue** : ces fichiers constituent la couche la plus importante et la plus testable du frontend. Toute fonction ici doit être **pure** : mêmes entrées → même sortie, aucun effet de bord, aucune mutation du paramètre d'entrée, aucun accès à `window`, `document`, Redux ou Socket.

### `game/board.ts` — Création et manipulation du plateau

**Représentation du plateau**
- Le plateau est un tableau 2D de type `CellValue[][]` — 20 lignes de 10 colonnes
- Chaque cellule est un entier :
  - `0` = vide
  - `1` à `7` = type de pièce posée (I=1, O=2, T=3, S=4, Z=5, J=6, L=7)
  - `8` = cellule de pénalité **indestructible** — ne peut jamais être effacée
- Ce tableau est **immuable** : toutes les fonctions retournent un **nouveau tableau**, jamais une mutation

**Fonctions à implémenter**

- `createBoard()` → `BoardType`
  - Retourne un tableau 2D de 20 lignes × 10 colonnes rempli de `0`
  - Utilise `Array.from` pour garantir que chaque ligne est une instance indépendante (pas de références partagées)
  - Appelée à l'initialisation et à chaque `resetGame()`

- `isValidPosition(board, piece)` → `boolean`
  - Itère sur chaque cellule non-nulle de la matrice de forme de la pièce
  - Calcule la position absolue sur le plateau : `boardX = piece.position.x + col`, `boardY = piece.position.y + row`
  - Vérifie les limites horizontales : `boardX >= 0` et `boardX < BOARD_WIDTH`
  - Vérifie la limite basse : `boardY < BOARD_HEIGHT`
  - **Autorise les positions avec `boardY < 0`** (au-dessus du plateau visible) — nécessaire pour le spawn et les rotations en haut du plateau
  - Vérifie que la cellule cible du plateau est `0` (vide) — les cellules de pénalité (valeur `8`) bloquent aussi la pièce
  - Retourne `false` dès la première violation trouvée

- `mergePiece(board, piece)` → `BoardType`
  - Crée une copie profonde du plateau : `board.map(row => [...row])`
  - Pour chaque cellule non-nulle de la forme de la pièce, écrit la valeur du type dans la copie
  - Ignore les cellules dont `boardY < 0` (partie invisible du plateau)
  - Utilisée pour "figer" une pièce après qu'elle ne peut plus descendre

- `addPenaltyLines(board, count)` → `BoardType`
  - Supprime les `count` premières lignes du haut (les plus anciennes)
  - Génère `count` nouvelles lignes de pénalité pour le bas : toutes les cellules à `8` **sauf une position aléatoire** laissée à `0` (le "trou" qui permet theoriquement de s'en sortir)
  - Retourne la concaténation : lignes restantes + lignes de pénalité en bas
  - **Important** : ces lignes ne sont appliquées que lors du prochain `lockPiece`, pas immédiatement — elles s'accumulent dans `penaltyQueue`

- `pieceTypeToValue(type)` → `CellValue`
  - Fonction utilitaire : convertit `'I'` → `1`, `'O'` → `2`, etc.

### `game/pieces.ts` — Définitions des Tetriminos

**Principe de représentation**
- Chaque tetrimino est défini par **4 matrices de rotation** pré-calculées, stockées dans un objet constant
- Une matrice de rotation est un tableau 2D de `0` et `1` — `1` = bloc présent, `0` = vide
- Toutes les matrices font 4×4 pour la cohérence (même si certaines pièces sont plus petites)
- Ce choix élimine tout calcul de rotation à l'exécution — la rotation est simplement un changement d'index

**Les 7 tetriminos et leurs 4 rotations**
- `I` : barre de 4 blocs — 2 états visuellement distincts (horizontal et vertical), mais 4 états pour la symétrie
- `O` : carré 2×2 — 1 seul état visuel, les 4 rotations sont identiques
- `T` : forme en T — 4 états distincts
- `S` : décalé vers la droite — 2 états visuellement distincts
- `Z` : décalé vers la gauche — 2 états visuellement distincts
- `J` : L inversé — 4 états distincts
- `L` : L normal — 4 états distincts

**Fonctions à implémenter**

- `getPieceShape(type, rotation)` → `PieceShape`
  - Accède directement à `TETRIMINOS[type][rotation % 4]`
  - Le modulo `4` garantit qu'on ne sort jamais des bornes même si `rotation` dépasse 3

- `getNextRotation(rotation)` → `number`
  - Retourne `(rotation + 1) % 4`

- `createActivePiece(serverPiece)` → `ActivePiece`
  - Convertit une `IPiece` reçue du serveur en `ActivePiece` locale
  - Ajoute la forme initiale (rotation 0) et initialise `rotation` à `0`
  - C'est le seul endroit où une pièce serveur devient une pièce cliente

- `PIECE_COLORS` : objet constant associant chaque type à sa couleur CSS hexadécimale
  - I → `#00f0f0` (Cyan), O → `#f0f000` (Jaune), T → `#a000f0` (Violet)
  - S → `#00f000` (Vert), Z → `#f00000` (Rouge), J → `#0000f0` (Bleu), L → `#f0a000` (Orange)
  - Utilisé par `Cell.tsx` pour la couleur de fond de chaque cellule

### `game/movement.ts` — Déplacements et Collisions

**Principe général** : chaque fonction de mouvement retourne soit la nouvelle position valide, soit la position originale inchangée (ou `null` pour signaler un blocage irrémédiable).

**Fonctions à implémenter**

- `moveLeft(board, piece)` → `ActivePiece`
  - Construit une pièce candidate avec `position.x - 1`
  - Appelle `isValidPosition` sur le candidat
  - Retourne le candidat si valide, la pièce originale sinon

- `moveRight(board, piece)` → `ActivePiece`
  - Identique mais avec `position.x + 1`

- `moveDown(board, piece)` → `ActivePiece | null`
  - Construit un candidat avec `position.y + 1`
  - Retourne le candidat si valide
  - Retourne **`null`** si invalide — ce `null` est le signal que la pièce doit être figée (`lockPiece`)
  - **Différence importante avec les autres mouvements** : retourner `null` plutôt que la pièce originale permet de distinguer "la pièce ne peut pas descendre" de "la pièce n'a pas bougé"

- `rotatePiece(board, piece)` → `ActivePiece`
  - Calcule la prochaine rotation via `getNextRotation(piece.rotation)`
  - Construit un candidat avec la nouvelle forme et le nouvel index de rotation
  - Tente la rotation à la position actuelle (`isValidPosition`) → OK → retourne
  - **Wall kick** — si la rotation directe est bloquée, tente dans cet ordre :
    1. Décalage `x + 1` (kick vers la droite)
    2. Décalage `x - 1` (kick vers la gauche)
    3. Décalage `x + 2` (kick double droite — utile pour la pièce `I` près du bord gauche)
    4. Décalage `x - 2` (kick double gauche — utile pour la pièce `I` près du bord droit)
  - Si aucun des kicks ne fonctionne → retourne la pièce originale sans rotation
  - **Pourquoi le wall kick ?** Sans lui, le joueur ne peut pas tourner une pièce contre un mur, ce qui est frustrant et non-standard

- `hardDrop(board, piece)` → `ActivePiece`
  - Boucle en appelant `moveDown` jusqu'à ce que `moveDown` retourne `null`
  - La dernière position valide est la position de hard drop
  - Après un hard drop, `lockPiece` doit être dispatché immédiatement

- `getGhostPiece(board, piece)` → `ActivePiece`
  - Appelle `hardDrop` mais sans déclencher de lock
  - Retourne la position où la pièce va atterrir — utilisée uniquement pour l'affichage de la pièce fantôme

### `game/lines.ts` — Gestion des lignes

**Fonctions à implémenter**

- `isLineComplete(row)` → `boolean`
  - Retourne `true` si chaque cellule de la ligne est différente de `0`
  - Les cellules de pénalité (valeur `8`) comptent comme remplies — elles participent à compléter une ligne mais ne sont jamais effacées

- `getCompletedLineIndices(board)` → `number[]`
  - Réduit le tableau du plateau pour retourner les indices des lignes complètes
  - Utilisé par `clearLines`

- `clearLines(board)` → `{ board: BoardType, linesCleared: number }`
  - Filtre les lignes non complètes
  - Ajoute en haut le nombre de lignes vides nécessaires pour maintenir la hauteur à 20
  - Retourne le nouveau plateau ET le nombre de lignes effacées
  - **Le nombre de lignes effacées est la valeur envoyée au serveur via `LINES_CLEARED`**

- `getPenaltyCount(linesCleared)` → `number`
  - Calcule `Math.max(0, linesCleared - 1)`
  - Règle du sujet : 1 effacée → 0, 2 → 1, 3 → 2, 4 → 3
  - **Note** : cette fonction n'est pas utilisée côté client — le client envoie le nombre de lignes effacées et c'est le serveur qui calcule la pénalité. Cette fonction peut néanmoins exister ici à des fins de documentation et de test

### `game/spectrum.ts` — Calcul du spectre

> Fichier **absent du brouillon original** — ajout nécessaire pour respecter la séparation des responsabilités.

**Rôle**
- Le spectre est la représentation compressée du plateau d'un joueur envoyée aux adversaires
- C'est un tableau de **10 valeurs entières** (une par colonne), chaque valeur représentant la hauteur occupée de cette colonne
- Calculé à chaque `lockPiece` et envoyé via `UPDATE_SPECTRUM`

**Fonctions à implémenter**

- `computeSpectrum(board)` → `number[]`
  - Pour chaque colonne (0 à 9), parcourt les lignes de haut en bas
  - Dès qu'une cellule non-nulle est trouvée, la hauteur de cette colonne est `BOARD_HEIGHT - rowIndex`
  - Si aucune cellule non-nulle n'est trouvée, la hauteur est `0`
  - Retourne un tableau de 10 valeurs entre `0` (colonne vide) et `20` (colonne pleine jusqu'en haut)
  - **Cette fonction est appellée dans le hook `useGameLoop` après chaque `lockPiece`, pas dans un reducer Redux**

### `game/gravity.ts` — Vitesse de chute

**Rôle**
- Calcule l'intervalle de temps (en millisecondes) entre deux descentes automatiques de la pièce
- Dans la version de base (sans système de niveaux), retourne une valeur constante de `800ms`
- Structuré comme une fonction para permettre l'extension future (bonus : niveaux avec vitesse croissante)

**Fonctions à implémenter**

- `getGravityInterval(level)` → `number`
  - `level = 1` → `800ms` (vitesse de base)
  - Si un système de niveaux est implémenté : formule décroissante avec un minimum de `100ms`
  - Utilisée dans `useGameLoop` pour configurer le `setInterval`

---

## 6. Gestion de l'état Redux

### Principes généraux
- **Redux Toolkit** est utilisé — il simplifie la syntaxe Immer (mutations apparentes dans les reducers, mais immutabilité garantie en interne) et la configuration du store
- Le store est la **seule source de vérité** de l'état de l'application
- Les composants ne lisent que le store, n'écrivent jamais directement dessus
- Les hooks lisent le store, écrivent via `dispatch`
- Le socket ne communique jamais directement avec les composants — tout passe par Redux

### `store/index.ts` — Configuration du store
- Combine les 3 reducers : `game`, `room`, `ui`
- Ajoute le `socketMiddleware` à la chaîne de middlewares par défaut de Redux Toolkit
- Exporte les types inférés `RootState` et `AppDispatch` — nécessaires pour typer les hooks

### `store/hooks.ts` — Hooks Redux typés
- Exporte `useAppDispatch` : wrapper de `useDispatch` typé avec `AppDispatch`
- Exporte `useAppSelector` : wrapper de `useSelector` typé avec `RootState`
- **Toujours utiliser ces hooks typés** à la place des versions génériques — le compilateur TypeScript pourra vérifier les sélecteurs

### `store/slices/gameSlice.ts` — État du plateau local

**Interface de l'état**
- `board` : `BoardType` — le plateau **figé** (sans la pièce active) — 20 lignes × 10 colonnes de `CellValue`
- `activePiece` : `ActivePiece | null` — la pièce en train de tomber — `null` entre le lock et la réception de la prochaine pièce
- `nextPiece` : `IPiece | null` — la pièce suivante reçue du serveur pour l'aperçu — `null` jusqu'à la 2ème réception
- `status` : `'idle' | 'playing' | 'lost' | 'won'` — statut local du jeu pour ce joueur
- `penaltyQueue` : `number` — nombre de lignes de pénalité reçues mais pas encore appliquées
- `linesJustCleared` : `number` — ⚠️ **Champ absent du brouillon, critique** — nombre de lignes effacées lors du dernier `lockPiece` — lu par le `socketMiddleware` pour émettre `LINES_CLEARED` **après** que le reducer a traité l'action

**Actions (reducers)**

- `setActivePiece(piece: IPiece)` :
  - Crée une `ActivePiece` à partir de l'`IPiece` serveur via `createActivePiece()`
  - Vérifie si la position de spawn est valide avec `isValidPosition()`
  - Si **invalide** → passe `status` à `'lost'` — c'est la détection du game over local
  - Si valide → stocke la pièce dans `activePiece`

- `setNextPiece(piece: IPiece)` :
  - Stocke simplement la pièce dans `nextPiece` pour l'affichage de l'aperçu

- `movePieceLeft()` / `movePieceRight()` :
  - Appelle `moveLeft()` / `moveRight()` depuis `game/movement.ts`
  - Met à jour `activePiece` avec le résultat

- `movePieceDown()` :
  - Appelle `moveDown()` depuis `game/movement.ts`
  - Si le résultat est non-null → met à jour la position
  - Si le résultat est null → ne fait **rien** (le lock est géré dans `useGameLoop`, pas ici)

- `rotatePiece()` :
  - Appelle `rotatePiece()` depuis `game/movement.ts`
  - Met à jour `activePiece` avec le résultat (qui peut inclure un wall kick)

- `hardDropPiece()` :
  - Appelle `hardDrop()` depuis `game/movement.ts`
  - Met à jour `activePiece` avec la position finale
  - Ne déclenche **pas** le lock ici — le dispatch de `lockPiece` suit immédiatement dans `useKeyboard`

- `lockPiece()` :
  - C'est l'action la plus complexe — elle enchaîne plusieurs opérations en séquence :
    1. Si `penaltyQueue > 0` : applique les lignes de pénalité accumulées via `addPenaltyLines()`, remet `penaltyQueue` à `0`
    2. Fusionne la pièce active dans le plateau via `mergePiece()`
    3. Met `activePiece` à `null`
    4. Appelle `clearLines()` sur le nouveau plateau
    5. Met à jour `board` avec le plateau nettoyé
    6. Stocke le nombre de lignes effacées dans `linesJustCleared`
  - **Après cette action**, le `socketMiddleware` intercepte le résultat et émet les événements nécessaires

- `addPenaltyLines(count: number)` :
  - Incrémente `penaltyQueue` du nombre reçu
  - Les pénalités ne sont **pas appliquées immédiatement** — elles s'accumulent jusqu'au prochain `lockPiece`
  - Ce choix évite des effets visuels désagréables (le plateau ne saute pas pendant qu'on joue)

- `setGameStatus(status)` :
  - Change le statut local — utilisé par le middleware quand `GAME_OVER_PLAYER` est envoyé

- `resetGame()` :
  - Réinitialise tout l'état à ses valeurs initiales — appelé quand `GAME_STARTED` est reçu

### `store/slices/roomSlice.ts` — État de la room

**Interface de l'état**
- `roomName` : `string` — le nom de la room extrait de l'URL
- `playerName` : `string` — le pseudo du joueur local extrait de l'URL
- `players` : `IPlayerInfo[]` — liste complète des joueurs dans la room avec leur statut
- `isHost` : `boolean` — ce joueur est-il l'hôte ? Détermine l'affichage des boutons "Démarrer" et "Rejouer"
- `spectrums` : `Record<string, number[]>` — spectres des adversaires, indexés par nom de joueur
- `gameStatus` : `'waiting' | 'playing' | 'ended'` — statut de la room côté serveur
- `winner` : `string | null` — nom du vainqueur après `GAME_OVER`, null sinon

**Actions (reducers)**

- `setRoomInfo({ roomName, playerName })` : stocké immédiatement lors de la navigation vers la page de jeu, avant même la connexion socket
- `setRoomState(payload)` : hydrate l'état complet depuis le payload `ROOM_STATE` du serveur
- `playerJoined(player)` : ajoute un joueur à la liste, en évitant les doublons
- `playerLeft({ playerName })` : retire un joueur et supprime son spectre
- `hostChanged({ newHost })` : met à jour le flag `isHost` dans la liste des joueurs + recalcule `isHost` local
- `updateSpectrum({ playerName, spectrum })` : met à jour le spectre d'un adversaire
- `playerEliminated({ playerName })` : passe `isAlive` à `false` pour ce joueur dans la liste
- `gameStarted()` : passe `gameStatus` à `'playing'`, réinitialise `winner` à `null`, remet tous les joueurs `isAlive` à `true`, vide les spectres
- `gameEnded({ winner })` : passe `gameStatus` à `'ended'`, stocke le vainqueur

### `store/slices/uiSlice.ts` — État de l'interface

**Interface de l'état**
- `overlayVisible` : `boolean` — afficher l'overlay de fin de partie ?
- `overlayMessage` : `string` — texte à afficher ("Game Over", "You Win!", nom du vainqueur...)
- `isWinner` : `boolean` — pour choisir le style visuel de l'overlay (vert victoire vs rouge défaite)
- `errorMessage` : `string | null` — message d'erreur éventuel à afficher à l'utilisateur

**Actions (reducers)**
- `showOverlay({ message, isWinner })` : affiche l'overlay avec le message approprié
- `hideOverlay()` : cache l'overlay et remet les valeurs par défaut
- `setError(message | null)` : affiche ou efface un message d'erreur

### `store/middleware/socketMiddleware.ts` — Le pont Redux ↔ Socket.IO

> C'est la pièce architecturale la plus importante du frontend. Elle définit **quand** et **comment** le client parle au serveur.

**Principe de fonctionnement**
- Un middleware Redux intercepte toutes les actions qui transitent par le store
- Il a deux rôles :
  1. **Abonner aux événements Socket.IO entrants** et les traduire en `dispatch` d'actions Redux
  2. **Intercepter certaines actions Redux** après leur traitement par les reducers et émettre les événements socket correspondants

**Initialisation — abonnement aux événements socket entrants**
- Cette partie est exécutée **une seule fois** au démarrage du store
- Elle enregistre des handlers `socket.on(...)` pour chaque événement reçu du serveur

| Événement reçu | Action(s) dispatchées |
|---|---|
| `ROOM_STATE` | `setRoomState(payload)` |
| `PLAYER_JOINED` | `playerJoined(player)` |
| `PLAYER_LEFT` | `playerLeft(playerName)` |
| `HOST_CHANGED` | `hostChanged(newHost)` |
| `GAME_STARTED` | `gameStarted()` + `setGameStatus('playing')` + `hideOverlay()` + `resetGame()` + **émet immédiatement 2× `REQUEST_PIECE`** |
| `NEW_PIECE` | Si `activePiece === null` → `setActivePiece(piece)` ; sinon → `setNextPiece(piece)` |
| `SPECTRUM_UPDATE` | `updateSpectrum({ playerName, spectrum })` |
| `PENALTY_LINES` | `addPenaltyLines(count)` |
| `PLAYER_ELIMINATED` | `playerEliminated(playerName)` + si c'est le joueur local → `setGameStatus('lost')` + `showOverlay(...)` |
| `GAME_OVER` | `gameEnded({ winner })` + `showOverlay(...)` |

**Cas particulier de `GAME_STARTED` — le double `REQUEST_PIECE`**
- À la réception de `GAME_STARTED`, le client doit envoyer **deux** `REQUEST_PIECE` consécutifs
- Le premier servira à obtenir la pièce active (celle qui va tomber immédiatement)
- Le second servira à obtenir la pièce suivante (affichée dans l'aperçu `NextPiece`)
- Les deux réponses `NEW_PIECE` arrivent séquentiellement — le middleware les dirige : la première vers `setActivePiece`, la deuxième vers `setNextPiece`

**Interception des actions Redux sortantes**
- Le middleware laisse passer toutes les actions normalement vers les reducers
- Après que les reducers ont traité l'action, il inspecte le **nouvel état** et émet les événements socket si nécessaire

| Action interceptée | Événement(s) émis |
|---|---|
| `lockPiece` | Si `linesJustCleared > 0` → émet `LINES_CLEARED` avec le nombre de lignes ; calcule le spectre via `computeSpectrum()` sur le nouveau plateau → émet `UPDATE_SPECTRUM` ; émet `REQUEST_PIECE` pour demander la prochaine pièce |
| `setGameStatus('lost')` | Émet `GAME_OVER_PLAYER` au serveur |

**Pourquoi le spectre est calculé dans le middleware et pas dans un reducer ?**
- Les reducers doivent rester purs et déterministes
- `computeSpectrum` dépend du plateau **après** effacement des lignes — ce plateau n'est disponible qu'après l'exécution de `lockPiece`
- Le middleware lit le nouvel état après le reducer, ce qui lui permet d'accéder au bon plateau

---

## 7. Socket.IO Client — Connexion et Singleton

### Pattern Singleton — justification
- Un seul et unique objet socket doit exister pendant toute la session du joueur
- Créer une nouvelle socket à chaque render de composant serait catastrophique : multiplication des connexions, événements dupliqués, memory leaks
- Le singleton est implémenté au niveau du module : une variable de module conserve l'instance entre les renders

### `socket/socket.ts` — Instance singleton
- Déclare une variable `socketInstance` au niveau du module, initialisée à `null`
- Exporte une fonction `getSocket()` qui :
  - Si `socketInstance === null` : crée une nouvelle connexion avec `io(SERVER_URL, options)` et la stocke
  - Sinon : retourne l'instance existante
- Exporte une fonction `resetSocket()` :
  - Déconnecte et met `socketInstance` à `null`
  - Appelée dans le cleanup du `useEffect` de la page `[room]/[player]/page.tsx`

**Options de connexion recommandées**
- `autoConnect: true` : se connecte automatiquement à la création
- `reconnection: true` : tente de se reconnecter automatiquement en cas de coupure réseau
- `reconnectionAttempts: 5` : 5 tentatives avant d'abandonner
- `reconnectionDelay: 1000` : 1 seconde entre les tentatives
- `transports: ['websocket', 'polling']` : WebSocket en priorité, polling HTTP en fallback

### `socket/events.ts` — Réexport des constantes
- Ce fichier réexporte simplement le contenu de `shared/events.ts`
- Évite d'avoir des imports `../../shared/` éparpillés dans tout le code client
- Point d'accès unique aux noms d'événements côté client

---

## 8. Hooks Personnalisés

### `hooks/useSocket.ts`
- Accède à l'instance singleton via `getSocket()`
- Vérifie que la socket est connectée — si non, appelle `socket.connect()`
- Retourne l'instance socket pour les cas où un composant en aurait besoin directement
- **Ne s'abonne à aucun événement** — c'est le rôle du `socketMiddleware`

### `hooks/useGameLoop.ts` — La boucle de gravité

> C'est le hook le plus délicat techniquement. Deux problèmes majeurs à résoudre : le **choix entre `setInterval` et `requestAnimationFrame`**, et les **stale closures**.

**`setInterval` vs `requestAnimationFrame`**
- `requestAnimationFrame` est conçu pour les animations fluides synchronisées avec le refresh écran (60fps) — il est adapté pour les rendus visuels continus
- `setInterval` est adapté pour les événements à intervalles fixes indépendants du refresh écran — **c'est le bon choix pour la gravité du Tetris**
- La gravité doit tomber toutes les 800ms précisément, peu importe le framerate du navigateur
- Conclusion : **utiliser `setInterval` pour la gravité**

**Le problème des stale closures**
- `setInterval` capture les valeurs de `board`, `activePiece`, `gameStatus` au moment de sa création (lors du premier render)
- Si ces valeurs changent après (ce qu'elles font constamment pendant le jeu), le `setInterval` continue de voir les **valeurs obsolètes**
- Solution : utiliser des **refs** (`useRef`) pour stocker les valeurs qui doivent être à jour dans le callback
  - `boardRef.current = board` : mis à jour à chaque render
  - `activePieceRef.current = activePiece` : mis à jour à chaque render
  - Le callback du `setInterval` lit `.current` plutôt que la variable directe

**Logique du hook**
- S'active uniquement si `gameStatus === 'playing'` — ne tourne pas en lobby ni après game over
- Crée un `setInterval` avec l'intervalle retourné par `getGravityInterval()`
- À chaque tick :
  1. Vérifie que `gameStatus === 'playing'` via la ref
  2. Vérifie qu'une pièce active existe via la ref
  3. Tente `moveDown(boardRef.current, activePieceRef.current)`
  4. Si le résultat est non-null → dispatch `movePieceDown()`
  5. Si le résultat est null → dispatch `lockPiece()` **puis** calcule le spectre et l'émet via socket
- Retourne un cleanup qui appelle `clearInterval` pour éviter les memory leaks
- **Dépendance du `useEffect`** : uniquement `gameStatus` — le recréer à chaque changement de statut garantit qu'il démarre au bon moment

### `hooks/useKeyboard.ts` — Capture des entrées clavier

**Logique**
- Enregistre un listener `keydown` sur `window` via `addEventListener`
- Retourne un cleanup qui appelle `removeEventListener`

**Gestion des touches**
- `ArrowLeft` → dispatch `movePieceLeft()`
- `ArrowRight` → dispatch `movePieceRight()`
- `ArrowUp` → dispatch `rotatePiece()`
- `ArrowDown` → dispatch `movePieceDown()` (soft drop : descend d'une case manuellement)
- `Space` → dispatch `hardDropPiece()` puis immédiatement dispatch `lockPiece()` (le hard drop doit verrouiller instantanément)

**Prévention du comportement par défaut**
- `ArrowLeft`, `ArrowRight`, `ArrowDown`, `ArrowUp` et `Space` déclenchent nativement le scroll de la page
- Appeler `event.preventDefault()` pour ces touches uniquement — ne pas le faire pour toutes les touches (cela bloquerait les raccourcis clavier globaux)

**Condition d'activation**
- Le hook ne dispatch rien si `gameStatus !== 'playing'` — empêche de jouer pendant le lobby ou après game over
- Vérification via une ref pour éviter une stale closure (même problème qu'avec `useGameLoop`)

**Répétition de touche (key repeat)**
- Quand on maintient une touche, le navigateur déclenche des événements `keydown` répétés avec un délai initial puis un intervalle régulier
- Ce comportement est **souhaitable** pour les mouvements latéraux mais peut causer des drops accidentels avec `Space`
- Solution : filtrer les événements répétés pour `Space` en vérifiant `event.repeat === true`

---

## 9. Composants React

> **Règle absolue** : aucun composant ne contient de logique de jeu. Ils lisent le store Redux et affichent. C'est tout.
> **Règle de style** : tous les composants utilisent des **CSS Modules** (fichiers `.module.css`) — pas de `style` inline, pas de bibliothèque CSS-in-JS.

### `app/layout.tsx` + `app/[room]/[player]/page.tsx`

Décrits en section 4 — voir ci-dessus.

### `components/GameView/GameView.tsx` — Conteneur principal de jeu

> Composant **absent du brouillon** — ajout nécessaire pour structurer proprement l'écran de jeu.

- Conteneur parent qui organise les zones de l'écran pendant la partie
- Layout en `flexbox` horizontal : zone gauche (spectres), zone centrale (plateau), zone droite (infos)
- Instancie `<Board_Display />`, `<GameInfo />`, `<Spectrum />`
- **C'est ici que les hooks `useGameLoop()` et `useKeyboard()` sont appelés** — en un seul endroit, quand le composant est monté
- Raison : ces hooks doivent être actifs pendant toute la durée de la partie, pas seulement quand un sous-composant spécifique est visible

### `components/Board/Board_Display.tsx` — Le plateau de jeu

**Ce qu'il reçoit depuis Redux**
- `board` : le plateau figé (depuis `gameSlice.board`)
- `activePiece` : la pièce en cours de chute (depuis `gameSlice.activePiece`)

**Ce qu'il calcule pour l'affichage**
- `ghostPiece` : la pièce fantôme calculée via `getGhostPiece(board, activePiece)` — position d'atterrissage prévisuelle
- `displayBoard` : le plateau d'affichage, résultat de 3 opérations successives :
  1. Partir du plateau figé (`board`)
  2. Y fusionner la pièce fantôme avec un type spécial `'ghost'` via `mergePiece()`
  3. Y superposer la pièce active via `mergePiece()`
- Ce calcul est fait dans le composant, pas dans un reducer — c'est de la présentation, pas de l'état

**Rendu**
- `div` avec `display: grid` et `grid-template-columns: repeat(10, 1fr)` — les 200 cellules s'organisent automatiquement en 10 colonnes
- Pour chaque cellule : un composant `<Cell value={cell} />` avec une `key` unique `rowIndex-colIndex`
- Le composant est **pur** : pour les mêmes `board` et `activePiece`, il rend toujours la même chose

### `components/Cell/Cell.tsx` — La cellule individuelle

- Composant le plus simple : reçoit une `CellValue` (0 à 8, plus un type optionnel `'ghost'`)
- Détermine sa couleur via `PIECE_COLORS[value]`
- Les cellules vides (`0`) ont un fond transparent et une bordure très légère
- Les cellules remplies ont la couleur du tetrimino + effet 3D via `box-shadow` (bordure claire en haut-gauche, sombre en bas-droite)
- La cellule fantôme (`'ghost'`) affiche la couleur du tetrimino en très faible opacité avec une bordure en pointillés

### `components/Piece/NextPiece.tsx` — Aperçu de la pièce suivante

- Lit `nextPiece` depuis `gameSlice`
- Récupère la forme à rotation 0 via `getPieceShape(nextPiece.type, 0)`
- Affiche une mini-grille 4×4 avec `display: grid` et `grid-template-columns: repeat(4, 1fr)`
- Les cellules non-nulles sont colorées avec `PIECE_COLORS[nextPiece.type]`
- Affiche `null` (rien) si `nextPiece === null`

### `components/Spectrum/Spectrum.tsx` — Vue des adversaires

- Lit `players` et `spectrums` depuis `roomSlice`
- Lit `playerName` pour exclure le joueur local de l'affichage
- Pour chaque adversaire (joueurs sauf soi-même) :
  - Affiche son nom (barré en rouge s'il est éliminé)
  - Affiche sa mini-grille de spectre : 10 colonnes, hauteur variable
  - La grille de spectre utilise `display: flex` par colonne, chaque colonne se remplit depuis le bas
  - Les cellules occupées du spectre sont colorées en rouge (`#e74c3c`) — couleur distincte du plateau principal
- Se met à jour automatiquement quand `spectrums` dans Redux change (via `SPECTRUM_UPDATE` reçu du serveur)
- **Affiche `null`** si aucun adversaire (mode solo) — pas de section vide

### `components/GameInfo/GameInfo.tsx` — Panneau d'informations

- Agrège les informations secondaires à droite du plateau
- Contient : `<NextPiece />` + nom de la room + liste des joueurs avec leur statut
- N'active aucun hook, ne dispatch rien
- Mise à jour passive via le store Redux

### `components/Lobby/Lobby.tsx` — Salle d'attente

- Affiché quand `gameStatus === 'waiting'`
- Lit `players`, `isHost`, `roomName` depuis `roomSlice`
- Affiche la liste des joueurs connectés en temps réel (mise à jour automatique via `PLAYER_JOINED`/`PLAYER_LEFT`)
- Affiche un badge "👑 Hôte" à côté du joueur hôte
- Affiche le bouton "▶ Démarrer" **uniquement si `isHost === true`**
  - Le clic émet directement `START_GAME` via `getSocket().emit()` — c'est l'une des rares émissions directes depuis un composant (car ce n'est pas une conséquence d'une action Redux)
  - Le bouton est désactivé si `players.length < 1`
- Affiche un message d'attente pour les non-hôtes : "En attente que l'hôte démarre..."

### `components/Overlay/GameOverlay.tsx` — Écran de fin de partie

- Affiché en position `fixed` par-dessus tout le reste quand `overlayVisible === true`
- Lit `overlayMessage`, `isWinner`, `isHost` depuis les slices
- Style différent selon `isWinner` : fond doré et texte brillant pour la victoire, fond rouge pour la défaite
- Affiche le bouton "🔄 Rejouer" **uniquement si `isHost === true`**
  - Le clic émet directement `RESTART_GAME` via socket
- Affiche "En attente de l'hôte..." pour les non-hôtes

---

## 10. Architecture CSS

### Principes obligatoires
- ❌ **Interdit** : balises `<TABLE />` — utiliser `display: grid` ou `display: flex`
- ❌ **Interdit** : Canvas — utiliser des `div` avec CSS
- ❌ **Interdit** : SVG pour les éléments de jeu
- ❌ **Interdit** : manipulation DOM directe (`document.getElementById`...) — React gère le DOM
- ✅ **Obligatoire** : tous les layouts avec `grid` ou `flexbox`
- ✅ **Recommandé** : CSS Modules (`.module.css`) pour l'isolation du scope

### `app/globals.css` — Reset et variables globales
- **Reset** : `box-sizing: border-box` sur `*`, `margin: 0`, `padding: 0`
- **Variables CSS** (`--color-I`, `--color-O`...) : les couleurs des pièces définies une seule fois — les CSS modules des composants les référencent
- **Prévention du scroll** : `overflow: hidden` sur `body` — les flèches du clavier ne doivent pas scroller la page
- **Police** : monospace recommandé pour l'aspect rétro Tetris (`'Courier New'` ou une police monospace web)
- **Fond global** : couleur sombre (`#0d0d1a` ou équivalent)

### Layout de l'écran de jeu
- Flexbox horizontal centré sur toute la hauteur de l'écran
- 3 zones :
  - **Zone gauche** : `Spectrum` des adversaires — largeur fixe, défilement vertical si beaucoup d'adversaires
  - **Zone centrale** : `Board_Display` — taille fixe (300px × 600px pour des cellules de 30px)
  - **Zone droite** : `GameInfo` (NextPiece + infos) — largeur fixe

### Dimensionnement du plateau
- Largeur : `BOARD_WIDTH × CELL_SIZE = 10 × 30px = 300px`
- Hauteur : `BOARD_HEIGHT × CELL_SIZE = 20 × 30px = 600px`
- La taille de cellule (`CELL_SIZE = 30px`) est définie comme variable CSS globale pour pouvoir la modifier facilement
- Le plateau est le composant de référence autour duquel tous les autres éléments sont alignés

### CSS Modules
- Chaque composant possède son propre `.module.css` — les classes sont scoped automatiquement par Next.js
- Aucun risque de conflit de noms entre composants
- Les classes de l'overlay (`.win`, `.lose`) modifient le style selon le résultat — deux variantes du même composant

### Responsive
- Dans la version de base, une largeur minimale d'écran (~400px) est suffisante
- Pas besoin de responsive complexe — un jeu Tetris s'utilise sur desktop avec un clavier
- Le layout peut utiliser `min-width` sur le conteneur principal pour éviter les écrasements sur petits écrans

---

## 11. Cycle de vie complet du client

> Section absente du brouillon — ajoutée pour faire le miroir exact avec le cycle de vie du backend et garantir la cohérence.

### Phase 1 — Arrivée sur la page d'accueil (`/`)
- Le formulaire est affiché, aucune socket n'est créée
- Le joueur saisit son pseudo et le nom de la room
- Validation locale puis navigation vers `/<room>/<player>`

### Phase 2 — Chargement de la page de jeu (`/[room]/[player]`)
- `useEffect` s'exécute au montage
- `setRoomInfo` est dispatché pour stocker l'identité locale dans Redux
- `getSocket()` crée l'instance socket (ou retourne l'existante)
- `JOIN_ROOM` est émis vers le serveur avec `{ room, playerName }`

### Phase 3 — Réception de `ROOM_STATE`
- Le middleware dispatche `setRoomState(payload)` dans Redux
- `gameStatus` passe à `'waiting'` → le composant `<Lobby />` s'affiche
- La liste des joueurs est hydratée
- `isHost` est déterminé pour ce joueur

### Phase 4 — Salle d'attente (Lobby)
- Les événements `PLAYER_JOINED` et `PLAYER_LEFT` mettent à jour la liste en temps réel
- `HOST_CHANGED` met à jour le flag `isHost` — le bouton "Démarrer" apparaît ou disparaît
- Si `isHost === true`, le bouton "Démarrer" est visible et actif

### Phase 5 — Réception de `GAME_STARTED`
- Le middleware dispatche `gameStarted()` → `gameStatus` passe à `'playing'`
- `resetGame()` est dispatché → le plateau est réinitialisé
- `hideOverlay()` est dispatché → l'overlay de la partie précédente (si restart) est caché
- Deux `REQUEST_PIECE` sont émis immédiatement l'un après l'autre
- `<GameView />` s'affiche → les hooks `useGameLoop` et `useKeyboard` démarrent

### Phase 6 — Réception des 2 premières pièces (`NEW_PIECE`)
- Première `NEW_PIECE` : `activePiece === null` → dispatche `setActivePiece(piece)` → la pièce commence à tomber
- Deuxième `NEW_PIECE` : `activePiece !== null` → dispatche `setNextPiece(piece)` → l'aperçu est affiché

### Phase 7 — Boucle de jeu (playing)
- `useGameLoop` déclenche `movePieceDown()` toutes les 800ms
- Les touches clavier déclenchent les mouvements et rotations
- Quand `moveDown` retourne `null` (depuis le hook) → `lockPiece()` est dispatché :
  - Pénalités appliquées si `penaltyQueue > 0`
  - Pièce fusionnée dans le plateau
  - Lignes effacées
  - Le middleware émet `LINES_CLEARED` si `linesJustCleared > 0`
  - Le middleware calcule le spectre et émet `UPDATE_SPECTRUM`
  - Le middleware émet `REQUEST_PIECE` pour demander la pièce suivante
- La pièce dans `nextPiece` devient la nouvelle `activePiece`, et une nouvelle `nextPiece` est demandée

### Phase 8 — Réception d'événements adversaires
- `SPECTRUM_UPDATE` → `updateSpectrum()` → `<Spectrum />` se re-render
- `PENALTY_LINES` → `addPenaltyLines(count)` → `penaltyQueue` s'incrémente → appliqué au prochain lock
- `PLAYER_ELIMINATED` → `playerEliminated()` → le joueur est marqué éliminé dans la liste + spectre

### Phase 9 — Élimination locale
- `setActivePiece` détecte que `isValidPosition` retourne `false` pour la pièce de spawn
- Dispatche `setGameStatus('lost')`
- Le middleware intercepte et émet `GAME_OVER_PLAYER` vers le serveur
- Le middleware dispatche `showOverlay({ message: 'Game Over', isWinner: false })`

### Phase 10 — Réception de `GAME_OVER`
- Le middleware dispatche `gameEnded({ winner })` et `showOverlay({ message: ..., isWinner })`
- L'overlay s'affiche avec le message et le style appropriés
- Si `isHost === true` → le bouton "Rejouer" est visible

### Phase 11 — Restart
- L'hôte clique "Rejouer" → émission directe de `RESTART_GAME`
- Le serveur répond avec `GAME_STARTED` → retour à la phase 5

### Phase 12 — Fermeture de la page
- Le cleanup du `useEffect` dans `[room]/[player]/page.tsx` s'exécute
- `socket.disconnect()` est appelé — le serveur reçoit l'événement `disconnect` et gère le départ du joueur

---

## 12. Synchronisation Client ↔ Serveur

### Moments où le client émet vers le serveur

| Moment | Événement émis | Données |
|---|---|---|
| Navigation vers `/<room>/<player>` | `JOIN_ROOM` | `{ room, playerName }` |
| Clic "Démarrer" (hôte uniquement) | `START_GAME` | `{ room }` |
| Réception de `GAME_STARTED` (2×) | `REQUEST_PIECE` | `{ room }` |
| Après chaque `lockPiece` | `REQUEST_PIECE` | `{ room }` |
| Après chaque `lockPiece` | `UPDATE_SPECTRUM` | `{ room, spectrum: number[] }` |
| Après `lockPiece` si lignes effacées | `LINES_CLEARED` | `{ room, count }` |
| Détection game over local | `GAME_OVER_PLAYER` | `{ room }` |
| Clic "Rejouer" (hôte uniquement) | `RESTART_GAME` | `{ room }` |

### Moments où le client reçoit du serveur

| Événement reçu | Réaction dans Redux |
|---|---|
| `ROOM_STATE` | Hydrate `roomSlice` complet |
| `PLAYER_JOINED` | Ajoute à la liste des joueurs |
| `PLAYER_LEFT` | Retire de la liste, supprime le spectre |
| `HOST_CHANGED` | Met à jour les flags `isHost` |
| `GAME_STARTED` | Reset du jeu + 2× `REQUEST_PIECE` automatiques |
| `NEW_PIECE` | Devient `activePiece` ou `nextPiece` selon le contexte |
| `SPECTRUM_UPDATE` | Met à jour le spectre d'un adversaire |
| `PENALTY_LINES` | Incrémente `penaltyQueue` |
| `PLAYER_ELIMINATED` | Marque le joueur éliminé |
| `GAME_OVER` | Fin de partie + overlay |

### Ce que le client ne transmet JAMAIS
- Les positions ou mouvements de la pièce active — la physique est locale
- Les collisions détectées — locale
- Le contenu du plateau — seul le spectre est partagé
- Les rotations effectuées — locale

---

## 13. Tests unitaires Frontend

### Objectifs de couverture (imposés par le sujet)
- Statements : ≥ 70%
- Functions : ≥ 70%
- Lines : ≥ 70%
- Branches : ≥ 50%

### Framework
- **Jest** avec **ts-jest** pour le support TypeScript
- **`@testing-library/react`** pour les tests de composants (si nécessaire)
- Alias de chemin `@/*` configuré dans `jest.config.js` via `moduleNameMapper`

### Périmètre prioritaire : `game/` en premier
- Les fonctions pures de `game/` sont **les plus faciles et les plus importantes** à tester
- Elles ne nécessitent aucun mock : pas de React, pas de Redux, pas de Socket.IO
- Un test qui passe garantit que la logique de jeu est correcte indépendamment de l'interface

### Ce qu'il faut tester par fichier

**`board.test.ts`**
- `createBoard()` : vérifier les dimensions (20 lignes, 10 colonnes par ligne), toutes les cellules à `0`
- `isValidPosition()` : position valide au centre, sortie à gauche, sortie à droite, sortie en bas, `y < 0` autorisé, collision avec un bloc existant, collision avec une cellule de pénalité
- `mergePiece()` : vérifier que les bons indices sont remplis, que le plateau original n'est pas muté, que les blocs hors plateau (`y < 0`) sont ignorés
- `addPenaltyLines()` : plateau maintient 20 lignes, les lignes ajoutées en bas contiennent des `8`, `count = 0` retourne le même plateau sans modification

**`pieces.test.ts`**
- `getPieceShape()` : retourne une matrice non-nulle pour tous les types et toutes les rotations (7 × 4 = 28 combinaisons)
- `getNextRotation()` : 0→1, 1→2, 2→3, 3→0 (wrapping correct)
- `createActivePiece()` : propriétés correctes (type, rotation=0, shape correspond à rotation 0)
- Vérifier que `PIECE_COLORS` contient les 7 clés

**`movement.test.ts`**
- `moveLeft()` / `moveRight()` : déplacement normal, blocage mur gauche, blocage mur droit, blocage par un bloc existant
- `moveDown()` : retourne une pièce si descente possible, retourne `null` si fond atteint, retourne `null` si collision sous la pièce
- `rotatePiece()` : rotation directe valide, rotation bloquée + wall kick réussi, rotation totalement bloquée retourne l'original
- `hardDrop()` : la position finale est au bas du plateau (ou sur un bloc existant)
- `getGhostPiece()` : retourne le même résultat que `hardDrop()`

**`lines.test.ts`**
- `isLineComplete()` : ligne vide = false, ligne pleine de 1 = true, ligne avec un 0 au milieu = false, ligne pleine de 8 (pénalité) = true
- `clearLines()` : aucune ligne effacée → même plateau, 1 ligne effacée → plateau toujours 20 lignes avec une ligne vide en haut, 2 lignes → 2 lignes vides ajoutées, `linesCleared` correct
- `getPenaltyCount()` : 1→0, 2→1, 3→2, 4→3, 0→0

**`spectrum.test.ts`**
- `computeSpectrum()` : plateau vide → tableau de dix 0, une seule cellule à la ligne 15 colonne 3 → `spectrum[3] = 5`, colonne pleine → 20, plusieurs colonnes de hauteurs différentes

### Ce qu'il ne faut pas tester
- Les composants React de rendu (trop couplés au DOM, faible valeur ajoutée)
- Le `socketMiddleware` (trop couplé à Socket.IO et Redux ensemble — difficile à isoler)
- Les hooks (requièrent `@testing-library/react-hooks` et sont complexes à mocker)

---

## 14. Contraintes imposées par le sujet et pièges à éviter

### Contraintes côté client

| Règle | Statut | Détail |
|---|---|---|
| Pas de `this` | ❌ Interdit | Sauf sous-classes de `Error` — composants fonctionnels uniquement |
| Pas de jQuery | ❌ Interdit | Aucune manipulation DOM directe |
| Pas de Canvas | ❌ Interdit | Tout en `div` + CSS |
| Pas de SVG | ❌ Interdit | — |
| Pas de `<TABLE />` | ❌ Interdit | Utiliser `grid` ou `flexbox` |
| Fonctions pures dans `game/` | ✅ Obligatoire | Aucune mutation, aucun effet de bord |
| SPA | ✅ Obligatoire | Navigations via `router.push()`, jamais de rechargement |
| React + Redux | ✅ Fortement recommandé | Impose le sujet |
| Couverture ≥ 70% | ✅ Obligatoire | Statements, Functions, Lines |
| Couverture branches ≥ 50% | ✅ Obligatoire | — |
| `.env.local` gitignored | ✅ Obligatoire | Jamais de secrets en repo |

### Pièges critiques à éviter

**Piège 1 — Oublier `'use client'` sur les composants interactifs**
- Dans l'App Router Next.js, tous les composants sont Server Components par défaut
- Un Server Component qui utilise `useState`, `useEffect`, `useSelector` ou `getSocket()` plantera au build ou au runtime
- Vérification : tout composant qui utilise des hooks React ou interagit avec le DOM doit avoir `'use client'` en tête

**Piège 2 — Créer la socket dans un composant React**
- Appeler `io(SERVER_URL)` directement dans un composant crée une nouvelle connexion à chaque render
- Avec React StrictMode (activé par défaut en développement), les composants se rendent deux fois → deux sockets créées
- Solution : utiliser **uniquement** `getSocket()` depuis `socket/socket.ts`

**Piège 3 — Stale closures dans `useGameLoop` et `useKeyboard`**
- Un `setInterval` créé lors du premier render capture les valeurs initiales de `board`, `activePiece`, `gameStatus`
- Ces valeurs ne changent jamais dans le callback même si le state Redux évolue
- Solution : stocker les valeurs dans des `useRef` mis à jour à chaque render, lire `.current` dans le callback

**Piège 4 — Muter le tableau du plateau dans les reducers**
- Même avec Immer (Redux Toolkit), si on modifie un tableau imbriqué sans passer par Immer correctement, on peut introduire des mutations
- Toutes les fonctions de `game/` retournent de nouveaux tableaux — ne jamais réutiliser les références d'entrée

**Piège 5 — Appliquer les pénalités immédiatement**
- Appliquer `addPenaltyLines` dans le store dès réception de `PENALTY_LINES` fait sauter le plateau visuellement pendant que le joueur joue
- Les pénalités doivent s'accumuler dans `penaltyQueue` et être appliquées uniquement lors du prochain `lockPiece`

**Piège 6 — Ne pas envoyer 2 × `REQUEST_PIECE` au démarrage**
- Si on n'envoie qu'un seul `REQUEST_PIECE`, on reçoit uniquement la pièce active — `nextPiece` reste `null`
- L'aperçu de la pièce suivante ne s'affichera jamais
- Il faut systématiquement envoyer **deux** `REQUEST_PIECE` consécutifs à la réception de `GAME_STARTED`

**Piège 7 — Calculer le spectre dans un reducer**
- Les reducers Redux Toolkit avec Immer utilisent un draft mutable — `computeSpectrum` attend un tableau réel
- Calculer le spectre **après** le reducer dans le middleware garantit d'avoir accès au plateau finalisé (après effacement des lignes)

**Piège 8 — Ne pas désactiver le clavier après élimination**
- Si le joueur continue d'appuyer sur les touches après son game over, des dispatches inutiles sont envoyés
- Vérifier `gameStatus === 'playing'` dans `useKeyboard` via une ref avant tout dispatch
