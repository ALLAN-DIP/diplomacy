.PHONY: default
default:
	@echo "an explicit target is required"

SHELL=/usr/bin/env bash

.PHONY: precommit
precommit:
	pre-commit run --all-files

.PHONY: check
check: precommit

TAG ?= latest

.PHONY: build
build:
	docker build \
		--platform linux/amd64 \
		--tag ghcr.io/allan-dip/diplomacy:$(TAG) \
		.
