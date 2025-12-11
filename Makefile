.PHONY: default
default:
	@echo "an explicit target is required"

SHELL=/usr/bin/env bash

.PHONY: lock
lock:
	uv lock


.PHONY: actionlint
actionlint:
	pre-commit run --all-files actionlint

.PHONY: black
black:
	pre-commit run --all-files black

.PHONY: check-npm-build
check-npm-build:
	cd diplomacy/web/ && \
	bun run build

.PHONY: codespell
codespell:
	pre-commit run --all-files codespell

.PHONY: eslint
eslint:
	cd diplomacy/web/ && \
	bunx eslint --ext js,jsx .

.PHONY: lychee
lychee:
	pre-commit run --all-files --hook-stage manual lychee

.PHONY: markdownlint
markdownlint:
	pre-commit run --all-files markdownlint

.PHONY: npm-test
npm-test:
	cd diplomacy/web/ && \
	bun run test

.PHONY: precommit
precommit:
	pre-commit run --all-files

.PHONY: prettier
prettier:
	pre-commit run --all-files prettier

.PHONY: pylint
pylint:
	find diplomacy -name "*.py" ! -name 'zzz_*.py' ! -name '_*.py' -exec pylint '{}' +

.PHONY: pytest
pytest:
	python -X dev -bb -X warn_default_encoding -m pytest

.PHONY: shellcheck
shellcheck:
	pre-commit run --all-files shellcheck

.PHONY: shfmt
shfmt:
	pre-commit run --all-files shfmt

.PHONY: sphinx
sphinx:
	cd docs && \
	$(MAKE) clean && \
	$(MAKE) html

.PHONY: yamllint
yamllint:
	pre-commit run --all-files yamllint

.PHONY: zizmor
zizmor:
	pre-commit run --all-files zizmor

.PHONY: check
check:
	$(MAKE) precommit
	$(MAKE) check-npm-build
	# $(MAKE) pylint
	# $(MAKE) eslint
	$(MAKE) sphinx
	$(MAKE) npm-test
	$(MAKE) pytest

.PHONY: update-npm
update-npm:
	cd diplomacy/web/ && \
	bun install

.PHONY: upgrade-pip
upgrade-pip:
	uv self update
	uv sync --upgrade

.PHONY: update-pip
update-pip:
	uv sync

.PHONY: install
install:
	$(MAKE) update-npm
	$(MAKE) update-pip

TAG ?= latest

.PHONY: build
build:
	docker buildx build \
		--platform linux/amd64 \
		--tag ghcr.io/allan-dip/diplomacy:$(TAG) \
		.
