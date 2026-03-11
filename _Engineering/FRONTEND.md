# 🎮 Red Tetris — Guide de Développement Frontend

> Stack : **Next.js 14+ (App Router) + React + TypeScript + Redux Toolkit + Socket.IO Client**
> Contrainte fondamentale : **Programmation fonctionnelle côté client — ZÉRO `this`**

---

## 📋 Table des matières

1. [Structure des dossiers](#1-structure-des-dossiers)
2. [Types TypeScript partagés](#2-types-typescript-partagés)
3. [Configuration du projet](#3-configuration-du-projet)
4. [Routing Next.js — Gestion de l'URL](#4-routing-nextjs--gestion-de-lurl)
5. [Logique de jeu — Fonctions Pures](#5-logique-de-jeu--fonctions-pures)
6. [Gestion de l'état Redux](#6-gestion-de-létat-redux)
7. [Socket.IO Client — Connexion et Événements](#7-socketio-client--connexion-et-événements)
8. [Hooks Personnalisés](#8-hooks-personnalisés)
9. [Composants React](#9-composants-react)
10. [CSS — Règles et Styles](#10-css--règles-et-styles)
11. [Tests Unitaires Frontend](#11-tests-unitaires-frontend)
12. [Contraintes et Pièges à éviter](#12-contraintes-et-pièges-à-éviter)

---

## 1. Structure des dossiers

```
frontend/
│
├── nextjs_app/
│   ├── src/
│   │   ├── app/                            # App Router Next.js
│   │   │   ├── layout.tsx                  # Layout global : wrapping Redux Provider + Socket init
│   │   │   ├── page.tsx                    # Page d'accueil (formulaire join room)
│   │   │   └── [room]/
│   │   │       └── [player]/
│   │   │           └── page.tsx            # Page de jeu dynamique /<room>/<player>
│   │   │
│   │   ├── components/
│   │   │   ├── Board/
│   │   │   │   ├── Board_Display.tsx       # Grille principale 10×20
│   │   │   │   └── Board.module.css        # Styles CSS Grid du plateau
│   │   │   ├── Cell/
│   │   │   │   ├── Cell.tsx                # Case unitaire colorée
│   │   │   │   └── Cell.module.css
│   │   │   ├── Piece/
│   │   │   │   ├── NextPiece.tsx           # Aperçu de la prochaine pièce (grille 4×4)
│   │   │   │   └── NextPiece.module.css
│   │   │   ├── Spectrum/
│   │   │   │   ├── Spectrum.tsx            # Vue compressée des plateaux adversaires
│   │   │   │   └── Spectrum.module.css
│   │   │   ├── GameInfo/
│   │   │   │   ├── GameInfo.tsx            # Panneau latéral (next piece, infos room)
│   │   │   │   └── GameInfo.module.css
│   │   │   ├── Lobby/
│   │   │   │   ├── Lobby.tsx               # Salle d'attente avant la partie
│   │   │   │   └── Lobby.module.css
│   │   │   └── Overlay/
│   │   │       ├── GameOverlay.tsx         # Écran game over / victoire
│   │   │       └── GameOverlay.module.css
│   │   │
│   │   ├── store/
│   │   │   ├── index.ts                    # Configuration du store Redux
│   │   │   ├── hooks.ts                    # useAppDispatch / useAppSelector typés
│   │   │   ├── slices/
│   │   │   │   ├── gameSlice.ts            # État local du plateau de jeu
│   │   │   │   ├── roomSlice.ts            # État de la room et des joueurs
│   │   │   │   └── uiSlice.ts              # État UI (overlays, messages)
│   │   │   └── middleware/
│   │   │       └── socketMiddleware.ts     # Pont Redux ↔ Socket.IO
│   │   │
│   │   ├── game/                           # ⚠️  FONCTIONS PURES UNIQUEMENT — zéro this
│   │   │   ├── board.ts                    # Création et manipulation du plateau
│   │   │   ├── pieces.ts                   # Définitions des 7 tetriminos + rotations
│   │   │   ├── movement.ts                 # Déplacements, collisions, rotations
│   │   │   ├── lines.ts                    # Détection et effacement de lignes
│   │   │   ├── gravity.ts                  # Calcul de la vitesse de chute
│   │   │   └── spectrum.ts                 # Calcul du spectre d'un plateau
│   │   │
│   │   ├── hooks/
│   │   │   ├── useSocket.ts                # Singleton socket.io-client
│   │   │   ├── useGameLoop.ts              # Boucle de jeu (gravité automatique)
│   │   │   └── useKeyboard.ts              # Capture des touches clavier
│   │   │
│   │   ├── socket/
│   │   │   ├── socket.ts                   # Instance socket exportée (singleton)
│   │   │   └── events.ts                   # Constantes string des événements socket
│   │   │
│   │   └── types/
│   │       └── index.ts                    # Tous les types/interfaces TypeScript
│   │
│   ├── public/
│   ├── next.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── tests/
│   └── game/                               # Tests Jest des fonctions pures
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

---

## 2. Types TypeScript partagés

**Fichier : `src/types/index.ts`**

Ce fichier centralise **tous** les types utilisés dans le frontend. Le définir en premier est indispensable car tous les autres fichiers en dépendent.

```typescript
// ─────────────────────────────────────────────
// TYPES DU PLATEAU
// ─────────────────────────────────────────────

// Valeur d'une cellule :
// 0 = vide
// 1-7 = type de tetrimino (I=1, O=2, T=3, S=4, Z=5, J=6, L=7)
// 8 = ligne de pénalité (indestructible)
export type CellValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// Une ligne du plateau = tableau de 10 cellules
export type BoardRow = CellValue[];

// Le plateau complet = 20 lignes de 10 colonnes
export type BoardType = BoardRow[];

// ─────────────────────────────────────────────
// TYPES DES PIÈCES
// ─────────────────────────────────────────────

// Les 7 types de tetriminos
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

// La forme d'une pièce = matrice 2D de 0/1
// 1 = bloc présent, 0 = vide
export type PieceShape = (0 | 1)[][];

// Position d'un tetrimino sur le plateau
export interface Position {
  x: number;  // colonne (0 = gauche)
  y: number;  // ligne   (0 = haut)
}

// Une pièce active en cours de jeu
export interface ActivePiece {
  type: PieceType;        // Quel tetrimino (I, O, T...)
  shape: PieceShape;      // Forme actuelle (peut changer avec la rotation)
  position: Position;     // Position sur le plateau
  rotation: number;       // Indice de rotation 0..3
}

// Représentation minimale d'une pièce reçue du serveur
export interface IPiece {
  type: PieceType;
  position: Position;
}

// ─────────────────────────────────────────────
// TYPES DES JOUEURS ET DE LA ROOM
// ─────────────────────────────────────────────

export interface IPlayerInfo {
  name: string;
  isHost: boolean;
  isAlive: boolean;
}

export interface IRoomState {
  roomName: string;
  players: IPlayerInfo[];
  gameStatus: 'waiting' | 'playing' | 'ended';
  isHost: boolean;
  winner: string | null;
}

// ─────────────────────────────────────────────
// TYPES DES ÉVÉNEMENTS SOCKET
// ─────────────────────────────────────────────

// Payloads des événements émis par le client vers le serveur
export interface JoinRoomPayload {
  room: string;
  playerName: string;
}

export interface UpdateSpectrumPayload {
  room: string;
  spectrum: number[];
}

export interface LinesClearedPayload {
  room: string;
  count: number;
}

// Payloads reçus du serveur
export interface RoomStatePayload {
  players: IPlayerInfo[];
  gameStatus: 'waiting' | 'playing' | 'ended';
  isHost: boolean;
}

export interface SpectrumUpdatePayload {
  playerName: string;
  spectrum: number[];
}

export interface NewPiecePayload {
  piece: IPiece;
}

export interface PenaltyLinesPayload {
  count: number;
}

export interface GameOverPayload {
  winner: string;
}
```

---

## 3. Configuration du projet

### 3.1 Installation des dépendances

```bash
# Dans nextjs_app/
npm install next react react-dom
npm install @reduxjs/toolkit react-redux
npm install socket.io-client
npm install --save-dev typescript @types/react @types/node
npm install --save-dev jest @types/jest ts-jest
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

### 3.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "ES2020"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 3.3 `next.config.ts`

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Nécessaire pour que socket.io-client fonctionne
  // (désactive certaines optimisations qui cassent les websockets)
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },
};

export default nextConfig;
```

### 3.4 `.env.local`

```bash
# URL du serveur backend Node.js
NEXT_PUBLIC_SERVER_URL=http://localhost:3001

# ⚠️ Ce fichier est gitignored — ne jamais commit ces valeurs
```

> **Important** : Dans Next.js, seules les variables préfixées `NEXT_PUBLIC_` sont accessibles côté navigateur.

---

## 4. Routing Next.js — Gestion de l'URL

### 4.1 Pourquoi App Router ?

Le sujet impose que les joueurs rejoignent une room via l'URL :
`http://<host>:<port>/<room>/<player_name>`

L'App Router de Next.js 14+ gère les **routes dynamiques imbriquées** nativement avec les dossiers `[param]`.

### 4.2 `app/layout.tsx` — Layout global

Ce composant est le **wrapper de toute l'application**. Il est rendu une seule fois et englobe toutes les pages. C'est ici que le **Redux Provider** et l'**initialisation du socket** doivent être placés.

```typescript
// src/app/layout.tsx
// ⚠️ Ce fichier doit être un Client Component pour utiliser Redux Provider
'use client';

import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from '@/store';
import './globals.css';

interface LayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: LayoutProps) => {
  return (
    <html lang="fr">
      <body>
        {/*
          Redux Provider : rend le store accessible à tous les composants enfants.
          Doit englober toute l'application.
        */}
        <Provider store={store}>
          {children}
        </Provider>
      </body>
    </html>
  );
};

export default RootLayout;
```

### 4.3 `app/page.tsx` — Page d'accueil

Quand un utilisateur arrive sur `/` sans room ni player, on lui affiche un formulaire pour choisir son nom et sa room, puis on le redirige vers `/<room>/<player>`.

```typescript
// src/app/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const HomePage = () => {
  const router = useRouter();
  const [roomName, setRoomName] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    // Validation : les deux champs sont obligatoires
    if (!roomName.trim() || !playerName.trim()) {
      setError('Le nom de la room et votre pseudo sont obligatoires.');
      return;
    }
    // Validation : pas d'espaces ni de caractères spéciaux dans l'URL
    const urlSafe = /^[a-zA-Z0-9_-]+$/;
    if (!urlSafe.test(roomName) || !urlSafe.test(playerName)) {
      setError('Utilisez uniquement des lettres, chiffres, - et _');
      return;
    }
    // Redirection vers la page de jeu
    router.push(`/${roomName}/${playerName}`);
  };

  return (
    <main className="home-container">
      <h1>🎮 Red Tetris</h1>
      <div className="join-form">
        <input
          type="text"
          placeholder="Nom de la room"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          maxLength={20}
        />
        <input
          type="text"
          placeholder="Votre pseudo"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          maxLength={20}
        />
        {error && <p className="error">{error}</p>}
        <button onClick={handleJoin}>Rejoindre</button>
      </div>
    </main>
  );
};

export default HomePage;
```

### 4.4 `app/[room]/[player]/page.tsx` — Page de jeu

C'est le cœur de l'application. Cette page :
1. Lit les paramètres `room` et `player` depuis l'URL
2. Initialise la connexion socket au montage
3. Émet l'événement `JOIN_ROOM`
4. Affiche le Lobby ou le plateau de jeu selon le statut de la partie

```typescript
// src/app/[room]/[player]/page.tsx
'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { getSocket } from '@/socket/socket';
import { SOCKET_EVENTS } from '@/socket/events';
import { setRoomInfo } from '@/store/slices/roomSlice';
import Lobby from '@/components/Lobby/Lobby';
import GameView from '@/components/GameView/GameView';
import GameOverlay from '@/components/Overlay/GameOverlay';

const GamePage = () => {
  const params = useParams();
  // Extraire et décoder les paramètres d'URL
  const room = decodeURIComponent(params.room as string);
  const player = decodeURIComponent(params.player as string);

  const dispatch = useAppDispatch();
  const gameStatus = useAppSelector((state) => state.room.gameStatus);
  const overlayVisible = useAppSelector((state) => state.ui.overlayVisible);

  useEffect(() => {
    // 1. Stocker les infos de room dans Redux
    dispatch(setRoomInfo({ roomName: room, playerName: player }));

    // 2. Obtenir l'instance socket (singleton)
    const socket = getSocket();

    // 3. Émettre JOIN_ROOM dès que le composant est monté
    socket.emit(SOCKET_EVENTS.JOIN_ROOM, { room, playerName: player });

    // 4. Nettoyage : déconnecter le socket quand on quitte la page
    return () => {
      socket.disconnect();
    };
  }, [room, player, dispatch]);

  return (
    <main className="game-page">
      {/* Affiche le Lobby si la partie n'a pas démarré */}
      {gameStatus === 'waiting' && <Lobby />}

      {/* Affiche le plateau de jeu si la partie est en cours ou terminée */}
      {(gameStatus === 'playing' || gameStatus === 'ended') && <GameView />}

      {/* Overlay de fin de partie par-dessus tout */}
      {overlayVisible && <GameOverlay />}
    </main>
  );
};

export default GamePage;
```

---

## 5. Logique de jeu — Fonctions Pures

> ⚠️ **RÈGLE ABSOLUE** : Ces fichiers ne doivent contenir **que des fonctions pures**.
> Une fonction pure = même entrée → même sortie, aucun effet de bord, aucune mutation.
> Ces fonctions doivent être **entièrement testables sans mock** (Jest pur).

### 5.1 `game/board.ts` — Création et manipulation du plateau

Le plateau est représenté comme un **tableau 2D immuable** : `CellValue[][]`.
Toute opération retourne un **nouveau tableau** (pas de mutation en place).

```typescript
// src/game/board.ts
import { BoardType, BoardRow, CellValue, ActivePiece } from '@/types';

// Constantes du plateau
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

// ─────────────────────────────────────────────────────────
// createBoard : crée un plateau vide 10×20 rempli de 0
// ─────────────────────────────────────────────────────────
// Utilise Array.from pour créer un tableau 2D sans mutation.
// Chaque appel retourne une nouvelle instance indépendante.
export const createBoard = (): BoardType =>
  Array.from({ length: BOARD_HEIGHT }, (): BoardRow =>
    Array.from({ length: BOARD_WIDTH }, (): CellValue => 0)
  );

// ─────────────────────────────────────────────────────────
// isValidPosition : vérifie si une pièce peut être placée
// ─────────────────────────────────────────────────────────
// Parcourt chaque bloc de la pièce et vérifie :
//   - qu'il est dans les limites du plateau (x: 0-9, y: 0-19)
//   - que la cellule cible est vide (valeur 0)
// ⚠️  On autorise y < 0 (au-dessus du plateau) pour le spawn
export const isValidPosition = (
  board: BoardType,
  piece: ActivePiece
): boolean => {
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      // Ignorer les cellules vides de la matrice de forme
      if (piece.shape[row][col] === 0) continue;

      const boardX = piece.position.x + col;
      const boardY = piece.position.y + row;

      // Vérifier les limites horizontales
      if (boardX < 0 || boardX >= BOARD_WIDTH) return false;

      // Vérifier la limite basse (le haut est autorisé pour le spawn)
      if (boardY >= BOARD_HEIGHT) return false;

      // Ignorer les vérifications au-dessus du plateau
      if (boardY < 0) continue;

      // Vérifier la collision avec un bloc existant
      if (board[boardY][boardX] !== 0) return false;
    }
  }
  return true;
};

// ─────────────────────────────────────────────────────────
// mergePiece : fusionne une pièce dans le plateau
// ─────────────────────────────────────────────────────────
// Retourne un NOUVEAU plateau avec la pièce "figée" dedans.
// Utilisé quand une pièce atterrit et ne peut plus bouger.
export const mergePiece = (
  board: BoardType,
  piece: ActivePiece
): BoardType => {
  // Créer une copie profonde du plateau
  const newBoard: BoardType = board.map(row => [...row]);

  // Mapper le type de pièce à une valeur numérique
  const pieceValue = pieceTypeToValue(piece.type);

  piece.shape.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === 0) return;
      const boardY = piece.position.y + rowIndex;
      const boardX = piece.position.x + colIndex;
      // Ne pas écrire hors du plateau
      if (boardY >= 0 && boardY < BOARD_HEIGHT && boardX >= 0 && boardX < BOARD_WIDTH) {
        newBoard[boardY][boardX] = pieceValue;
      }
    });
  });

  return newBoard;
};

// ─────────────────────────────────────────────────────────
// addPenaltyLines : ajoute des lignes indestructibles en bas
// ─────────────────────────────────────────────────────────
// Les lignes de pénalité (valeur 8) poussent le plateau vers le haut.
// Les lignes qui dépassent en haut sont supprimées.
export const addPenaltyLines = (
  board: BoardType,
  count: number
): BoardType => {
  if (count <= 0) return board;

  // Créer une ligne de pénalité : tous les blocs sont à 8 sauf un trou aléatoire
  const createPenaltyRow = (): BoardRow => {
    const holeIndex = Math.floor(Math.random() * BOARD_WIDTH);
    return Array.from({ length: BOARD_WIDTH }, (_, i): CellValue =>
      i === holeIndex ? 0 : 8
    );
  };

  // Supprimer les `count` premières lignes (haut du plateau)
  // puis ajouter `count` lignes de pénalité en bas
  const trimmedBoard = board.slice(count);
  const penaltyRows: BoardType = Array.from({ length: count }, createPenaltyRow);

  return [...trimmedBoard, ...penaltyRows];
};

// ─────────────────────────────────────────────────────────
// Utilitaire : convertit un type de pièce en valeur numérique
// ─────────────────────────────────────────────────────────
const PIECE_TYPE_VALUES: Record<string, CellValue> = {
  I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7
};

export const pieceTypeToValue = (type: string): CellValue =>
  PIECE_TYPE_VALUES[type] ?? 1;
```

### 5.2 `game/pieces.ts` — Définitions des Tetriminos

Définit les **7 tetriminos** avec leurs **4 rotations** chacun.
La représentation est une matrice 2D de 0 (vide) et 1 (bloc).

```typescript
// src/game/pieces.ts
import { PieceType, PieceShape, ActivePiece, IPiece } from '@/types';
import { BOARD_WIDTH } from './board';

// ─────────────────────────────────────────────────────────
// Définition des 4 rotations pour chacun des 7 tetriminos
// ─────────────────────────────────────────────────────────
export const TETRIMINOS: Record<PieceType, PieceShape[]> = {
  // I : barre de 4, 2 rotations distinctes (0°, 90°)
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  // O : carré 2×2, symétrique (1 seule rotation effective)
  O: [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  ],
  // T : forme en T
  T: [
    [[0,1,0],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,1],[0,1,0]],
    [[0,1,0],[1,1,0],[0,1,0]],
  ],
  // S : S décalé
  S: [
    [[0,1,1],[1,1,0],[0,0,0]],
    [[0,1,0],[0,1,1],[0,0,1]],
    [[0,0,0],[0,1,1],[1,1,0]],
    [[1,0,0],[1,1,0],[0,1,0]],
  ],
  // Z : Z décalé
  Z: [
    [[1,1,0],[0,1,1],[0,0,0]],
    [[0,0,1],[0,1,1],[0,1,0]],
    [[0,0,0],[1,1,0],[0,1,1]],
    [[0,1,0],[1,1,0],[1,0,0]],
  ],
  // J : L inversé
  J: [
    [[1,0,0],[1,1,1],[0,0,0]],
    [[0,1,1],[0,1,0],[0,1,0]],
    [[0,0,0],[1,1,1],[0,0,1]],
    [[0,1,0],[0,1,0],[1,1,0]],
  ],
  // L : L normal
  L: [
    [[0,0,1],[1,1,1],[0,0,0]],
    [[0,1,0],[0,1,0],[0,1,1]],
    [[0,0,0],[1,1,1],[1,0,0]],
    [[1,1,0],[0,1,0],[0,1,0]],
  ],
};

// ─────────────────────────────────────────────────────────
// Couleurs CSS associées à chaque type de pièce
// ─────────────────────────────────────────────────────────
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#00f0f0',   // Cyan
  O: '#f0f000',   // Jaune
  T: '#a000f0',   // Violet
  S: '#00f000',   // Vert
  Z: '#f00000',   // Rouge
  J: '#0000f0',   // Bleu
  L: '#f0a000',   // Orange
};

// ─────────────────────────────────────────────────────────
// getNextRotation : retourne l'indice de rotation suivant
// ─────────────────────────────────────────────────────────
export const getNextRotation = (rotation: number): number =>
  (rotation + 1) % 4;

// ─────────────────────────────────────────────────────────
// getPieceShape : retourne la forme selon le type et la rotation
// ─────────────────────────────────────────────────────────
export const getPieceShape = (type: PieceType, rotation: number): PieceShape =>
  TETRIMINOS[type][rotation % 4];

// ─────────────────────────────────────────────────────────
// createActivePiece : convertit une IPiece (serveur) en ActivePiece
// ─────────────────────────────────────────────────────────
// Appelé quand on reçoit une nouvelle pièce du serveur via socket.
export const createActivePiece = (serverPiece: IPiece): ActivePiece => ({
  type: serverPiece.type,
  shape: getPieceShape(serverPiece.type, 0),
  position: serverPiece.position,
  rotation: 0,
});

// ─────────────────────────────────────────────────────────
// getSpawnPosition : position de spawn au centre en haut
// ─────────────────────────────────────────────────────────
export const getSpawnPosition = (type: PieceType) => ({
  x: Math.floor(BOARD_WIDTH / 2) - 2,  // centré sur 10 colonnes
  y: -1,                                // légèrement au-dessus pour le check game over
});
```

### 5.3 `game/movement.ts` — Déplacements et Collisions

```typescript
// src/game/movement.ts
import { BoardType, ActivePiece } from '@/types';
import { isValidPosition } from './board';
import { getPieceShape, getNextRotation } from './pieces';

// ─────────────────────────────────────────────────────────
// moveLeft : déplace la pièce d'une colonne vers la gauche
// ─────────────────────────────────────────────────────────
// Retourne la pièce à sa position initiale si le déplacement est invalide.
export const moveLeft = (
  board: BoardType,
  piece: ActivePiece
): ActivePiece => {
  const moved: ActivePiece = {
    ...piece,
    position: { ...piece.position, x: piece.position.x - 1 },
  };
  return isValidPosition(board, moved) ? moved : piece;
};

// ─────────────────────────────────────────────────────────
// moveRight : déplace la pièce d'une colonne vers la droite
// ─────────────────────────────────────────────────────────
export const moveRight = (
  board: BoardType,
  piece: ActivePiece
): ActivePiece => {
  const moved: ActivePiece = {
    ...piece,
    position: { ...piece.position, x: piece.position.x + 1 },
  };
  return isValidPosition(board, moved) ? moved : piece;
};

// ─────────────────────────────────────────────────────────
// moveDown : descend la pièce d'une ligne
// ─────────────────────────────────────────────────────────
// Retourne null si la descente est impossible (pièce doit être figée).
export const moveDown = (
  board: BoardType,
  piece: ActivePiece
): ActivePiece | null => {
  const moved: ActivePiece = {
    ...piece,
    position: { ...piece.position, y: piece.position.y + 1 },
  };
  return isValidPosition(board, moved) ? moved : null;
};

// ─────────────────────────────────────────────────────────
// rotatePiece : tente de faire pivoter la pièce de 90°
// ─────────────────────────────────────────────────────────
// Implémente un "wall kick" basique : si la rotation de base est
// invalide (collision mur ou bloc), on essaie de décaler la pièce
// de +1 ou -1 en X pour permettre la rotation near the edges.
export const rotatePiece = (
  board: BoardType,
  piece: ActivePiece
): ActivePiece => {
  const nextRotation = getNextRotation(piece.rotation);
  const rotated: ActivePiece = {
    ...piece,
    rotation: nextRotation,
    shape: getPieceShape(piece.type, nextRotation),
  };

  // Rotation directe : OK ?
  if (isValidPosition(board, rotated)) return rotated;

  // Wall kick vers la droite (+1)
  const kickRight: ActivePiece = {
    ...rotated,
    position: { ...rotated.position, x: rotated.position.x + 1 },
  };
  if (isValidPosition(board, kickRight)) return kickRight;

  // Wall kick vers la gauche (-1)
  const kickLeft: ActivePiece = {
    ...rotated,
    position: { ...rotated.position, x: rotated.position.x - 1 },
  };
  if (isValidPosition(board, kickLeft)) return kickLeft;

  // Wall kick double droite (+2, utile pour la pièce I près du bord)
  const kickRight2: ActivePiece = {
    ...rotated,
    position: { ...rotated.position, x: rotated.position.x + 2 },
  };
  if (isValidPosition(board, kickRight2)) return kickRight2;

  // Aucune rotation possible : retourner la pièce originale
  return piece;
};

// ─────────────────────────────────────────────────────────
// hardDrop : descend la pièce jusqu'à la position la plus basse
// ─────────────────────────────────────────────────────────
// Utilisé quand le joueur appuie sur Espace.
// Calcule la position finale sans mouvoir la pièce pas à pas.
export const hardDrop = (
  board: BoardType,
  piece: ActivePiece
): ActivePiece => {
  let current = piece;
  // Descendre tant que c'est possible
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = moveDown(board, current);
    if (next === null) break;
    current = next;
  }
  return current;
};

// ─────────────────────────────────────────────────────────
// getGhostPiece : calcule la position "fantôme" de la pièce
// ─────────────────────────────────────────────────────────
// La pièce fantôme est la prévisualisation transparente de l'endroit
// où la pièce va atterrir. Optionnel mais améliore l'UX.
export const getGhostPiece = (
  board: BoardType,
  piece: ActivePiece
): ActivePiece => hardDrop(board, piece);
```

### 5.4 `game/lines.ts` — Gestion des lignes

```typescript
// src/game/lines.ts
import { BoardType, BoardRow, CellValue } from '@/types';
import { BOARD_WIDTH, BOARD_HEIGHT, createBoard } from './board';

// ─────────────────────────────────────────────────────────
// isLineComplete : vérifie si une ligne est entièrement remplie
// ─────────────────────────────────────────────────────────
// Une ligne est complète si toutes ses cellules sont non-nulles.
// ⚠️  Les lignes de pénalité (valeur 8) comptent comme remplies !
export const isLineComplete = (row: BoardRow): boolean =>
  row.every(cell => cell !== 0);

// ─────────────────────────────────────────────────────────
// getCompletedLineIndices : retourne les indices des lignes complètes
// ─────────────────────────────────────────────────────────
export const getCompletedLineIndices = (board: BoardType): number[] =>
  board.reduce<number[]>((acc, row, index) => {
    if (isLineComplete(row)) acc.push(index);
    return acc;
  }, []);

// ─────────────────────────────────────────────────────────
// clearLines : supprime les lignes complètes et retasse le plateau
// ─────────────────────────────────────────────────────────
// Retourne :
//   - newBoard : le nouveau plateau après suppression
//   - linesCleared : nombre de lignes supprimées (pour calculer les pénalités)
export const clearLines = (
  board: BoardType
): { board: BoardType; linesCleared: number } => {
  const completedIndices = getCompletedLineIndices(board);
  const linesCleared = completedIndices.length;

  if (linesCleared === 0) {
    return { board, linesCleared: 0 };
  }

  // Garder uniquement les lignes non complètes
  const remainingRows = board.filter((_, index) =>
    !completedIndices.includes(index)
  );

  // Compléter avec des lignes vides en haut pour maintenir la hauteur à 20
  const emptyRow: BoardRow = Array.from({ length: BOARD_WIDTH }, (): CellValue => 0);
  const emptyRows: BoardType = Array.from(
    { length: linesCleared },
    () => [...emptyRow]
  );

  const newBoard: BoardType = [...emptyRows, ...remainingRows];
  return { board: newBoard, linesCleared };
};

// ─────────────────────────────────────────────────────────
// getPenaltyCount : calcule les lignes de pénalité à envoyer
// ─────────────────────────────────────────────────────────
// Règle du sujet : n lignes effacées → n-1 lignes de pénalité aux adversaires
// - 1 ligne effacée → 0 pénalité
// - 2 lignes effacées → 1 pénalité
// - 3 lignes effacées → 2 pénalités
// - 4 lignes effacées (Tetris) → 3 pénalités
export const getPenaltyCount = (linesCleared: number): number =>
  Math.max(0, linesCleared - 1);
```

### 5.5 `game/spectrum.ts` — Calcul du spectre

```typescript
// src/game/spectrum.ts
import { BoardType } from '@/types';
import { BOARD_WIDTH, BOARD_HEIGHT } from './board';

// ─────────────────────────────────────────────────────────
// computeSpectrum : calcule le spectre d'un plateau
// ─────────────────────────────────────────────────────────
// Le spectre est un tableau de 10 valeurs (une par colonne).
// Chaque valeur = nombre de lignes depuis le haut jusqu'au premier bloc.
// 0 = colonne vide, 20 = colonne pleine jusqu'en haut.
//
// Exemple :
//   Colonne vide              → spectre = 0
//   Premier bloc ligne 15/20  → spectre = 5  (20 - 15)
//   Premier bloc ligne 0/20   → spectre = 20 (colonne pleine)
export const computeSpectrum = (board: BoardType): number[] =>
  Array.from({ length: BOARD_WIDTH }, (_, col) => {
    // Trouver la première ligne non vide dans cette colonne (de haut en bas)
    for (let row = 0; row < BOARD_HEIGHT; row++) {
      if (board[row][col] !== 0) {
        // La hauteur = nombre de lignes occupées depuis le bas
        return BOARD_HEIGHT - row;
      }
    }
    return 0; // Colonne vide
  });
```

### 5.6 `game/gravity.ts` — Vitesse de chute

```typescript
// src/game/gravity.ts

// ─────────────────────────────────────────────────────────
// getGravityInterval : retourne l'intervalle de chute en ms
// ─────────────────────────────────────────────────────────
// Dans cette version de Red Tetris, la vitesse est constante (pas de niveaux).
// On peut néanmoins prévoir une progression optionnelle.
export const getGravityInterval = (level: number = 1): number => {
  // Formule : diminue la durée au fil des niveaux
  // Niveau 1 = 800ms, Niveau 10 = ~100ms
  const baseInterval = 800;
  const minInterval = 100;
  const reduction = Math.min(level - 1, 9) * 70;
  return Math.max(baseInterval - reduction, minInterval);
};
```

---

## 6. Gestion de l'état Redux

### 6.1 `store/index.ts` — Configuration du store

```typescript
// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from './slices/gameSlice';
import roomReducer from './slices/roomSlice';
import uiReducer from './slices/uiSlice';
import { socketMiddleware } from './middleware/socketMiddleware';

export const store = configureStore({
  reducer: {
    game: gameReducer,
    room: roomReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(socketMiddleware),
});

// Types inférés automatiquement par Redux Toolkit
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

### 6.2 `store/hooks.ts` — Hooks Redux typés

Ces hooks wrappent `useSelector` et `useDispatch` avec les types du store pour éviter de répéter les types partout.

```typescript
// src/store/hooks.ts
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from './index';

// Toujours utiliser ces hooks à la place des versions non-typées
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

### 6.3 `store/slices/gameSlice.ts` — État du plateau

Ce slice gère tout l'état lié au plateau de jeu du joueur local.

```typescript
// src/store/slices/gameSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { BoardType, ActivePiece, IPiece } from '@/types';
import { createBoard, isValidPosition, mergePiece, addPenaltyLines } from '@/game/board';
import { createActivePiece } from '@/game/pieces';
import { moveLeft, moveRight, moveDown, rotatePiece, hardDrop } from '@/game/movement';
import { clearLines, getPenaltyCount } from '@/game/lines';

interface GameState {
  board: BoardType;                    // Plateau figé (sans la pièce active)
  activePiece: ActivePiece | null;     // Pièce en train de tomber
  nextPiece: IPiece | null;            // Prochaine pièce (affichée à droite)
  status: 'idle' | 'playing' | 'lost' | 'won';
  penaltyQueue: number;                // Lignes de pénalité à appliquer au prochain lock
  linesJustCleared: number;            // Lignes effacées au dernier tour (pour notifier le serveur)
}

const initialState: GameState = {
  board: createBoard(),
  activePiece: null,
  nextPiece: null,
  status: 'idle',
  penaltyQueue: 0,
  linesJustCleared: 0,
};

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    // ─────────────────────────────────────────
    // Pièces
    // ─────────────────────────────────────────
    setActivePiece: (state, action: PayloadAction<IPiece>) => {
      const newPiece = createActivePiece(action.payload);
      // Vérifier si le spawn est possible → sinon game over
      if (!isValidPosition(state.board, newPiece)) {
        state.status = 'lost';
      } else {
        state.activePiece = newPiece;
      }
    },

    setNextPiece: (state, action: PayloadAction<IPiece>) => {
      state.nextPiece = action.payload;
    },

    // ─────────────────────────────────────────
    // Mouvements (appellent les fonctions pures)
    // ─────────────────────────────────────────
    movePieceLeft: (state) => {
      if (!state.activePiece || state.status !== 'playing') return;
      state.activePiece = moveLeft(state.board, state.activePiece);
    },

    movePieceRight: (state) => {
      if (!state.activePiece || state.status !== 'playing') return;
      state.activePiece = moveRight(state.board, state.activePiece);
    },

    movePieceDown: (state) => {
      if (!state.activePiece || state.status !== 'playing') return;
      const result = moveDown(state.board, state.activePiece);
      if (result !== null) {
        // Descente possible → mettre à jour la position
        state.activePiece = result;
      }
      // Si null → la pièce est arrivée en bas, lockPiece doit être appelé
    },

    rotatePiece: (state) => {
      if (!state.activePiece || state.status !== 'playing') return;
      state.activePiece = rotatePiece(state.board, state.activePiece);
    },

    hardDropPiece: (state) => {
      if (!state.activePiece || state.status !== 'playing') return;
      state.activePiece = hardDrop(state.board, state.activePiece);
      // Après un hard drop, la pièce doit être immédiatement figée
      // → lockPiece sera dispatché juste après
    },

    // ─────────────────────────────────────────
    // Figer la pièce sur le plateau
    // ─────────────────────────────────────────
    lockPiece: (state) => {
      if (!state.activePiece || state.status !== 'playing') return;

      // 1. Appliquer d'abord les lignes de pénalité en attente
      let board = state.board;
      if (state.penaltyQueue > 0) {
        board = addPenaltyLines(board, state.penaltyQueue);
        state.penaltyQueue = 0;
      }

      // 2. Fusionner la pièce dans le plateau
      board = mergePiece(board, state.activePiece);
      state.activePiece = null;

      // 3. Effacer les lignes complètes
      const { board: clearedBoard, linesCleared } = clearLines(board);
      state.board = clearedBoard;
      state.linesJustCleared = linesCleared;
    },

    // ─────────────────────────────────────────
    // Pénalités reçues des adversaires
    // ─────────────────────────────────────────
    addPenaltyLines: (state, action: PayloadAction<number>) => {
      // Accumuler les pénalités : elles seront appliquées au prochain lock
      state.penaltyQueue += action.payload;
    },

    // ─────────────────────────────────────────
    // Statut de la partie
    // ─────────────────────────────────────────
    setGameStatus: (state, action: PayloadAction<GameState['status']>) => {
      state.status = action.payload;
    },

    resetGame: () => initialState,
  },
});

export const {
  setActivePiece,
  setNextPiece,
  movePieceLeft,
  movePieceRight,
  movePieceDown,
  rotatePiece: rotatePieceAction,
  hardDropPiece,
  lockPiece,
  addPenaltyLines: addPenaltyLinesAction,
  setGameStatus,
  resetGame,
} = gameSlice.actions;

export default gameSlice.reducer;
```

### 6.4 `store/slices/roomSlice.ts` — État de la room

```typescript
// src/store/slices/roomSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { IPlayerInfo, IRoomState, RoomStatePayload, SpectrumUpdatePayload } from '@/types';

interface RoomState {
  roomName: string;
  playerName: string;
  players: IPlayerInfo[];
  isHost: boolean;
  spectrums: Record<string, number[]>;
  gameStatus: 'waiting' | 'playing' | 'ended';
  winner: string | null;
}

const initialState: RoomState = {
  roomName: '',
  playerName: '',
  players: [],
  isHost: false,
  spectrums: {},
  gameStatus: 'waiting',
  winner: null,
};

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    // Stocke room et player à la navigation vers /<room>/<player>
    setRoomInfo: (state, action: PayloadAction<{ roomName: string; playerName: string }>) => {
      state.roomName = action.payload.roomName;
      state.playerName = action.payload.playerName;
    },

    // Reçu du serveur après JOIN_ROOM : état complet de la room
    setRoomState: (state, action: PayloadAction<RoomStatePayload>) => {
      state.players = action.payload.players;
      state.gameStatus = action.payload.gameStatus;
      state.isHost = action.payload.isHost;
    },

    playerJoined: (state, action: PayloadAction<IPlayerInfo>) => {
      // Éviter les doublons
      const exists = state.players.some(p => p.name === action.payload.name);
      if (!exists) state.players.push(action.payload);
    },

    playerLeft: (state, action: PayloadAction<{ playerName: string }>) => {
      state.players = state.players.filter(p => p.name !== action.payload.playerName);
      // Supprimer son spectre
      delete state.spectrums[action.payload.playerName];
    },

    hostChanged: (state, action: PayloadAction<{ newHost: string }>) => {
      // Mettre à jour le flag isHost pour chaque joueur
      state.players = state.players.map(p => ({
        ...p,
        isHost: p.name === action.payload.newHost,
      }));
    },

    updateSpectrum: (state, action: PayloadAction<SpectrumUpdatePayload>) => {
      state.spectrums[action.payload.playerName] = action.payload.spectrum;
    },

    playerEliminated: (state, action: PayloadAction<{ playerName: string }>) => {
      state.players = state.players.map(p =>
        p.name === action.payload.playerName ? { ...p, isAlive: false } : p
      );
    },

    gameStarted: (state) => {
      state.gameStatus = 'playing';
      state.winner = null;
      // Réinitialiser les spectres
      state.spectrums = {};
      // Réinitialiser isAlive pour tous les joueurs
      state.players = state.players.map(p => ({ ...p, isAlive: true }));
    },

    gameEnded: (state, action: PayloadAction<{ winner: string }>) => {
      state.gameStatus = 'ended';
      state.winner = action.payload.winner;
    },
  },
});

export const {
  setRoomInfo,
  setRoomState,
  playerJoined,
  playerLeft,
  hostChanged,
  updateSpectrum,
  playerEliminated,
  gameStarted,
  gameEnded,
} = roomSlice.actions;

export default roomSlice.reducer;
```

### 6.5 `store/slices/uiSlice.ts` — État de l'interface

```typescript
// src/store/slices/uiSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  overlayVisible: boolean;             // Afficher l'overlay de fin de partie ?
  overlayMessage: string;              // "Game Over" ou "You Win!"
  isWinner: boolean;                   // Ce joueur a-t-il gagné ?
  errorMessage: string | null;         // Erreurs affichées à l'utilisateur
}

const initialState: UIState = {
  overlayVisible: false,
  overlayMessage: '',
  isWinner: false,
  errorMessage: null,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    showOverlay: (state, action: PayloadAction<{ message: string; isWinner: boolean }>) => {
      state.overlayVisible = true;
      state.overlayMessage = action.payload.message;
      state.isWinner = action.payload.isWinner;
    },

    hideOverlay: (state) => {
      state.overlayVisible = false;
      state.overlayMessage = '';
      state.isWinner = false;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.errorMessage = action.payload;
    },
  },
});

export const { showOverlay, hideOverlay, setError } = uiSlice.actions;
export default uiSlice.reducer;
```

### 6.6 `store/middleware/socketMiddleware.ts` — Pont Redux ↔ Socket.IO

Ce middleware est la **pièce centrale** de l'architecture. Il écoute les événements socket et les traduit en actions Redux, et inversement surveille certaines actions Redux pour émettre des événements socket.

```typescript
// src/store/middleware/socketMiddleware.ts
import { Middleware } from '@reduxjs/toolkit';
import { getSocket } from '@/socket/socket';
import { SOCKET_EVENTS } from '@/socket/events';
import {
  setRoomState, playerJoined, playerLeft, hostChanged,
  updateSpectrum, playerEliminated, gameStarted, gameEnded,
} from '../slices/roomSlice';
import {
  setActivePiece, setNextPiece, addPenaltyLinesAction,
  setGameStatus, resetGame,
} from '../slices/gameSlice';
import { showOverlay, hideOverlay } from '../slices/uiSlice';
import type { RootState } from '../index';

export const socketMiddleware: Middleware<{}, RootState> = (storeAPI) => {
  // ──────────────────────────────────────────────────────
  // Abonnement aux événements entrants du serveur
  // Ce bloc est exécuté UNE SEULE FOIS à l'initialisation du store
  // ──────────────────────────────────────────────────────
  const socket = getSocket();
  const dispatch = storeAPI.dispatch;

  // État de la room reçu après JOIN_ROOM
  socket.on(SOCKET_EVENTS.ROOM_STATE, (payload) => {
    dispatch(setRoomState(payload));
  });

  // Un joueur a rejoint la room
  socket.on(SOCKET_EVENTS.PLAYER_JOINED, (payload) => {
    dispatch(playerJoined(payload));
  });

  // Un joueur a quitté la room
  socket.on(SOCKET_EVENTS.PLAYER_LEFT, (payload) => {
    dispatch(playerLeft(payload));
  });

  // L'hôte a changé
  socket.on(SOCKET_EVENTS.HOST_CHANGED, (payload) => {
    dispatch(hostChanged(payload));
  });

  // La partie commence
  socket.on(SOCKET_EVENTS.GAME_STARTED, () => {
    dispatch(gameStarted());
    dispatch(setGameStatus('playing'));
    dispatch(hideOverlay());
    dispatch(resetGame());
    // Demander immédiatement la première pièce
    const state = storeAPI.getState();
    socket.emit(SOCKET_EVENTS.REQUEST_PIECE, { room: state.room.roomName });
  });

  // Réception d'une nouvelle pièce du serveur
  socket.on(SOCKET_EVENTS.NEW_PIECE, (payload) => {
    const state = storeAPI.getState();
    // Si on a déjà une pièce active, la nouvelle devient la "next"
    if (state.game.activePiece !== null) {
      dispatch(setNextPiece(payload.piece));
    } else {
      dispatch(setActivePiece(payload.piece));
      // Demander déjà la pièce suivante
      socket.emit(SOCKET_EVENTS.REQUEST_PIECE, { room: state.room.roomName });
    }
  });

  // Mise à jour du spectre d'un adversaire
  socket.on(SOCKET_EVENTS.SPECTRUM_UPDATE, (payload) => {
    dispatch(updateSpectrum(payload));
  });

  // Lignes de pénalité reçues d'un adversaire
  socket.on(SOCKET_EVENTS.PENALTY_LINES, (payload) => {
    dispatch(addPenaltyLinesAction(payload.count));
  });

  // Un joueur a été éliminé
  socket.on(SOCKET_EVENTS.PLAYER_ELIMINATED, (payload) => {
    dispatch(playerEliminated(payload));
    // Vérifier si c'est nous
    const state = storeAPI.getState();
    if (payload.playerName === state.room.playerName) {
      dispatch(setGameStatus('lost'));
      dispatch(showOverlay({ message: 'Game Over', isWinner: false }));
    }
  });

  // Fin de partie
  socket.on(SOCKET_EVENTS.GAME_OVER, (payload) => {
    dispatch(gameEnded(payload));
    const state = storeAPI.getState();
    const isWinner = payload.winner === state.room.playerName;
    dispatch(showOverlay({
      message: isWinner ? '🏆 You Win!' : `${payload.winner} wins!`,
      isWinner,
    }));
  });

  // ──────────────────────────────────────────────────────
  // Interception des actions Redux sortantes
  // ──────────────────────────────────────────────────────
  return (next) => (action: any) => {
    const state = storeAPI.getState();
    const room = state.room.roomName;

    // Quand une pièce est figée, envoyer les infos au serveur
    if (action.type === 'game/lockPiece') {
      // Laisser le reducer traiter l'action d'abord
      const result = next(action);
      // Ensuite lire le nouvel état
      const newState = storeAPI.getState();

      // Envoyer les lignes effacées si > 0
      if (newState.game.linesJustCleared > 0) {
        socket.emit(SOCKET_EVENTS.LINES_CLEARED, {
          room,
          count: newState.game.linesJustCleared,
        });
      }

      // Envoyer le nouveau spectre
      // (le spectre est calculé dans le hook useGameLoop, pas ici)

      // Demander la prochaine pièce
      socket.emit(SOCKET_EVENTS.REQUEST_PIECE, { room });

      return result;
    }

    // Quand le joueur est éliminé
    if (action.type === 'game/setGameStatus' && action.payload === 'lost') {
      next(action);
      socket.emit(SOCKET_EVENTS.GAME_OVER_PLAYER, { room });
      return;
    }

    return next(action);
  };
};
```

---

## 7. Socket.IO Client — Connexion et Événements

### 7.1 `socket/events.ts` — Constantes des événements

```typescript
// src/socket/events.ts
// Source de vérité unique pour tous les noms d'événements socket.
// Doit être identique côté serveur.
export const SOCKET_EVENTS = {
  // Client → Serveur
  JOIN_ROOM:          'JOIN_ROOM',
  START_GAME:         'START_GAME',
  REQUEST_PIECE:      'REQUEST_PIECE',
  UPDATE_SPECTRUM:    'UPDATE_SPECTRUM',
  LINES_CLEARED:      'LINES_CLEARED',
  GAME_OVER_PLAYER:   'GAME_OVER_PLAYER',
  RESTART_GAME:       'RESTART_GAME',

  // Serveur → Client
  ROOM_STATE:         'ROOM_STATE',
  PLAYER_JOINED:      'PLAYER_JOINED',
  PLAYER_LEFT:        'PLAYER_LEFT',
  HOST_CHANGED:       'HOST_CHANGED',
  GAME_STARTED:       'GAME_STARTED',
  NEW_PIECE:          'NEW_PIECE',
  SPECTRUM_UPDATE:    'SPECTRUM_UPDATE',
  PENALTY_LINES:      'PENALTY_LINES',
  PLAYER_ELIMINATED:  'PLAYER_ELIMINATED',
  GAME_OVER:          'GAME_OVER',
} as const;

export type SocketEvent = typeof SOCKET_EVENTS[keyof typeof SOCKET_EVENTS];
```

### 7.2 `socket/socket.ts` — Instance singleton

```typescript
// src/socket/socket.ts
import { io, Socket } from 'socket.io-client';

// Variable module-level : garantit qu'une seule connexion est créée
let socketInstance: Socket | null = null;

// getSocket : retourne l'instance existante ou en crée une nouvelle
// Pattern Singleton pour éviter les connexions multiples
export const getSocket = (): Socket => {
  if (!socketInstance) {
    const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
    socketInstance = io(serverUrl, {
      // autoConnect: false pour contrôler manuellement la connexion
      autoConnect: true,
      // Reconnecter automatiquement en cas de perte de réseau
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // Transports : websocket en priorité, polling en fallback
      transports: ['websocket', 'polling'],
    });
  }
  return socketInstance;
};

// resetSocket : déconnecte et réinitialise l'instance (utile pour les tests)
export const resetSocket = (): void => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};
```

---

## 8. Hooks Personnalisés

### 8.1 `hooks/useSocket.ts`

```typescript
// src/hooks/useSocket.ts
import { useEffect } from 'react';
import { getSocket } from '@/socket/socket';

// Hook qui garantit la connexion socket et nettoie à la destruction
const useSocket = () => {
  const socket = getSocket();

  useEffect(() => {
    // Connecter si pas déjà connecté
    if (!socket.connected) {
      socket.connect();
    }

    // Pas de cleanup ici : la déconnexion est gérée dans la page [room]/[player]
    // pour éviter de couper la connexion trop tôt
  }, [socket]);

  return socket;
};

export default useSocket;
```

### 8.2 `hooks/useGameLoop.ts`

Ce hook est le **moteur de la boucle de jeu**. Il déclenche la chute automatique des pièces à intervalle régulier et envoie les mises à jour du spectre au serveur.

```typescript
// src/hooks/useGameLoop.ts
import { useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { movePieceDown, lockPiece } from '@/store/slices/gameSlice';
import { getSocket } from '@/socket/socket';
import { SOCKET_EVENTS } from '@/socket/events';
import { computeSpectrum } from '@/game/spectrum';
import { moveDown } from '@/game/movement';
import { getGravityInterval } from '@/game/gravity';

const useGameLoop = () => {
  const dispatch = useAppDispatch();
  const gameStatus = useAppSelector(state => state.game.status);
  const board = useAppSelector(state => state.game.board);
  const activePiece = useAppSelector(state => state.game.activePiece);
  const roomName = useAppSelector(state => state.room.roomName);

  // Ref pour accéder aux dernières valeurs dans le setInterval sans stale closure
  const boardRef = useRef(board);
  const activePieceRef = useRef(activePiece);
  const gameStatusRef = useRef(gameStatus);

  boardRef.current = board;
  activePieceRef.current = activePiece;
  gameStatusRef.current = gameStatus;

  // ──────────────────────────────────────────
  // Boucle de gravité : tombe d'une ligne par tick
  // ──────────────────────────────────────────
  useEffect(() => {
    if (gameStatus !== 'playing') return;

    const interval = setInterval(() => {
      if (gameStatusRef.current !== 'playing') return;
      if (!activePieceRef.current) return;

      // Essayer de descendre la pièce
      const result = moveDown(boardRef.current, activePieceRef.current);

      if (result !== null) {
        // Descente possible → dispatcher l'action
        dispatch(movePieceDown());
      } else {
        // Pièce ne peut plus descendre → la figer
        dispatch(lockPiece());

        // Envoyer le spectre mis à jour au serveur
        const socket = getSocket();
        const spectrum = computeSpectrum(boardRef.current);
        socket.emit(SOCKET_EVENTS.UPDATE_SPECTRUM, {
          room: roomName,
          spectrum,
        });
      }
    }, getGravityInterval(1));

    // Cleanup : arrêter le timer si le statut change
    return () => clearInterval(interval);
  }, [gameStatus, dispatch, roomName]);
};

export default useGameLoop;
```

### 8.3 `hooks/useKeyboard.ts`

```typescript
// src/hooks/useKeyboard.ts
import { useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  movePieceLeft,
  movePieceRight,
  movePieceDown,
  rotatePieceAction,
  hardDropPiece,
  lockPiece,
} from '@/store/slices/gameSlice';
import { getSocket } from '@/socket/socket';
import { SOCKET_EVENTS } from '@/socket/events';
import { computeSpectrum } from '@/game/spectrum';

const useKeyboard = () => {
  const dispatch = useAppDispatch();
  const gameStatus = useAppSelector(state => state.game.status);
  const board = useAppSelector(state => state.game.board);
  const roomName = useAppSelector(state => state.room.roomName);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Désactiver les touches si le jeu n'est pas en cours
    if (gameStatus !== 'playing') return;

    // Empêcher le scroll de la page sur les flèches et la barre espace
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
      event.preventDefault();
    }

    switch (event.key) {
      case 'ArrowLeft':
        dispatch(movePieceLeft());
        break;

      case 'ArrowRight':
        dispatch(movePieceRight());
        break;

      case 'ArrowUp':
        dispatch(rotatePieceAction());
        break;

      case 'ArrowDown':
        // Soft drop : descente manuelle d'une ligne
        dispatch(movePieceDown());
        break;

      case ' ':
        // Hard drop : descente immédiate jusqu'en bas + lock
        dispatch(hardDropPiece());
        // Figer immédiatement après le hard drop
        dispatch(lockPiece());
        // Envoyer le spectre mis à jour
        const socket = getSocket();
        const spectrum = computeSpectrum(board);
        socket.emit(SOCKET_EVENTS.UPDATE_SPECTRUM, { room: roomName, spectrum });
        break;
    }
  }, [gameStatus, dispatch, board, roomName]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

export default useKeyboard;
```

---

## 9. Composants React

### 9.1 `components/Board/Board_Display.tsx`

Ce composant est **purement visuel**. Il ne contient aucune logique de jeu.
Il fusionne le plateau figé et la pièce active pour l'affichage.

```typescript
// src/components/Board/Board_Display.tsx
import { useAppSelector } from '@/store/hooks';
import { mergePiece } from '@/game/board';
import { getGhostPiece } from '@/game/movement';
import Cell from '@/components/Cell/Cell';
import styles from './Board.module.css';
import useGameLoop from '@/hooks/useGameLoop';
import useKeyboard from '@/hooks/useKeyboard';

const Board_Display = () => {
  // Activer la boucle de jeu et le clavier ici (composant principal du jeu)
  useGameLoop();
  useKeyboard();

  const board = useAppSelector(state => state.game.board);
  const activePiece = useAppSelector(state => state.game.activePiece);

  // Calculer le plateau d'affichage :
  // plateau figé + pièce fantôme + pièce active (dans cet ordre de superposition)
  const displayBoard = (() => {
    let display = board;

    if (activePiece) {
      // 1. Ajouter la pièce fantôme (position d'atterrissage)
      const ghostPiece = getGhostPiece(board, activePiece);
      // On crée un activePiece "ghost" avec un type spécial pour le style CSS
      const ghostAsActivePiece = { ...ghostPiece, type: 'ghost' as any };
      display = mergePiece(display, ghostAsActivePiece);

      // 2. Superposer la pièce active par-dessus
      display = mergePiece(display, activePiece);
    }

    return display;
  })();

  return (
    <div className={styles.board}>
      {displayBoard.map((row, rowIndex) =>
        row.map((cell, colIndex) => (
          <Cell
            key={`${rowIndex}-${colIndex}`}
            value={cell}
          />
        ))
      )}
    </div>
  );
};

export default Board_Display;
```

**CSS Module associé :**

```css
/* src/components/Board/Board.module.css */
.board {
  display: grid;
  grid-template-columns: repeat(10, 1fr); /* 10 colonnes */
  grid-template-rows: repeat(20, 1fr);    /* 20 lignes */
  width: 300px;   /* 10 × 30px */
  height: 600px;  /* 20 × 30px */
  border: 2px solid #555;
  background-color: #111;
  gap: 1px;
}
```

### 9.2 `components/Cell/Cell.tsx`

```typescript
// src/components/Cell/Cell.tsx
import { CellValue } from '@/types';
import styles from './Cell.module.css';

// Mapping valeur → couleur CSS
const CELL_COLORS: Record<number, string> = {
  0: 'transparent',   // Vide
  1: '#00f0f0',       // I - Cyan
  2: '#f0f000',       // O - Jaune
  3: '#a000f0',       // T - Violet
  4: '#00f000',       // S - Vert
  5: '#f00000',       // Z - Rouge
  6: '#0000f0',       // J - Bleu
  7: '#f0a000',       // L - Orange
  8: '#888888',       // Pénalité - Gris
};

interface CellProps {
  value: CellValue;
}

const Cell = ({ value }: CellProps) => {
  const color = CELL_COLORS[value] ?? 'transparent';
  const isEmpty = value === 0;

  return (
    <div
      className={`${styles.cell} ${isEmpty ? styles.empty : styles.filled}`}
      style={{ backgroundColor: color }}
    />
  );
};

export default Cell;
```

```css
/* src/components/Cell/Cell.module.css */
.cell {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.filled {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 2px;
  /* Effet 3D léger sur les blocs */
  box-shadow: inset 2px 2px 4px rgba(255,255,255,0.3),
              inset -2px -2px 4px rgba(0,0,0,0.4);
}

.empty {
  border: 1px solid rgba(255, 255, 255, 0.03);
}
```

### 9.3 `components/Piece/NextPiece.tsx`

```typescript
// src/components/Piece/NextPiece.tsx
import { useAppSelector } from '@/store/hooks';
import { getPieceShape, PIECE_COLORS } from '@/game/pieces';
import styles from './NextPiece.module.css';

const NextPiece = () => {
  const nextPiece = useAppSelector(state => state.game.nextPiece);

  if (!nextPiece) {
    return (
      <div className={styles.container}>
        <h3>Next</h3>
        <div className={styles.grid} />
      </div>
    );
  }

  const shape = getPieceShape(nextPiece.type, 0);
  const color = PIECE_COLORS[nextPiece.type];

  return (
    <div className={styles.container}>
      <h3>Next</h3>
      {/* Grille 4×4 pour afficher la pièce centrée */}
      <div className={styles.grid}>
        {shape.map((row, rowIndex) =>
          row.map((cell, colIndex) => (
            <div
              key={`next-${rowIndex}-${colIndex}`}
              className={styles.cell}
              style={{ backgroundColor: cell ? color : 'transparent' }}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default NextPiece;
```

```css
/* src/components/Piece/NextPiece.module.css */
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.container h3 {
  color: #ccc;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
}

.grid {
  display: grid;
  grid-template-columns: repeat(4, 24px);
  grid-template-rows: repeat(4, 24px);
  gap: 1px;
  background-color: #1a1a1a;
  padding: 4px;
  border: 1px solid #333;
}

.cell {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255,255,255,0.05);
}
```

### 9.4 `components/Spectrum/Spectrum.tsx`

```typescript
// src/components/Spectrum/Spectrum.tsx
import { useAppSelector } from '@/store/hooks';
import styles from './Spectrum.module.css';

const Spectrum = () => {
  const players = useAppSelector(state => state.room.players);
  const spectrums = useAppSelector(state => state.room.spectrums);
  const myName = useAppSelector(state => state.room.playerName);

  // Afficher uniquement les adversaires (pas soi-même)
  const opponents = players.filter(p => p.name !== myName);

  if (opponents.length === 0) {
    return null; // Pas d'adversaires en solo
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Opponents</h3>
      <div className={styles.spectrums}>
        {opponents.map(player => {
          const spectrum = spectrums[player.name] ?? Array(10).fill(0);
          return (
            <div key={player.name} className={styles.playerSpectrum}>
              <span className={`${styles.playerName} ${!player.isAlive ? styles.eliminated : ''}`}>
                {player.name}
                {!player.isAlive && ' 💀'}
              </span>
              {/* Mini-grille représentant le spectre : 10 colonnes × hauteur variable */}
              <div className={styles.grid}>
                {spectrum.map((height, colIndex) => (
                  <div key={colIndex} className={styles.column}>
                    {/* Afficher les blocs depuis le bas */}
                    {Array.from({ length: 20 }, (_, rowIndex) => {
                      // rowIndex 0 = haut, rowIndex 19 = bas
                      const isActive = 20 - rowIndex <= height;
                      return (
                        <div
                          key={rowIndex}
                          className={`${styles.cell} ${isActive ? styles.activeCell : ''}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Spectrum;
```

```css
/* src/components/Spectrum/Spectrum.module.css */
.container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title {
  color: #ccc;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin: 0;
}

.spectrums {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.playerSpectrum {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.playerName {
  font-size: 11px;
  color: #aaa;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.eliminated {
  color: #f00;
  text-decoration: line-through;
}

.grid {
  display: flex;
  flex-direction: row;
  gap: 1px;
  border: 1px solid #333;
  padding: 2px;
  background: #111;
}

.column {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cell {
  width: 6px;
  height: 6px;
  background-color: #222;
}

.activeCell {
  background-color: #e74c3c; /* Rouge pour le spectre */
}
```

### 9.5 `components/Lobby/Lobby.tsx`

```typescript
// src/components/Lobby/Lobby.tsx
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { getSocket } from '@/socket/socket';
import { SOCKET_EVENTS } from '@/socket/events';
import styles from './Lobby.module.css';

const Lobby = () => {
  const players = useAppSelector(state => state.room.players);
  const isHost = useAppSelector(state => state.room.isHost);
  const roomName = useAppSelector(state => state.room.roomName);

  const handleStartGame = () => {
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.START_GAME, { room: roomName });
  };

  return (
    <div className={styles.lobby}>
      <h2 className={styles.title}>Room : <span>{roomName}</span></h2>
      <p className={styles.subtitle}>
        {isHost
          ? 'Vous êtes l\'hôte. Démarrez la partie quand tous les joueurs sont prêts.'
          : 'En attente que l\'hôte démarre la partie...'}
      </p>

      <div className={styles.playerList}>
        <h3>Joueurs connectés ({players.length})</h3>
        <ul>
          {players.map(player => (
            <li key={player.name} className={styles.playerItem}>
              <span className={styles.playerName}>{player.name}</span>
              {player.isHost && <span className={styles.hostBadge}>👑 Hôte</span>}
            </li>
          ))}
        </ul>
      </div>

      {/* Bouton visible uniquement pour l'hôte */}
      {isHost && (
        <button
          className={styles.startButton}
          onClick={handleStartGame}
          disabled={players.length < 1}
        >
          ▶ Démarrer la partie
        </button>
      )}
    </div>
  );
};

export default Lobby;
```

### 9.6 `components/Overlay/GameOverlay.tsx`

```typescript
// src/components/Overlay/GameOverlay.tsx
import { useAppSelector } from '@/store/hooks';
import { getSocket } from '@/socket/socket';
import { SOCKET_EVENTS } from '@/socket/events';
import styles from './GameOverlay.module.css';

const GameOverlay = () => {
  const { overlayMessage, isWinner } = useAppSelector(state => state.ui);
  const isHost = useAppSelector(state => state.room.isHost);
  const roomName = useAppSelector(state => state.room.roomName);

  const handleRestart = () => {
    const socket = getSocket();
    socket.emit(SOCKET_EVENTS.RESTART_GAME, { room: roomName });
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <h2 className={`${styles.message} ${isWinner ? styles.win : styles.lose}`}>
          {overlayMessage}
        </h2>

        {isHost && (
          <button className={styles.restartButton} onClick={handleRestart}>
            🔄 Rejouer
          </button>
        )}

        {!isHost && (
          <p className={styles.waitMessage}>En attente de l'hôte...</p>
        )}
      </div>
    </div>
  );
};

export default GameOverlay;
```

```css
/* src/components/Overlay/GameOverlay.module.css */
.overlay {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: #1a1a2e;
  border: 2px solid #e94560;
  border-radius: 12px;
  padding: 40px 60px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.message { font-size: 2.5rem; font-weight: bold; }
.win  { color: #f0c040; text-shadow: 0 0 20px #f0c040; }
.lose { color: #e94560; }

.restartButton {
  padding: 12px 32px;
  font-size: 1rem;
  background: #e94560;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}

.restartButton:hover { background: #c73652; }

.waitMessage { color: #888; font-size: 0.9rem; }
```

---

## 10. CSS — Règles et Styles

### 10.1 Règles obligatoires du sujet
- ❌ **Pas de `<TABLE />`** pour les layouts
- ❌ **Pas de Canvas**
- ❌ **Pas de SVG**
- ✅ **Obligatoire** : `display: grid` ou `display: flex` pour tous les layouts

### 10.2 `app/globals.css` — Reset global

```css
/* src/app/globals.css */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  background-color: #0d0d1a;
  color: #ffffff;
  font-family: 'Courier New', monospace;
  /* Empêcher le scroll sur les flèches */
  overflow: hidden;
}

/* Layout principal de la page de jeu */
.game-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 24px;
}

/* Layout de l'écran de jeu : spectre gauche + plateau + infos droite */
.game-layout {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 16px;
}
```

---

## 11. Tests Unitaires Frontend

### 11.1 Configuration Jest

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',  // 'jsdom' pour les tests de composants
  roots: ['<rootDir>/tests'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/game/**/*.ts',       // Fonctions pures : priorité absolue
    'src/store/**/*.ts',      // Slices Redux
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      functions: 70,
      lines: 70,
      branches: 50,
    },
  },
};
```

### 11.2 Exemples de tests — `board.test.ts`

```typescript
// tests/game/board.test.ts
import {
  createBoard, isValidPosition, mergePiece, addPenaltyLines,
  BOARD_WIDTH, BOARD_HEIGHT
} from '@/game/board';
import { ActivePiece } from '@/types';
import { getPieceShape } from '@/game/pieces';

describe('createBoard', () => {
  it('crée un plateau de 20 lignes', () => {
    expect(createBoard().length).toBe(20);
  });

  it('crée un plateau de 10 colonnes par ligne', () => {
    createBoard().forEach(row => expect(row.length).toBe(10));
  });

  it('initialise toutes les cellules à 0', () => {
    createBoard().forEach(row => row.forEach(cell => expect(cell).toBe(0)));
  });
});

describe('isValidPosition', () => {
  const board = createBoard();
  const piece: ActivePiece = {
    type: 'O',
    shape: getPieceShape('O', 0),
    position: { x: 4, y: 0 },
    rotation: 0,
  };

  it('retourne true pour une position valide au centre', () => {
    expect(isValidPosition(board, piece)).toBe(true);
  });

  it('retourne false si la pièce dépasse à gauche', () => {
    const leftPiece = { ...piece, position: { x: -1, y: 0 } };
    expect(isValidPosition(board, leftPiece)).toBe(false);
  });

  it('retourne false si la pièce dépasse en bas', () => {
    const bottomPiece = { ...piece, position: { x: 4, y: 19 } };
    expect(isValidPosition(board, bottomPiece)).toBe(false);
  });

  it('retourne false en cas de collision avec un bloc existant', () => {
    const boardWithBlock = createBoard();
    boardWithBlock[1][4] = 1; // Bloc à la position (4, 1)
    expect(isValidPosition(boardWithBlock, piece)).toBe(false);
  });
});

describe('addPenaltyLines', () => {
  it('ajoute le bon nombre de lignes en bas', () => {
    const board = createBoard();
    const newBoard = addPenaltyLines(board, 2);
    // Les 2 dernières lignes doivent contenir des blocs (valeur 8)
    const lastTwoRows = newBoard.slice(18);
    lastTwoRows.forEach(row => {
      const nonZero = row.filter(c => c !== 0);
      expect(nonZero.length).toBeGreaterThan(0);
    });
  });

  it('maintient la hauteur du plateau à 20', () => {
    const board = createBoard();
    expect(addPenaltyLines(board, 3).length).toBe(20);
  });

  it('ne modifie pas le plateau si count = 0', () => {
    const board = createBoard();
    expect(addPenaltyLines(board, 0)).toBe(board);
  });
});
```

### 11.3 Exemples de tests — `lines.test.ts`

```typescript
// tests/game/lines.test.ts
import { clearLines, getPenaltyCount, isLineComplete } from '@/game/lines';
import { createBoard } from '@/game/board';
import { BoardRow } from '@/types';

describe('isLineComplete', () => {
  it('retourne false pour une ligne vide', () => {
    const emptyRow: BoardRow = Array(10).fill(0);
    expect(isLineComplete(emptyRow)).toBe(false);
  });

  it('retourne true pour une ligne pleine', () => {
    const fullRow: BoardRow = Array(10).fill(1) as BoardRow;
    expect(isLineComplete(fullRow)).toBe(true);
  });

  it('retourne false si un seul trou', () => {
    const row: BoardRow = Array(10).fill(1) as BoardRow;
    row[5] = 0;
    expect(isLineComplete(row)).toBe(false);
  });
});

describe('clearLines', () => {
  it('retourne le même plateau si aucune ligne complète', () => {
    const board = createBoard();
    const { board: result, linesCleared } = clearLines(board);
    expect(linesCleared).toBe(0);
    expect(result).toEqual(board);
  });

  it('supprime les lignes complètes et retasse le plateau', () => {
    const board = createBoard();
    // Remplir les lignes 18 et 19 (les deux dernières)
    board[18] = Array(10).fill(1) as BoardRow;
    board[19] = Array(10).fill(1) as BoardRow;

    const { board: result, linesCleared } = clearLines(board);
    expect(linesCleared).toBe(2);
    expect(result.length).toBe(20); // Toujours 20 lignes
    // Les 2 dernières lignes doivent maintenant être vides
    expect(result[18].every(c => c === 0)).toBe(true);
    expect(result[19].every(c => c === 0)).toBe(true);
  });
});

describe('getPenaltyCount', () => {
  it('retourne 0 pour 1 ligne effacée', () => {
    expect(getPenaltyCount(1)).toBe(0);
  });
  it('retourne 1 pour 2 lignes effacées', () => {
    expect(getPenaltyCount(2)).toBe(1);
  });
  it('retourne 3 pour 4 lignes effacées (Tetris)', () => {
    expect(getPenaltyCount(4)).toBe(3);
  });
});
```

### 11.4 Exemples de tests — `movement.test.ts`

```typescript
// tests/game/movement.test.ts
import { moveLeft, moveRight, moveDown, rotatePiece, hardDrop } from '@/game/movement';
import { createBoard } from '@/game/board';
import { getPieceShape } from '@/game/pieces';
import { ActivePiece } from '@/types';

const createPiece = (x: number, y: number): ActivePiece => ({
  type: 'T',
  shape: getPieceShape('T', 0),
  position: { x, y },
  rotation: 0,
});

describe('moveLeft', () => {
  it('déplace la pièce de -1 en X', () => {
    const board = createBoard();
    const piece = createPiece(4, 5);
    const result = moveLeft(board, piece);
    expect(result.position.x).toBe(3);
  });

  it('ne déplace pas si collision avec le mur gauche', () => {
    const board = createBoard();
    const piece = createPiece(0, 5);
    const result = moveLeft(board, piece);
    expect(result.position.x).toBe(0); // Inchangé
  });
});

describe('moveDown', () => {
  it('retourne null quand la pièce touche le fond', () => {
    const board = createBoard();
    const piece = createPiece(4, 18);
    expect(moveDown(board, piece)).toBeNull();
  });

  it('descend normalement si espace libre', () => {
    const board = createBoard();
    const piece = createPiece(4, 0);
    const result = moveDown(board, piece);
    expect(result?.position.y).toBe(1);
  });
});

describe('hardDrop', () => {
  it('place la pièce au bas du plateau', () => {
    const board = createBoard();
    const piece = createPiece(4, 0);
    const result = hardDrop(board, piece);
    // La pièce T (3×3) posée depuis y=0 → sa dernière ligne à y=19
    expect(result.position.y).toBeGreaterThan(15);
  });
});
```

---

## 12. Contraintes et Pièges à éviter

### 12.1 ❌ Interdit : le mot-clé `this`

```typescript
// ❌ INTERDIT côté client
class GameManager {
  private board = createBoard();
  move() { this.board = moveLeft(this.board, ...); } // INTERDIT
}

// ✅ CORRECT : fonctions pures + Redux
const movePieceLeft = (state: GameState) => {
  state.activePiece = moveLeft(state.board, state.activePiece!);
};
```

### 12.2 ❌ Interdit : mutation directe des tableaux

```typescript
// ❌ INTERDIT : mutation en place
const badMerge = (board: BoardType, piece: ActivePiece) => {
  board[0][0] = 1; // Mutation directe → INTERDIT
  return board;
};

// ✅ CORRECT : retourner un nouveau tableau
const goodMerge = (board: BoardType, piece: ActivePiece): BoardType => {
  const newBoard = board.map(row => [...row]); // Copie profonde
  // ... modifications sur newBoard
  return newBoard;
};
```

### 12.3 ❌ Interdit : jQuery, Canvas, SVG

```typescript
// ❌ INTERDIT
$('#board').append('<div>'); // jQuery → interdit
const ctx = canvas.getContext('2d'); // Canvas → interdit
<svg>...</svg>  // SVG → interdit
<table>...</table> // TABLE → interdit

// ✅ CORRECT : div + CSS Grid
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)' }}>
  {cells.map(cell => <div key={...} />)}
</div>
```

### 12.4 ⚠️ Piège : Stale Closures dans les Hooks

```typescript
// ❌ PIÈGE : le setInterval capture les valeurs initiales (stale closure)
useEffect(() => {
  const interval = setInterval(() => {
    dispatch(movePieceDown()); // ✅ OK (dispatch est stable)
    // ⚠️ Si on lit `board` directement ici, c'est la valeur initiale !
    console.log(board); // Toujours la valeur de la 1ère render !
  }, 800);
  return () => clearInterval(interval);
}, []); // [] = exécuté une seule fois → closure figée

// ✅ SOLUTION : utiliser des refs pour accéder à la valeur courante
const boardRef = useRef(board);
boardRef.current = board; // Mis à jour à chaque render

useEffect(() => {
  const interval = setInterval(() => {
    console.log(boardRef.current); // Toujours la valeur courante ✅
  }, 800);
  return () => clearInterval(interval);
}, []); // OK car on utilise la ref, pas la variable directe
```

### 12.5 ⚠️ Piège : Double initialisation Socket

```typescript
// ❌ PIÈGE : créer le socket directement dans un composant
// → crée une nouvelle connexion à chaque re-render !
const MyComponent = () => {
  const socket = io('http://localhost:3001'); // FAUX ! Recrée à chaque render
};

// ✅ SOLUTION : utiliser le singleton getSocket()
const MyComponent = () => {
  const socket = getSocket(); // Toujours la même instance
};
```

### 12.6 ⚠️ Piège : `'use client'` manquant dans Next.js

```typescript
// ❌ Par défaut, Next.js 14 traite les composants comme Server Components
// Les Server Components ne peuvent PAS utiliser :
// - useState, useEffect, useSelector...
// - window, document...
// - socket.io...

// ✅ Ajouter 'use client' en haut de tous les composants interactifs
'use client';
import { useState } from 'react';
```

---

## 📌 Récapitulatif des règles essentielles

| Règle | Statut | Détail |
|---|---|---|
| Pas de `this` côté client | ❌ Interdit | Sauf sous-classes de `Error` |
| Pas de jQuery | ❌ Interdit | Manipulation DOM directe interdite |
| Pas de Canvas | ❌ Interdit | Utiliser `div` + CSS |
| Pas de SVG | ❌ Interdit | — |
| Pas de `<TABLE />` | ❌ Interdit | Utiliser `grid` / `flexbox` |
| Fonctions pures | ✅ Obligatoire | Tout le dossier `game/` |
| SPA | ✅ Obligatoire | Next.js App Router |
| Couverture tests ≥ 70% | ✅ Obligatoire | Statements, Functions, Lines |
| Couverture branches ≥ 50% | ✅ Obligatoire | — |
| `.env` gitignored | ✅ Obligatoire | Ne jamais commit les secrets |
