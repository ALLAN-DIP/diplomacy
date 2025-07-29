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

.PHONY: actionlint
actionlint:
	pre-commit run --all-files actionlint

.PHONY: black
black:
	pre-commit run --all-files black

.PHONY: check-npm-build
check-npm-build:
	cd diplomacy/web/ && \
	npm run build

.PHONY: codespell
codespell:
	pre-commit run --all-files codespell

.PHONY: eslint
eslint:
	cd diplomacy/web/ && \
	npx eslint --ext js,jsx .

.PHONY: lychee
lychee:
	pre-commit run --all-files --hook-stage manual lychee

.PHONY: markdownlint
markdownlint:
	pre-commit run --all-files markdownlint

.PHONY: npm-test
npm-test:
	cd diplomacy/web/ && \
	npm run test

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
	npm install --force

.PHONY: upgrade-pip
upgrade-pip:
	pip install --upgrade pip
	pip install --upgrade --upgrade-strategy eager -e .[dev]

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
