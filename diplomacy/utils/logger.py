"""Provide utilities for logging."""

import logging
import os


def initialize_logging() -> None:
    # Defining root logger
    root = logging.getLogger("diplomacy")
    root.setLevel(logging.DEBUG)
    root.propagate = False

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.DEBUG)

    # Monkey patch module to show milliseconds
    logging.Formatter.default_msec_format = "%s.%03d"

    formatter = logging.Formatter(
        fmt="[%(asctime)s] [%(levelname)s] [%(name)s[%(process)d]] %(message)s"
    )
    stream_handler.setFormatter(formatter)
    root.addHandler(stream_handler)

    if "DIPLOMACY_LOG_FILE" in os.environ:
        log_file_name = os.environ["DIPLOMACY_LOG_FILE"]
        root.info("Logging into file: %s", log_file_name)
        file_handler = logging.FileHandler(log_file_name)
        file_handler.setLevel(logging.DEBUG)
        log_file_formatter = logging.Formatter(
            fmt="%(asctime)s %(name)s[%(process)d] %(levelname)s %(message)s"
        )
        file_handler.setFormatter(log_file_formatter)
        root.addHandler(file_handler)
