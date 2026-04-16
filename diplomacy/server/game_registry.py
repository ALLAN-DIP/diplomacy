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
"""Game registry: in-memory games, scheduler, dummy-power tracking, lifecycle."""
import logging
import os
from typing import Dict, List

from diplomacy.communication import notifications
from diplomacy.server.notifier import Notifier
from diplomacy.server.persistence import (
    ensure_path,
    get_backup_filename,
    load_json_from_disk,
)
from diplomacy.server.request_manager_utils import fire_and_forget
from diplomacy.server.scheduler import Scheduler
from diplomacy.server.server_game import ServerGame
from diplomacy.utils import common, constants, exceptions, strings

LOGGER = logging.getLogger(__name__)


class GameRegistry:
    """Owns loaded games, the scheduler, and dummy-power bookkeeping."""

    __slots__ = [
        "server",
        "games",
        "games_with_dummy_powers",
        "dispatched_dummy_powers",
        "games_scheduler",
    ]

    def __init__(self, server):
        self.server = server
        self.games = {}  # type: Dict[str, ServerGame]
        self.games_with_dummy_powers = {}  # type: Dict[str, List[str]]
        self.dispatched_dummy_powers = {}  # type: Dict[str, tuple]
        self.games_scheduler = Scheduler(1, self._process_game)

    @property
    def games_path(self):
        return self.server.games_path

    async def _process_game(self, server_game):
        """Process given game and send relevant notifications.

        :return: a boolean indicating if we must stop game.
        :type server_game: ServerGame
        """
        server = self.server
        LOGGER.debug("Processing game %s (status %s).", server_game.game_id, server_game.status)
        previous_phase_data, current_phase_data, kicked_powers = server_game.process()
        server.save_game(server_game)

        if previous_phase_data is None and kicked_powers is None:
            return True

        notifier = Notifier(server)

        if kicked_powers:
            kicked_addresses = [
                (power_name, token)
                for (power_name, tokens) in kicked_powers.items()
                for token in tokens
            ]
            notifier.notify_game_addresses(
                server_game.game_id,
                kicked_addresses,
                notifications.PowersControllers,
                powers=server_game.get_controllers(),
                timestamps=server_game.get_controllers_timestamps(),
            )
            return True

        notifier.notify_game_processed(server_game, previous_phase_data, current_phase_data)

        if server_game.is_game_done:
            server.stop_daide_server(server_game.game_id)

        return not server_game.is_game_active

    def get_indices(self):
        """Iterate over all game indices in server database."""
        for game_id in self.games:
            yield game_id
        if os.path.isdir(self.games_path):
            for filename in os.listdir(self.games_path):
                if filename.endswith(".json"):
                    game_id = filename[:-5]
                    if game_id not in self.games:
                        yield game_id

    def count_on_disk(self):
        """Return number of server games persisted on disk."""
        count = 0
        if os.path.isdir(self.games_path):
            for filename in os.listdir(self.games_path):
                if filename.endswith(".json"):
                    count += 1
        return count

    def has(self, game_id):
        """Return True if server database contains such game ID."""
        if game_id in self.games:
            return True
        expected_game_path = os.path.join(self.games_path, "%s.json" % game_id)
        return os.path.exists(expected_game_path) and os.path.isfile(expected_game_path)

    def create_game_id(self):
        """Create and return a game ID not already used."""
        import base64
        game_id = base64.b64encode(os.urandom(12), b"-_").decode("utf-8")
        while self.has(game_id):
            game_id = base64.b64encode(os.urandom(12), b"-_").decode("utf-8")
        return game_id

    def load(self, game_id):
        """Return a game matching given game ID, loading from disk if necessary
        without storing it in the registry. Use ``get`` to load-and-store.
        """
        if game_id in self.games:
            return self.games[game_id]
        game_filename = os.path.join(ensure_path(self.games_path), "%s.json" % game_id)
        if not os.path.isfile(game_filename):
            raise exceptions.GameIdException()
        try:
            server_game = ServerGame.from_dict(load_json_from_disk(game_filename))
            server_game.server = self.server
            server_game.filter_usernames(self.server.users.has_username)
            server_game.filter_tokens(self.server.users.has_token)
            return server_game
        except ValueError as exc:
            try:
                os.remove(game_filename)
            finally:
                raise exc

    def add_new(self, server_game, daide_port=None):
        """Add a new game in memory and start its DAIDE server."""
        self.games[server_game.game_id] = server_game
        self.server.start_new_daide_server(server_game.game_id, port=daide_port)

    def get(self, game_id):
        """Return a game, loading from disk if needed and registering it on memory."""
        server_game = self.load(game_id)
        if game_id not in self.games:
            LOGGER.debug("Game loaded: %s", game_id)
            self.register_dummy_power_names(server_game)
            self.games[server_game.game_id] = server_game
            self.server.start_new_daide_server(server_game.game_id)
            if not server_game.start_master and server_game.has_expected_controls_count():
                if server_game.does_not_wait():
                    server_game.process()
                    self.server.save_game(server_game)
                if server_game.is_game_active:
                    LOGGER.debug("Game loaded and scheduled: %s", server_game.game_id)
                    fire_and_forget(self.schedule(server_game))
        return server_game

    def delete(self, server_game):
        """Delete given game from memory and disk."""
        if not (server_game.is_game_canceled or server_game.is_game_completed):
            server_game.set_status(strings.CANCELED)
        game_filename = os.path.join(self.games_path, "%s.json" % server_game.game_id)
        backup_game_filename = get_backup_filename(game_filename)
        if os.path.isfile(game_filename):
            os.remove(game_filename)
        if os.path.isfile(backup_game_filename):
            os.remove(backup_game_filename)
        self.games.pop(server_game.game_id, None)
        self.server.persistence.forget_game(server_game.game_id)
        self.games_with_dummy_powers.pop(server_game.game_id, None)
        self.dispatched_dummy_powers.pop(server_game.game_id, None)
        self.server.stop_daide_server(server_game.game_id)

    async def schedule(self, server_game):
        """Add a game to scheduler only if game has a deadline and is not already scheduled."""
        if not (await self.games_scheduler.has_data(server_game)) and server_game.deadline:
            await self.games_scheduler.add_data(server_game, server_game.deadline)

    async def unschedule(self, server_game):
        """Remove a game from scheduler."""
        if await self.games_scheduler.has_data(server_game):
            await self.games_scheduler.remove_data(server_game)

    async def force_processing(self, server_game):
        """Add a game to scheduler to be processed as soon as possible."""
        await self.games_scheduler.no_wait(
            server_game, server_game.deadline, lambda g: g.does_not_wait()
        )

    def start(self, server_game):
        """Start given server game."""
        server_game.set_status(strings.ACTIVE)
        fire_and_forget(self.schedule(server_game))
        Notifier(self.server).notify_game_status(server_game)

    def stop_if_needed(self, server_game):
        """Stop game if it has not required number of controlled powers."""
        if server_game.is_game_active and (
            server_game.count_controlled_powers() < server_game.get_expected_controls_count()
        ):
            stop_game = False
            for power in server_game.powers.values():
                if not power.is_eliminated() and not power.is_controlled():
                    stop_game = True
                    break
            if stop_game:
                server_game.set_status(strings.FORMING)
                fire_and_forget(self.unschedule(server_game))
                Notifier(self.server).notify_game_status(server_game)

    def register_dummy_power_names(self, server_game):
        """Update internal registry of dummy power names waiting for orders."""
        if server_game.map.root_map != "standard":
            return
        dummy_power_names = []
        if server_game.is_game_active or server_game.is_game_paused:
            dummy_power_names = server_game.get_dummy_unordered_power_names()
            if dummy_power_names:
                self.games_with_dummy_powers[server_game.game_id] = dummy_power_names
                bot_token, _ = self.dispatched_dummy_powers.get(server_game.game_id, (None, None))
                self.dispatched_dummy_powers[server_game.game_id] = (
                    bot_token,
                    common.timestamp_microseconds(),
                )
        if not dummy_power_names:
            self.games_with_dummy_powers.pop(server_game.game_id, None)
            self.dispatched_dummy_powers.pop(server_game.game_id, None)

    def get_dummy_waiting_power_names(self, buffer_size, bot_token):
        """Return names of dummy powers waiting for orders. Only allowed for the bot token."""
        if self.server.users.get_name(bot_token) != constants.PRIVATE_BOT_USERNAME:
            raise exceptions.ResponseException("Invalid bot token %s" % bot_token)
        selected_size = 0
        selected_games = {}
        for game_id in sorted(list(self.games_with_dummy_powers.keys())):
            registered_token, registered_time = self.dispatched_dummy_powers[game_id]
            if registered_token is not None:
                time_elapsed_seconds = (
                    common.timestamp_microseconds() - registered_time
                ) / 1000000
                if (
                    time_elapsed_seconds > constants.PRIVATE_BOT_TIMEOUT_SECONDS
                    or registered_token == bot_token
                ):
                    registered_token = None
            if registered_token is None:
                dummy_power_names = self.games_with_dummy_powers[game_id]
                nb_powers = len(dummy_power_names)
                if selected_size + nb_powers > buffer_size:
                    break
                selected_games[game_id] = dummy_power_names
                selected_size += nb_powers
                self.dispatched_dummy_powers[game_id] = (
                    bot_token,
                    common.timestamp_microseconds(),
                )
        return selected_games
