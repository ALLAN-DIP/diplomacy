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

.PHONY: pytest
pytest:
	pytest --verbosity=1 --numprocesses auto diplomacy

.PHONY: check
check:
	$(MAKE) pytest
	./run_tests.sh

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
	docker build \
		--platform linux/amd64 \
		--tag ghcr.io/allan-dip/diplomacy:$(TAG) \
		.
