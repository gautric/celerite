# Makefile - Expérience ligne de visée laser Meudon -> Paris Arago
# Sert l'application statique via un serveur Node (http-server lancé par npx).

# Port d'écoute (surchargeable : make serve PORT=9000)
PORT ?= 8000
URL  := http://localhost:$(PORT)

.DEFAULT_GOAL := serve

.PHONY: serve start open stop help

## serve : lance le serveur statique Node sur $(PORT) (Ctrl+C pour arrêter)
serve:
	@echo "Serveur Node sur $(URL)  (Ctrl+C pour arrêter)"
	npx --yes http-server . -p $(PORT) -c-1 -o

## start : alias de serve, sans ouverture automatique du navigateur
start:
	@echo "Serveur Node sur $(URL)  (Ctrl+C pour arrêter)"
	npx --yes http-server . -p $(PORT) -c-1

## open : ouvre l'application dans le navigateur par défaut (macOS)
open:
	@open $(URL)

## stop : stoppe un serveur http-server qui tournerait sur $(PORT)
stop:
	@pid=$$(lsof -ti tcp:$(PORT)); \
	if [ -n "$$pid" ]; then kill $$pid && echo "Serveur arrêté (port $(PORT))"; \
	else echo "Aucun serveur sur le port $(PORT)"; fi

## help : liste les cibles disponibles
help:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //'
