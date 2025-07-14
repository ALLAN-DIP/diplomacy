"""Provide utilities for logging."""

import logging
import os


def initialize_logging() -> None:
    # Defining root logger
    ROOT = logging.getLogger("diplomacy")
    ROOT.setLevel(logging.DEBUG)
    ROOT.propagate = False

    STREAM_HANDLER = logging.StreamHandler()
    STREAM_HANDLER.setLevel(logging.DEBUG)

    # Monkey patch module to show milliseconds
    logging.Formatter.default_msec_format = "%s.%03d"

    FORMATTER = logging.Formatter(
        fmt="[%(asctime)s] [%(levelname)s] [%(name)s[%(process)d]] %(message)s"
    )
    STREAM_HANDLER.setFormatter(FORMATTER)
    ROOT.addHandler(STREAM_HANDLER)

    if "DIPLOMACY_LOG_FILE" in os.environ:
        LOG_FILE_NAME = os.environ["DIPLOMACY_LOG_FILE"]
        ROOT.info("Logging into file: %s", LOG_FILE_NAME)
        FILE_HANDLER = logging.FileHandler(LOG_FILE_NAME)
        FILE_HANDLER.setLevel(logging.DEBUG)
        LOG_FILE_FORMATTER = logging.Formatter(
            fmt="%(asctime)s %(name)s[%(process)d] %(levelname)s %(message)s"
        )
        FILE_HANDLER.setFormatter(LOG_FILE_FORMATTER)
        ROOT.addHandler(FILE_HANDLER)
