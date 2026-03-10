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

#### Tests des classes serveur

- `Player` → création, propriétés initiales
- `Piece` → types valides, position de spawn
- `Game`
  - `addPlayer / removePlayer`
  - `start()` → séquence de pièces générée
  - `applyPenalty()` → pénalités correctement distribuées
  - `checkWinCondition()` → détection du dernier joueur
  - `transferHost()` → changement d'hôte



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
