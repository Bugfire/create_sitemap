#

.PHONY: $(shell egrep -o ^[a-zA-Z_-]+: $(MAKEFILE_LIST) | sed 's/://')

TARGET=../bugfire.github.io
DEV=../ghp-app/public

all: help

build: ## Build sitemap.xml
	rm -rf build
	mkdir -p build
	npm run start

lint: ## Lint
	npm run lint

deploy: build ## Deploy xml to github
	cp build/sitemap.xml ../bugfire.github.io/
	cp build/sitemap.xml ../ghp-app/public/
	cp build/sitemap.xml ../ghp-app/build/

help: ## This help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
