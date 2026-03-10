## Tests & Couverture

### 1 Objectifs de couverture (imposés par le sujet)
- **Statements** : ≥ 70%
- **Functions** : ≥ 70%
- **Lines** : ≥ 70%
- **Branches** : ≥ 50%

### 2 Framework recommandé
- **Jest** + **ts-jest** pour TypeScript
- **@testing-library/react** pour les composants React
- **socket.io-mock** ou **socket.io-client** en mode test pour les tests d'intégration socket

### 3 Ce qu'il faut tester

#### Tests des fonctions pures (client/game/)
Ces fonctions sont les plus faciles à tester car elles n'ont pas d'effets de bord.

- `board.ts`
  - `createBoard()` → vérifier dimensions 10×20, tous les éléments à 0
  - `isValidPosition()` → tester aux limites, sur des pièces existantes
  - `mergePiece()` → vérifier que la pièce est bien fusionnée
  - `addPenaltyLines()` → vérifier le décalage vers le haut et les lignes indestructibles

- `movement.ts`
  - `moveLeft/Right()` → tester le déplacement normal et le blocage aux murs
  - `rotatePiece()` → tester les 4 rotations pour chaque tetrimino
  - `hardDrop()` → vérifier que la pièce atterrit correctement

- `lines.ts`
  - `getCompletedLines()` → plateau vide, une ligne pleine, plusieurs lignes pleines
  - `clearLines()` → vérifier que les lignes disparaissent et que le reste descend

#### Tests des composants React

- `Board.tsx` → rend une grille de 200 cellules
- `Spectrum.tsx` → affiche le spectre correctement
- `Lobby.tsx` → affiche le bouton Start uniquement pour le host

#### Tests d'intégration Socket

- Connexion client → événement `JOIN_ROOM` → réponse `ROOM_STATE`
- Démarrage par le host → `GAME_STARTED` reçu par tous les joueurs

### 4 Commandes de test

```bash
# Lancer les tests avec couverture
npm run test -- --coverage

# Rapport de couverture HTML
npm run test -- --coverage --coverageReporters=html
```

---
