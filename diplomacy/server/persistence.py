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
"""Persistence layer: snapshot + flush server data and games to disk."""
import asyncio
import logging
import os

import ujson as json

from diplomacy.server.users import Users
from diplomacy.utils import common, constants, exceptions, strings

LOGGER = logging.getLogger(__name__)


def get_backup_filename(filename):
    """Return a backup filename from given filename (given filename with a special suffix)."""
    return "%s.backup" % filename


def save_json_on_disk(filename, json_dict):
    """Save given JSON dictionary into given filename and back-up previous file version if exists."""
    if os.path.exists(filename):
        os.rename(filename, get_backup_filename(filename))
    with open(filename, "w") as file:
        json.dump(json_dict, file)


def load_json_from_disk(filename):
    """Return a JSON dictionary loaded from given filename.
    If JSON parsing fail for given filename, try to load JSON dictionary for a backup file
    (if present) and rename backup file to given filename.
    """
    try:
        with open(filename, "rb") as file:
            json_dict = json.load(file)
    except ValueError as exception:
        backup_filename = get_backup_filename(filename)
        if not os.path.isfile(backup_filename):
            raise exception
        with open(backup_filename, "rb") as backup_file:
            json_dict = json.load(backup_file)
        os.rename(backup_filename, filename)
    return json_dict


def ensure_path(folder_path):
    """Make sure given folder path exists and return given path."""
    if not os.path.exists(folder_path):
        LOGGER.info("Creating folder %s", folder_path)
        os.makedirs(folder_path, exist_ok=True)
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        raise exceptions.FolderException(folder_path)
    return folder_path


class ServerPersistence:
    """Owns pending backup snapshots and drives periodic disk flushes."""

    __slots__ = ["server", "data_path", "games_path", "backup_server", "backup_games"]

    def __init__(self, server, data_path, games_path):
        self.server = server
        self.data_path = data_path
        self.games_path = games_path
        self.backup_server = None
        self.backup_games = {}

    def get_server_data_filename(self):
        """Return path to server.json, ensuring the data folder exists."""
        return os.path.join(ensure_path(self.data_path), "server.json")

    def load(self):
        """Load database from disk into the bound server."""
        server = self.server
        LOGGER.info("Loading database.")
        ensure_path(self.data_path)
        ensure_path(self.games_path)
        server_data_filename = self.get_server_data_filename()
        if os.path.exists(server_data_filename):
            LOGGER.info("Loading server.json.")
            server_info = load_json_from_disk(server_data_filename)
            server.allow_registrations = server_info[strings.ALLOW_REGISTRATIONS]
            server.backup_delay_seconds = server_info[strings.BACKUP_DELAY_SECONDS]
            server.ping_seconds = server_info[strings.PING_SECONDS]
            server.max_games = server_info[strings.MAX_GAMES]
            server.remove_canceled_games = server_info[strings.REMOVE_CANCELED_GAMES]
            server.users = Users.from_dict(server_info[strings.USERS])
            server.available_maps = server_info[strings.AVAILABLE_MAPS]
            server.maps_mtime = server_info[strings.MAPS_MTIME]
        else:
            LOGGER.info("Creating server.json.")
            server.users = Users()
            self.backup_now(force=True)
        for username, password in (
            ("admin", os.environ.get("DIPLOMACY_ADMIN_PASSWORD", "password")),
            (constants.PRIVATE_BOT_USERNAME, constants.PRIVATE_BOT_PASSWORD),
        ):
            if not server.users.has_username(username):
                server.users.add_user(username, common.hash_password(password))
        server.users.add_admin("admin")

    def record_server_data(self):
        """Snapshot current server configuration state into pending backup."""
        server = self.server
        self.backup_server = {
            strings.ALLOW_REGISTRATIONS: server.allow_registrations,
            strings.BACKUP_DELAY_SECONDS: server.backup_delay_seconds,
            strings.PING_SECONDS: server.ping_seconds,
            strings.MAX_GAMES: server.max_games,
            strings.REMOVE_CANCELED_GAMES: server.remove_canceled_games,
            strings.USERS: server.users.to_dict(),
            strings.AVAILABLE_MAPS: server.available_maps,
            strings.MAPS_MTIME: server.maps_mtime,
        }

    def record_game(self, server_game):
        """Snapshot a game's current state into pending backup."""
        self.backup_games[server_game.game_id] = server_game.to_dict()

    def forget_game(self, game_id):
        """Drop any pending snapshot for the given game."""
        self.backup_games.pop(game_id, None)

    def _backup_server_data_now(self, force=False):
        """Write pending server-data snapshot synchronously."""
        if force:
            self.record_server_data()
        if self.backup_server:
            save_json_on_disk(self.get_server_data_filename(), self.backup_server)
            self.backup_server = None
            LOGGER.info("Saved server.json.")

    def _backup_games_now(self, force=False):
        """Write all pending game snapshots synchronously."""
        ensure_path(self.games_path)
        if force:
            for server_game in self.server.games.values():
                self.record_game(server_game)
        for game_id, game_dict in self.backup_games.items():
            game_path = os.path.join(self.games_path, "%s.json" % game_id)
            save_json_on_disk(game_path, game_dict)
            LOGGER.info("Game data saved: %s", game_id)
        self.backup_games.clear()

    def backup_now(self, force=False):
        """Save backup of server data and loaded games immediately."""
        self._backup_server_data_now(force=force)
        self._backup_games_now(force=force)

    def _flush_to_disk(self, server_data, games):
        """Synchronous helper: write a pre-snapshotted set of pending writes to disk.
        Designed to be called in a thread pool via run_in_executor.
        """
        if server_data is not None:
            save_json_on_disk(self.get_server_data_filename(), server_data)
            LOGGER.info("Saved server.json.")
        ensure_path(self.games_path)
        for game_id, game_dict in games.items():
            game_path = os.path.join(self.games_path, "%s.json" % game_id)
            save_json_on_disk(game_path, game_dict)
            LOGGER.info("Game data saved: %s", game_id)

    async def task_save_database(self):
        """IO loop callable: save database and loaded games periodically."""
        LOGGER.info("Waiting for save events.")
        while True:
            await asyncio.sleep(self.server.backup_delay_seconds)
            # Snapshot and clear the pending state on the event loop thread to
            # avoid races, then flush to disk in a thread pool so blocking file
            # I/O does not stall the event loop between iterations.
            server_data = self.backup_server
            games = dict(self.backup_games)
            self.backup_server = None
            self.backup_games.clear()
            if server_data is not None or games:
                await asyncio.get_event_loop().run_in_executor(
                    None, self._flush_to_disk, server_data, games
                )
