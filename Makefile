.PHONY: default
default:
	@echo "an explicit target is required"

SHELL=/usr/bin/env bash

TAG ?= latest

.PHONY: build
build:
	docker build \
		--platform linux/amd64 \
		--tag ghcr.io/allan-dip/diplomacy:$(TAG) \
		.
