.PHONY: default
default:
	@echo "an explicit target is required"

SHELL=/usr/bin/env bash

.PHONY: update-npm
update-npm:
	cd diplomacy/web/ && \
	npm install --force

.PHONY: update-pip
update-pip:
	pip install --upgrade pip
	pip install --upgrade -r requirements-lock.txt -e .[dev]

.PHONY: install
install:
	make update-npm
	make update-pip

TAG ?= latest

.PHONY: build
build:
	docker build \
		--platform linux/amd64 \
		--tag ghcr.io/allan-dip/diplomacy:$(TAG) \
		.
