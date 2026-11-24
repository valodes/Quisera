# Bibliothèque de recettes

Les routes `/api/recipes` exigent une session Better Auth. Elles couvrent liste paginée, recherche, favoris individuels, détail, écriture et suppression des recettes maison, ainsi que les photos privées. Une recette maison référencée dans un repas planifié ne peut pas être supprimée (HTTP 409).

Les recettes et favoris Quitoque déjà présents sont conservés. Les nouveaux imports de catalogue complet et leurs routes ont été retirés. Les recettes maison restent la source de la bibliothèque ; les sélections Quitoque appartiennent à une livraison et ne deviennent pas des recettes maison.

## Synchronisation des livraisons

La seule origine externe reste `https://app.quitoque.fr/api/v2`. La synchronisation manuelle récupère les commandes, leur `deliveryDate` réelle et les lignes `/shop/orders/{tokenValue}/items`. Les identifiants externes restent en mémoire côté serveur. Les produits sélectionnés sont enrichis par leur identifiant dans le catalogue de la période de commande, filtré sur la famille recette. Aucune commande n'est modifiée.

Routes internes protégées : `POST /api/planning/quitoque/sync`, `POST /api/planning/deliveries/:id/recipes/sync` et `GET /api/planning/deliveries/:id`. Les cycles conservent un snapshot des sélections et des images pour rester affichables lorsque Quitoque est indisponible. Les dates de période servent uniquement à enrichir le contenu ; seul `deliveryDate` ancre le cycle.

Les sélections gardent l'ordre des lignes API et chaque occurrence de quantité. Les champs absents restent absents : Nutri-Score est renseigné uniquement avec un grade A–E vérifié ; difficulté et carbone ne sont pas inventés. Voir [quitoque-api-discovery.md](quitoque-api-discovery.md) pour les observations de contrat.
