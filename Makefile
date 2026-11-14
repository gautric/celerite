# Makefile - Expérience ligne de visée laser Meudon -> Paris Arago
# Sert l'application statique via le serveur Node sans dépendance (server.js).

# Port d'écoute (surchargeable : make serve PORT=9000)
PORT ?= 8000
URL  := http://localhost:$(PORT)

.DEFAULT_GOAL := serve

.PHONY: serve start open stop data social lint format test help

## serve : lance le serveur statique sur $(PORT) et ouvre le navigateur
serve: open-delayed
	@PORT=$(PORT) node server.js

## open-delayed : ouvre le navigateur après 1 s, en tâche de fond (usage interne)
open-delayed:
	@(sleep 1 && open $(URL) >/dev/null 2>&1 &) || true

## start : lance le serveur statique sur $(PORT) sans ouvrir le navigateur
start:
	@PORT=$(PORT) node server.js

## open : ouvre l'application dans le navigateur par défaut (macOS)
open:
	@open $(URL)

## stop : stoppe un serveur http-server qui tournerait sur $(PORT)
stop:
	@pid=$$(lsof -ti tcp:$(PORT)); \
	if [ -n "$$pid" ]; then kill $$pid && echo "Serveur arrêté (port $(PORT))"; \
	else echo "Aucun serveur sur le port $(PORT)"; fi

## data : pré-charge bâtiments (Overpass) + profil d'élévation (IGN) dans data/*.json
data:
	node scripts/build-data.mjs

## lint : analyse statique du JS (ESLint)
lint:
	npm run lint

## format : reformate le code (Prettier)
format:
	npm run format

## test : exécute les tests unitaires (Vitest)
test:
	npm test

## social : régénère l'image d'aperçu social 1200x630 (PNG) depuis le SVG
social:
	@command -v rsvg-convert >/dev/null 2>&1 || { \
	  echo "rsvg-convert manquant : brew install librsvg"; exit 1; }
	rsvg-convert -w 1200 -h 630 assets/social-card.svg -o assets/og-image.png
	@echo "assets/og-image.png régénéré (1200x630)"

## help : liste les cibles disponibles
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //'
