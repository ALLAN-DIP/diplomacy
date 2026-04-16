# ==============================================================================
# Copyright (C) 2019 - Philip Paquette, Steven Bocco
#
#  This program is free software: you can redistribute it and/or modify it under
#  the terms of the GNU Affero General Public License as published by the Free
#  Software Foundation, either version 3 of the License, or (at your option) any
#  later version.
#
#  This program is distributed in the hope that it will be useful, but WITHOUT
#  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
#  FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
#  details.
#
#  You should have received a copy of the GNU Affero General Public License along
#  with this program.  If not, see <https://www.gnu.org/licenses/>.
# ==============================================================================
"""Tornado connection handler class, used internally to manage data received by server application."""
import logging
import os
import time
from collections import deque

from urllib.parse import urlparse
from tornado.websocket import WebSocketHandler, WebSocketClosedError

import ujson as json

import diplomacy.settings
from diplomacy.communication import responses, requests
from diplomacy.server import request_managers
from diplomacy.utils import exceptions, strings
from diplomacy.utils.network_data import NetworkData


LOGGER = logging.getLogger(__name__)

MAX_JSON_DEPTH = 32

# Per-connection sliding-window rate limit. Log-only for now: excess requests
# are still processed, but emit a warning so we can size the limit before
# turning enforcement on.
RATE_LIMIT_WINDOW_SECONDS = 1.0
RATE_LIMIT_MAX_REQUESTS = 60


def _check_json_depth(obj, max_depth=MAX_JSON_DEPTH):
    """Iteratively verify nested dict/list depth does not exceed max_depth."""
    stack = [(obj, 1)]
    while stack:
        current, depth = stack.pop()
        if depth > max_depth:
            raise ValueError("JSON payload exceeds maximum nesting depth of %d." % max_depth)
        if isinstance(current, dict):
            for value in current.values():
                if isinstance(value, (dict, list)):
                    stack.append((value, depth + 1))
        elif isinstance(current, list):
            for value in current:
                if isinstance(value, (dict, list)):
                    stack.append((value, depth + 1))


class ConnectionHandler(WebSocketHandler):
    """ConnectionHandler class. Properties:

    - server: server object representing running server.
    """

    # pylint: disable=abstract-method

    def __init__(self, *args, **kwargs):
        self.server = None
        self._request_times = deque()
        self._rate_limit_warned = False
        super(ConnectionHandler, self).__init__(*args, **kwargs)

    def initialize(self, server=None):
        """Initialize the connection handler.

        :param server: a Server object.
        :type server: diplomacy.Server
        """
        # pylint: disable=arguments-differ
        if self.server is None:
            self.server = server

    def get_compression_options(self):
        """Return compression options for the connection (see parent method).
        Non-None enables compression with default options.
        """
        return {}

    def check_origin(self, origin):
        """Return True if we should accept connection from given origin (str)."""

        # It seems origin may be 'null', e.g. if client is a web page loaded from disk (`file:///my_test_file.html`).
        # Accept it.
        if origin == "null":
            return True

        # Try to check if origin matches host (without regarding port).
        # Adapted from parent method code (tornado 4.5.3).
        parsed_origin = urlparse(origin)
        origin_val = parsed_origin.netloc.split(":")[0]
        origin_val = origin_val.lower()

        # Split host with ':' and keep only first piece to ignore eventual port.
        host = self.request.headers.get("Host").split(":")[0]

        # Allow connections from self-hosted webui clients
        if diplomacy.settings.PERMISSIVE_CLIENT_ORIGIN:
            hosts = (host, "localhost", "0.0.0.0", "127.0.0.1")
        else:
            hosts = [host]
        
        # Add allowed origins from environment variable
        allowed_origins = os.environ.get("ALLOWED_ORIGINS", "")
        # DEBUG: Log allowed origins raw value
        LOGGER.info(f"Allowed origins env var: '{allowed_origins}'")

        if allowed_origins:
            env_origins = [o.strip() for o in allowed_origins.split(",") if o.strip()]
            if "*" in env_origins:
                return True
            hosts = list(hosts) + env_origins

        is_allowed = origin_val in hosts
        if not is_allowed:
            LOGGER.warning("Origin check failed. Origin: %s (parsed: %s), Host: %s, Allowed: %s", origin, origin_val, host, hosts)
        else:
            LOGGER.info("Origin check passed. Origin: %s (parsed: %s), Host: %s", origin, origin_val, host)
        
        return is_allowed

    def on_close(self):
        """Invoked when the socket is closed (see parent method).
        Detach this connection handler from server users.
        """
        self.server.users.remove_connection(self, remove_tokens=False)
        LOGGER.info(
            "Removed connection. Remaining %d connection(s).", self.server.users.count_connections()
        )

    def write_message(self, message, binary=False):
        """Sends the given message to the client of this Web Socket."""
        if isinstance(message, NetworkData):
            message = message.json()
        return super(ConnectionHandler, self).write_message(message, binary)

    @staticmethod
    def translate_notification(notification):
        """Translate a notification to an array of notifications.

        :param notification: a notification object to pass to handler function.
            See diplomacy.communication.notifications for possible notifications.
        :return: An array of notifications containing a single notification.
        """
        return [notification]

    def _check_rate_limit(self):
        """Record this request and warn (once per breach) if the per-connection
        rate exceeds RATE_LIMIT_MAX_REQUESTS within RATE_LIMIT_WINDOW_SECONDS.
        Log-only — does not reject the request.
        """
        now = time.monotonic()
        cutoff = now - RATE_LIMIT_WINDOW_SECONDS
        while self._request_times and self._request_times[0] < cutoff:
            self._request_times.popleft()
        self._request_times.append(now)
        if len(self._request_times) > RATE_LIMIT_MAX_REQUESTS:
            if not self._rate_limit_warned:
                remote_ip = getattr(self.request, "remote_ip", "unknown")
                LOGGER.warning(
                    "Connection from %s exceeded rate limit (%d requests in %.1fs).",
                    remote_ip,
                    len(self._request_times),
                    RATE_LIMIT_WINDOW_SECONDS,
                )
                self._rate_limit_warned = True
        else:
            self._rate_limit_warned = False

    async def on_message(self, message):
        """Parse given message and manage parsed data (expected a string representation of a request)."""
        self._check_rate_limit()
        try:
            json_request = json.loads(message)
            if not isinstance(json_request, dict):
                raise ValueError("Unable to convert a JSON string to a dictionary.")
            _check_json_depth(json_request)
        except ValueError as exc:
            # Error occurred because either message is not a JSON string
            # or parsed JSON object is not a dict.
            remote_ip = getattr(self.request, "remote_ip", "unknown")
            LOGGER.warning(
                "Failed to parse client message from %s: %s", remote_ip, exc
            )
            response = responses.Error(
                error_type=exceptions.ResponseException.__name__, message=str(exc)
            )
        else:
            try:
                request = requests.parse_dict(json_request)

                if request.level is not None:
                    # Link request token to this connection handler.
                    self.server.users.attach_connection_handler(request.token, self)

                response = await request_managers.handle_request(self.server, request, self)
                if response is None:
                    response = responses.Ok(request_id=request.request_id)

            except exceptions.ResponseException as exc:
                response = responses.Error(
                    error_type=type(exc).__name__,
                    message=exc.message,
                    request_id=json_request.get(strings.REQUEST_ID, None),
                )
            except Exception:
                LOGGER.exception(
                    "Unhandled exception while processing request (name=%s, request_id=%s)",
                    json_request.get(strings.NAME, None),
                    json_request.get(strings.REQUEST_ID, None),
                )
                response = responses.Error(
                    error_type=exceptions.ResponseException.__name__,
                    message="Internal server error.",
                    request_id=json_request.get(strings.REQUEST_ID, None),
                )

        if response:
            try:
                await self.write_message(response.json())

            except WebSocketClosedError:
                LOGGER.error("WebSocketClosedError: %s", response.json())
