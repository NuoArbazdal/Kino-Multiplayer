# Mise en ligne — version de test des salons

Le serveur Node sert l'interface HTML et le WebSocket sur **la même adresse**. La configuration [render.yaml](render.yaml) déploie explicitement la branche `feature/game-integration`.

## Render

1. Connecter le compte Render et le dépôt GitHub `NuoArbazdal/Kino-Multiplayer`.
2. Créer un service Web à partir du Blueprint `render.yaml` de la branche `feature/game-integration`. Si Render impose de lire le Blueprint depuis la branche par défaut, créer directement un service Web relié à `feature/game-integration`, avec build `npm --prefix server install` et lancement `node server/index.mjs`.
3. Vérifier `https://<nom-du-service>.onrender.com/health` (JSON avec `status: "ok"`).
4. Ouvrir la racine `https://<nom-du-service>.onrender.com/` et créer / rejoindre un salon avec deux navigateurs.

Aucune URL de service n'est connue ou confirmée tant que Render n'a pas créé le service.

## Limites actuelles

Cette interface permet de tester les salons et le réseau. **Le jeu Kino complet n'est pas encore inclus dans cette branche** : le bouton Démarrer refuse de lancer une partie tant que `/game/index.html` n'existe pas. Il ne faut pas mettre en ligne ni redistribuer des assets tiers sans disposer des droits correspondants.

Le jeu original public https://kino-der-toten.pages.dev/ est indépendant de ce déploiement. Le test d'intégration GitHub vérifie seulement la transformation du code original sans les ressources graphiques, il ne prouve pas la jouabilité de la coop.
