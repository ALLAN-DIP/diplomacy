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
"""Concrete standalone server object. Manages and save server data and games on disk,
send notifications, receives requests and send responses.

Example:

.. code-block:: python

    >>> from diplomacy import Server
    >>> Server().start(port=1234)  # If port is not given, a random port will be selected.

You can interrupt server by sending a keyboard interrupt signal (Ctrl+C).

.. code-block:: python

    >>> from diplomacy import Server
    >>> try:
    >>>     Server().start()
    >>> except KeyboardInterrupt:
    >>>     print('Server interrupted.')

You can also configure some server attributes when instantiating it:

.. code-block:: python

    >>> from diplomacy import Server
    >>> server = Server(backup_delay_seconds=5)
    >>> server.start()

These are public configurable server attributes. They are saved on disk at each server backup:

- **allow_user_registrations**: (bool) indicate if server accepts users registrations (default True)
- **backup_delay_seconds**: (int) number of seconds to wait between two consecutive full server backup
  on disk (default 10 minutes)
- **ping_seconds**: (int) ping period used by server to check is connected sockets are alive.
- **max_games**: (int) maximum number of games server accepts to create.
  If there are at least such number of games on server, server will not accept
  further game creation requests. If 0, no limit. (default 0)
- **remove_canceled_games**: (bool) indicate if games must be deleted from server database
  when they are canceled (default False)

"""
from __future__ import annotations

import atexit
import logging
import os
import signal
from types import FrameType
from typing import TYPE_CHECKING, Any, Iterator

import tornado
import tornado.ioloop
import tornado.web
from tornado.ioloop import IOLoop
from tornado.iostream import StreamClosedError
from tornado.queues import Queue
from tornado.websocket import WebSocketClosedError

import diplomacy.settings
from diplomacy.server.connection_handler import ConnectionHandler
from diplomacy.server.daide_manager import DaideManager, is_port_opened
from diplomacy.server.game_registry import GameRegistry
from diplomacy.server.persistence import ServerPersistence, ensure_path
from diplomacy.server.token_authorizer import TokenAuthorizer
from diplomacy.server.users import Users
from diplomacy.engine.map import Map
from diplomacy.utils import common, exceptions, strings, constants, convoy_paths
from diplomacy.utils.constants import DEFAULT_PORT

if TYPE_CHECKING:
    from diplomacy.server.server_game import ServerGame

LOGGER = logging.getLogger(__name__)


def get_absolute_path(directory: str | None = None) -> str:
    """Return absolute path of given directory.
    If given directory is None, return absolute path of current directory.
    """
    return os.path.abspath(directory or os.getcwd())


class InterruptionHandler:
    """Helper class used to save server when a system interruption signal is sent (e.g. KeyboardInterrupt)."""

    __slots__ = ["server", "previous_handler"]

    def __init__(self, server: Server) -> None:
        """Initializer the handler.

        :param server: server to save
        """
        self.server: Server = server
        self.previous_handler = signal.getsignal(signal.SIGINT)

    def handler(self, signum: int, frame: FrameType | None) -> None:
        """Handler function.

        :param signum: system signal received
        :param frame: frame received
        """
        if signum == signal.SIGINT:
            self.server.stop_daide_server(None)
            self.server.backup_now(force=True)
            # signal.getsignal can return a callable, None, or an int sentinel
            # (signal.SIG_DFL / signal.SIG_IGN) — only chain to it when callable.
            prev = self.previous_handler
            if not isinstance(prev, int) and prev is not None:
                prev(signum, frame)


class _ServerBackend:
    """Class representing tornado objects used to run a server.

    Properties:

    - **port**: (integer) port where server runs.
    - **application**: tornado web Application object.
    - **http_server**: tornado HTTP server object running server code.
    - **io_loop**: tornado IO loop where server runs.
    """

    # pylint: disable=too-few-public-methods
    __slots__ = ["port", "application", "http_server", "io_loop"]

    def __init__(self) -> None:
        """Initialize server backend."""
        self.port: int | None = None
        self.application: tornado.web.Application | None = None
        self.http_server: Any = None
        self.io_loop: IOLoop | None = None


class Server:
    """Server class."""

    __slots__ = [
        "data_path",
        "games_path",
        "available_maps",
        "maps_mtime",
        "notifications",
        "allow_registrations",
        "max_games",
        "remove_canceled_games",
        "users",
        "daide",
        "persistence",
        "backup_delay_seconds",
        "ping_seconds",
        "interruption_handler",
        "backend",
        "server_dir",
        "auth",
        "registry",
    ]

    # Servers cache.
    __cache__: dict[str, "Server"] = {}  # {absolute path of working folder => Server}

    def __new__(cls, server_dir: str | None = None, **kwargs: Any) -> "Server":
        # pylint: disable=unused-argument
        server_dir = get_absolute_path(server_dir)
        if server_dir in cls.__cache__:
            server = cls.__cache__[server_dir]
        else:
            server = object.__new__(cls)
        return server

    def __init__(
        self,
        server_dir: str | None = None,
        daide_min_port: int = 8000,
        daide_max_port: int = 8999,
        **kwargs: Any,
    ) -> None:
        """Initialize the server.
        Server data is stored in folder ``<working directory>/data``.

        :param server_dir: path of folder in (from) which server data will be saved (loaded).
            If None, working directory (where script is executed) will be used.
        :param kwargs: (optional) values for some public configurable server attributes.
            Given values will overwrite values saved on disk.
        """

        # File paths and attributes related to database.
        server_dir = get_absolute_path(server_dir)
        ensure_path(server_dir)
        if server_dir in self.__class__.__cache__:
            return
        self.server_dir = server_dir

        if not os.path.exists(server_dir) or not os.path.isdir(server_dir):
            raise exceptions.ServerDirException(server_dir)
        self.data_path = os.path.join(server_dir, "data")
        self.games_path = os.path.join(self.data_path, "games")
        convoy_paths.set_server_dir(server_dir)
        self.daide = DaideManager(self, daide_min_port, daide_max_port)
        self.auth = TokenAuthorizer(self)
        self.persistence = ServerPersistence(self, self.data_path, self.games_path)
        self.registry = GameRegistry(self)

        # Data in memory (not stored on disk).
        # Items are (ConnectionHandler, translated_notification) tuples; the
        # translated notification type varies by protocol, so the payload is Any.
        self.notifications: Queue[tuple[ConnectionHandler, Any]] = Queue(
            maxsize=constants.NOTIFICATION_QUEUE_MAX_SIZE
        )
        self.interruption_handler = InterruptionHandler(self)
        # Backend objects used to run server. If None, server is not yet started.
        # Initialized when you call Server.start() (see method below).
        self.backend: _ServerBackend | None = None

        # Database (stored on disk).
        self.allow_registrations: bool = True
        self.max_games: int = 0
        self.remove_canceled_games: bool = False
        self.backup_delay_seconds: int = constants.DEFAULT_BACKUP_DELAY_SECONDS
        self.ping_seconds: int = constants.DEFAULT_PING_SECONDS
        # Placeholder Users() instance; persistence.load() (called from _load
        # below) unconditionally replaces it with the on-disk state or a fresh
        # Users().  Typed non-optional so call sites don't each need a guard.
        self.users: Users = Users()
        # {"map_name" => {"powers": [...], "supply_centers": [...], "loc_type": {...}, ...}}
        self.available_maps: dict[str, dict[str, Any]] = {}
        # Latest maps modification date (used to manage maps cache in server object).
        self.maps_mtime: float = 0

        # Load data on memory.
        self._load()

        # If necessary, updated server configurable attributes from kwargs.
        self.allow_registrations = bool(
            kwargs.pop(strings.ALLOW_REGISTRATIONS, self.allow_registrations)
        )
        self.max_games = int(kwargs.pop(strings.MAX_GAMES, self.max_games))
        self.remove_canceled_games = bool(
            kwargs.pop(strings.REMOVE_CANCELED_GAMES, self.remove_canceled_games)
        )
        self.backup_delay_seconds = int(
            kwargs.pop(strings.BACKUP_DELAY_SECONDS, self.backup_delay_seconds)
        )
        self.ping_seconds = int(kwargs.pop(strings.PING_SECONDS, self.ping_seconds))
        assert not kwargs
        LOGGER.debug("Ping        : %s", self.ping_seconds)
        LOGGER.debug("Backup delay: %s", self.backup_delay_seconds)

        # Add server on servers cache.
        self.__class__.__cache__[server_dir] = self

    @property
    def port(self) -> int | None:
        """Property: return port where this server currently runs, or None if server is not yet started."""
        return self.backend.port if self.backend else None

    @property
    def games(self) -> dict[str, "ServerGame"]:
        """Loaded games dict (delegated to registry)."""
        return self.registry.games

    @property
    def games_with_dummy_powers(self) -> dict[str, Any]:
        return self.registry.games_with_dummy_powers

    @property
    def dispatched_dummy_powers(self) -> dict[str, Any]:
        return self.registry.dispatched_dummy_powers

    @property
    def games_scheduler(self) -> Any:
        return self.registry.games_scheduler

    def _load_available_maps(self) -> None:
        """Load a dictionary (self.available_maps) mapping every map name to a dict of map info.
        for all maps available in diplomacy package.
        """
        diplomacy_map_dir = os.path.join(diplomacy.settings.PACKAGE_DIR, strings.MAPS)
        new_maps_mtime = self.maps_mtime
        for filename in os.listdir(diplomacy_map_dir):
            if diplomacy.settings.MAPS_TO_LOAD and filename not in diplomacy.settings.MAPS_TO_LOAD:
                continue
            if filename.endswith(".map"):
                map_filename = os.path.join(diplomacy_map_dir, filename)
                map_mtime = os.path.getmtime(map_filename)
                map_name = filename[:-4]
                if map_name not in self.available_maps or map_mtime > self.maps_mtime:
                    # Either it's a new map file or map file was modified.
                    available_map = Map(map_name)
                    self.available_maps[map_name] = {
                        "powers": list(available_map.powers),
                        "supply_centers": list(available_map.scs),
                        "loc_type": available_map.loc_type.copy(),
                        "loc_abut": available_map.loc_abut.copy(),
                        "aliases": available_map.aliases.copy(),
                    }
                    new_maps_mtime = max(new_maps_mtime, map_mtime)
        self.maps_mtime = new_maps_mtime

    def _load(self) -> None:
        """Load database from disk and available maps."""
        self.persistence.load()
        self._load_available_maps()
        LOGGER.info("Server loaded.")

    def backup_now(self, force: bool = False) -> None:
        """Save backup of server data and loaded games immediately (delegated)."""
        self.persistence.backup_now(force=force)

    async def _task_send_notifications(self) -> None:
        """IO loop callback: consume notifications and send it."""
        LOGGER.info("Waiting for notifications to send.")
        while True:
            connection_handler, notification = await self.notifications.get()
            try:
                await connection_handler.write_message(notification)
            except WebSocketClosedError:
                LOGGER.error("Websocket was closed while sending a notification.")
            except StreamClosedError:
                LOGGER.error("Stream was closed while sending a notification.")
            finally:
                self.notifications.task_done()

    def set_tasks(self, io_loop: IOLoop) -> None:
        """Set server callbacks on given IO loop.
        Must be called once per server before starting IO loop.
        """
        io_loop.add_callback(self.persistence.task_save_database)
        # Spin up N_NOTIFICATION_WORKERS independent consumer coroutines so that
        # while one is suspended waiting for a slow write_message to complete,
        # the others can service notifications for other sockets concurrently.
        for _ in range(constants.N_NOTIFICATION_WORKERS):
            io_loop.add_callback(self._task_send_notifications)
        # These both coroutines are used to manage games.
        io_loop.add_callback(self.games_scheduler.process_tasks)
        io_loop.add_callback(self.games_scheduler.schedule)
        # Set callback on KeyboardInterrupt.
        signal.signal(signal.SIGINT, self.interruption_handler.handler)
        atexit.register(self.backup_now)

    def start(self, port: int | None = None, io_loop: IOLoop | None = None) -> None:
        """Start server if not yet started. Raise an exception if server is already started.

        :param port: (optional) port where server must run. If not provided,
            try to start on a random selected port. Use property `port` to get current server port.
        :param io_loop: (optional) tornado IO lopp where server must run. If not provided, get
            default IO loop instance (tornado.ioloop.IOLoop.instance()).
        """
        if self.backend is not None:
            raise exceptions.DiplomacyException(
                "Server is already running on port %s." % self.backend.port
            )
        if port is None:
            port = DEFAULT_PORT
        if io_loop is None:
            io_loop = tornado.ioloop.IOLoop.instance()
        # tornado.web.Application expects a permissive Sequence of Rule-like
        # entries; typing as list[Any] avoids a spurious variance complaint
        # against list[URLSpec] (list is invariant, so it won't satisfy the
        # union of Rule / tuple / list in the Application stub).
        handlers: list[Any] = [
            tornado.web.url(r"/", ConnectionHandler, {"server": self}),
        ]
        # Use an explicit dict[str, Any] so ty doesn't try to match the
        # heterogeneous values against tornado's positional `default_host`
        # / `transforms` parameters when we unpack into **settings.
        settings: dict[str, Any] = {
            "cookie_secret": common.generate_token(),
            "xsrf_cookies": True,
            "websocket_ping_interval": self.ping_seconds,
            # Allow clients two complete ping intervals to answer.  Request and
            # notification callbacks are user code and can briefly keep a
            # client's event loop busy (AI players are a common example).  A
            # timeout shorter than the ping interval disconnects otherwise
            # healthy clients before they get a chance to service the ping.
            "websocket_ping_timeout": 2 * self.ping_seconds,
            "websocket_max_message_size": 5 * 1024 * 1024,
        }
        self.backend = _ServerBackend()
        self.backend.application = tornado.web.Application(handlers, **settings)
        self.backend.http_server = self.backend.application.listen(port)
        self.backend.io_loop = io_loop
        self.backend.port = port
        self.set_tasks(io_loop)
        LOGGER.info("Running on port %d", self.backend.port)
        LOGGER.info("Serving DAIDE on ports %d:%d", self.daide.daide_min_port, self.daide.daide_max_port)
        LOGGER.info("Writing server data to %s", self.server_dir)
        # asyncio_loop is a public attribute on tornado.ioloop.IOLoop (tornado 5+)
        # but is missing from the typeshed stubs — use getattr so the type
        # checker doesn't need to know about it.
        asyncio_loop = getattr(io_loop, "asyncio_loop")
        if not asyncio_loop.is_running():
            io_loop.start()

    def get_game_indices(self) -> Iterator[str]:
        """Iterate over all game indices in server database (delegated)."""
        return self.registry.get_indices()

    def count_server_games(self) -> int:
        """Return number of server games in server database (delegated)."""
        return self.registry.count_on_disk()

    def save_data(self) -> None:
        """Update on-memory backup of server data (delegated)."""
        self.persistence.record_server_data()

    def save_game(self, server_game: "ServerGame") -> None:
        """Update on-memory version of given server game."""
        self.persistence.record_game(server_game)
        self.registry.register_dummy_power_names(server_game)

    def register_dummy_power_names(self, server_game: "ServerGame") -> None:
        self.registry.register_dummy_power_names(server_game)

    def get_dummy_waiting_power_names(self, buffer_size: int, bot_token: str) -> dict[str, list[str]]:
        return self.registry.get_dummy_waiting_power_names(buffer_size, bot_token)

    def has_game_id(self, game_id: str) -> bool:
        return self.registry.has(game_id)

    def load_game(self, game_id: str) -> "ServerGame":
        return self.registry.load(game_id)

    def add_new_game(self, server_game: "ServerGame", daide_port: int | None = None) -> None:
        self.registry.add_new(server_game, daide_port=daide_port)

    def get_game(self, game_id: str) -> "ServerGame":
        return self.registry.get(game_id)

    def delete_game(self, server_game: "ServerGame") -> None:
        self.registry.delete(server_game)

    async def schedule_game(self, server_game: "ServerGame") -> None:
        await self.registry.schedule(server_game)

    async def unschedule_game(self, server_game: "ServerGame") -> None:
        await self.registry.unschedule(server_game)

    async def force_game_processing(self, server_game: "ServerGame") -> None:
        await self.registry.force_processing(server_game)

    def start_game(self, server_game: "ServerGame") -> None:
        self.registry.start(server_game)

    def stop_game_if_needed(self, server_game: "ServerGame") -> None:
        self.registry.stop_if_needed(server_game)

    def user_is_master(self, username: str, server_game: "ServerGame") -> bool:
        return self.auth.user_is_master(username, server_game)

    def user_is_omniscient(self, username: str, server_game: "ServerGame") -> bool:
        return self.auth.user_is_omniscient(username, server_game)

    def token_is_master(self, token: str, server_game: "ServerGame") -> bool:
        return self.auth.token_is_master(token, server_game)

    def token_is_omniscient(self, token: str, server_game: "ServerGame") -> bool:
        return self.auth.token_is_omniscient(token, server_game)

    def create_game_id(self) -> str:
        """Create and return a game ID not already used by a game in server database."""
        return self.registry.create_game_id()

    def remove_token(self, token: str) -> None:
        """Disconnect given token from related user and loaded games. Stop related games if needed,
        e.g. if a game does not have anymore expected number of controlled powers.
        """
        self.users.disconnect_token(token)
        server_game: ServerGame
        for server_game in self.games.values():
            if server_game.has_token(token):
                server_game.remove_token(token)
                self.stop_game_if_needed(server_game)
                self.save_game(server_game)
        self.save_data()

    def assert_token(self, token: str, connection_handler: ConnectionHandler) -> None:
        self.auth.assert_token(token, connection_handler)

    def assert_admin_token(self, token: str) -> None:
        self.auth.assert_admin_token(token)

    def assert_master_token(self, token: str, server_game: "ServerGame") -> None:
        self.auth.assert_master_token(token, server_game)

    def cannot_create_more_games(self) -> bool:
        """Return True if server can not accept new games."""
        return bool(self.max_games and self.count_server_games() >= self.max_games)

    def get_map(self, map_name: str) -> dict[str, Any] | None:
        """Return map power names for given map name."""
        return self.available_maps.get(map_name, None)

    def start_new_daide_server(self, game_id: str, port: int | None = 8431) -> int | None:
        """Start a new DAIDE TCP server for the given game (delegated)."""
        return self.daide.start(game_id, port=port)

    def stop_daide_server(self, game_id: str | None) -> None:
        """Stop one or all DAIDE TCP server (delegated)."""
        self.daide.stop(game_id)

    def get_daide_port(self, game_id: str) -> int | None:
        """Get the DAIDE port opened for a specific game_id (delegated)."""
        return self.daide.get_port(game_id)
