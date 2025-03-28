.PHONY: default
default:
	@echo "an explicit target is required"

SHELL=/usr/bin/env bash

.PHONY: lock
lock:
	# Complex logic needed to pin `setuptools` but not `pip` in Python 3.11 and earlier
	PYTHON_VERSION_AT_LEAST_3_12=$(shell python -c 'import sys; print(int(sys.version_info >= (3, 12)))')
ifeq ($(PYTHON_VERSION_AT_LEAST_3_12),1)
	pip freeze >requirements-lock.txt
else
	pip freeze --all --exclude pip >requirements-lock.txt
endif
	# Remove editable packages because they are expected to be available locally
	sed --in-place -e '/^-e .*/d' requirements-lock.txt
	# Strip local versions so PyTorch is the same on Linux and macOS
	sed --in-place -e 's/+[[:alnum:]]\+$$//g' requirements-lock.txt
	# Remove nvidia-* and triton because they cannot be installed on macOS
	# The packages have no sdists, and their wheels are not available for macOS
	# They install automatically on Linux as a requirement of PyTorch
	sed --in-place -e '/^\(nvidia-.*\|triton\)==.*/d' requirements-lock.txt

.PHONY: check-npm-build
check-npm-build:
	cd diplomacy/web/ && \
	NODE_OPTIONS=--openssl-legacy-provider npm run build

.PHONY: eslint
eslint:
	cd diplomacy/web/ && \
	npx eslint --ext js,jsx .

.PHONY: precommit
precommit:
	pre-commit run --all-files

.PHONY: pylint
pylint:
	find diplomacy -name "*.py" ! -name 'zzz_*.py' ! -name '_*.py' -exec pylint '{}' +

.PHONY: pytest
pytest:
	pytest

.PHONY: sphinx
sphinx:
	cd docs && \
	$(MAKE) clean && \
	$(MAKE) html

.PHONY: check
check:
	$(MAKE) precommit
	$(MAKE) pytest
	# $(MAKE) pylint
	$(MAKE) sphinx
	# $(MAKE) eslint
	$(MAKE) check-npm-build

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
	$(MAKE) update-npm
	$(MAKE) update-pip

TAG ?= latest

.PHONY: build
build:
	docker buildx build \
		--platform linux/amd64 \
		--tag ghcr.io/allan-dip/diplomacy:$(TAG) \
		.
