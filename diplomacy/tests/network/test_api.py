# ==============================================================================
# Tests for Server, Channel, and Game APIs
#
# These integration tests verify that the core WebSocket APIs function correctly:
#   - Server: startup, connection, authentication
#   - Channel: game creation, listing, joining, available maps, logout
#   - Game: orders, messaging, phase processing, status changes, game state
#
# Architecture: each test function creates a fresh asyncio event loop via _run().
# Inside that loop, server.start() detects the loop is already running and skips
# io_loop.start(), so setup is non-blocking. Client coroutines then talk to the
# server on the same loop — the same single-loop pattern test_real_game.py uses.
# ==============================================================================
import asyncio
import logging
import random
import tempfile

import pytest
from tornado.ioloop import IOLoop

from diplomacy.client.connection import connect
from diplomacy.server.server import Server
from diplomacy.utils import strings

LOGGER = logging.getLogger(__name__)

TEST_HOST = "localhost"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _ServerContext:
    """Manages a temporary server that lives for one test coroutine."""

    def __init__(self):
        self.port = random.randint(10000, 20000)
        self._tmpdir = tempfile.TemporaryDirectory()
        Server.__cache__.clear()
        self.server = Server(server_dir=self._tmpdir.name)
        io_loop = IOLoop.current()
        self.server.start(port=self.port, io_loop=io_loop)

    def cleanup(self):
        if self.server.backend and self.server.backend.http_server:
            self.server.backend.http_server.stop()
        Server.__cache__.clear()
        self._tmpdir.cleanup()


def _run(coro_fn):
    """Run an async test coroutine with a temporary server.

    Creates a fresh asyncio event loop, starts a Diplomacy server on it
    (non-blocking because the loop is already running inside run_until_complete),
    executes the test coroutine, and tears everything down.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    async def _wrapper():
        ctx = _ServerContext()
        try:
            await coro_fn(ctx.port)
        finally:
            ctx.cleanup()

    try:
        loop.run_until_complete(_wrapper())
    finally:
        loop.close()
        asyncio.set_event_loop(None)


# ===========================================================================
# 1. SERVER / CONNECTION TESTS
# ===========================================================================

class TestServerConnection:
    """Tests for server startup and client connection/authentication."""

    def test_connect_to_server(self):
        """Client can establish a WebSocket connection to the server."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            assert connection is not None
            assert connection.port == port
        _run(_test)

    def test_authenticate_admin(self):
        """Admin user can authenticate and receive a channel token."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            assert channel is not None
            assert channel.token is not None
            assert len(channel.token) > 0
        _run(_test)

    def test_register_new_user(self):
        """A new user can register by authenticating with a new username."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("new_test_user", "test_pass_123")
            assert channel is not None
            assert channel.token is not None
        _run(_test)

    def test_multiple_connections(self):
        """Multiple clients can connect and authenticate concurrently."""
        async def _test(port):
            conn1 = await connect(TEST_HOST, port)
            conn2 = await connect(TEST_HOST, port)
            ch1 = await conn1.authenticate("multi_user_1", "pass1")
            ch2 = await conn2.authenticate("multi_user_2", "pass2")
            assert ch1.token != ch2.token
        _run(_test)


# ===========================================================================
# 2. CHANNEL API TESTS
# ===========================================================================

class TestChannelAPI:
    """Tests for channel-level operations: game creation, listing, maps."""

    def test_get_available_maps(self):
        """Channel can retrieve the list of available maps."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            maps = await channel.get_available_maps()
            assert isinstance(maps, dict)
            assert "standard" in maps
            assert "powers" in maps["standard"]
            assert len(maps["standard"]["powers"]) == 7
        _run(_test)

    def test_create_game(self):
        """Channel can create a new game with default settings."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            game = await channel.create_game(
                game_id="test_create_game",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            assert game is not None
            assert game.game_id == "test_create_game"
            assert game.map_name == "standard"
        _run(_test)

    def test_create_game_custom_map(self):
        """Channel can create a game on a non-default map."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            game = await channel.create_game(
                game_id="test_custom_map_game",
                map_name="standard_france_austria",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            assert game is not None
            assert game.map_name == "standard_france_austria"
        _run(_test)

    def test_list_games(self):
        """Channel can list games on the server."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            await channel.create_game(
                game_id="test_list_games",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            games = await channel.list_games()
            assert isinstance(games, list)
            game_ids = [g.game_id for g in games]
            assert "test_list_games" in game_ids
        _run(_test)

    def test_list_games_with_status_filter(self):
        """Channel can filter games by status."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            await channel.create_game(
                game_id="test_status_filter",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            forming_games = await channel.list_games(status="forming")
            assert isinstance(forming_games, list)
        _run(_test)

    def test_get_playable_powers(self):
        """Channel can get the set of playable (uncontrolled) powers for a game."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            await channel.create_game(
                game_id="test_playable_powers",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            powers = await channel.get_playable_powers(game_id="test_playable_powers")
            assert isinstance(powers, (set, list))
            assert len(powers) == 7
        _run(_test)

    def test_join_game_as_power(self):
        """A user can join a game as a specific power."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            await channel.create_game(
                game_id="test_join_power",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            user_conn = await connect(TEST_HOST, port)
            user_channel = await user_conn.authenticate("player_france", "pass")
            game = await user_channel.join_game(
                game_id="test_join_power", power_name="FRANCE"
            )
            assert game is not None
            assert game.is_player_game()
            assert game.power.name == "FRANCE"
        _run(_test)

    def test_get_games_info(self):
        """Channel can retrieve info for specific games by ID."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("admin", "password")
            await channel.create_game(
                game_id="test_games_info",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            info = await channel.get_games_info(games=["test_games_info"])
            assert isinstance(info, list)
            assert len(info) == 1
            assert info[0].game_id == "test_games_info"
        _run(_test)

    def test_logout(self):
        """Channel can log out (invalidate token)."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            channel = await connection.authenticate("logout_user", "pass")
            assert channel.token is not None
            await channel.logout()
        _run(_test)


# ===========================================================================
# 3. GAME API TESTS
# ===========================================================================

async def _create_full_game(port):
    """Create a game with all 7 powers joined and return the pieces."""
    connection = await connect(TEST_HOST, port)
    admin_channel = await connection.authenticate("admin", "password")
    game_id = "game_api_%d" % random.randint(100000, 999999)
    admin_game = await admin_channel.create_game(
        game_id=game_id,
        rules={"POWER_CHOICE", "REAL_TIME", "NO_DEADLINE"},
        deadline=0,
    )

    user_games = {}
    powers = ["AUSTRIA", "ENGLAND", "FRANCE", "GERMANY", "ITALY", "RUSSIA", "TURKEY"]
    for power_name in powers:
        user_conn = await connect(TEST_HOST, port)
        user_ch = await user_conn.authenticate(
            "user_%s_%s" % (power_name.lower(), game_id), "pass"
        )
        game = await user_ch.join_game(game_id=game_id, power_name=power_name)
        user_games[power_name] = game

    return admin_game, admin_channel, user_games, game_id


class TestGameAPI:
    """Tests for game-level operations: orders, messages, processing, status."""

    def test_set_orders(self):
        """Players can submit orders for their units."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            france_game = user_games["FRANCE"]
            await france_game.set_orders(orders=["A PAR H"])
        _run(_test)

    def test_set_and_clear_orders(self):
        """Players can set orders then clear them."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            france_game = user_games["FRANCE"]
            await france_game.set_orders(orders=["A PAR H"])
            await france_game.clear_orders()
        _run(_test)

    def test_wait_flag(self):
        """Players can set and unset the wait flag."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            france_game = user_games["FRANCE"]
            await france_game.wait()
            await france_game.no_wait()
        _run(_test)

    def test_send_game_message(self):
        """Players can send in-game messages to other powers."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            france_game = user_games["FRANCE"]
            message = france_game.new_power_message("ENGLAND", "Shall we ally?")
            await france_game.send_game_message(message=message)
        _run(_test)

    def test_send_global_message(self):
        """Players can send global (broadcast) messages."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            france_game = user_games["FRANCE"]
            message = france_game.new_global_message("Hello everyone!")
            await france_game.send_game_message(message=message)
        _run(_test)

    def test_process_game(self):
        """Admin can force-process a game phase (advance to next phase)."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)

            initial_phase = admin_game.current_short_phase
            assert initial_phase == "S1901M"

            for _, game in user_games.items():
                await game.set_orders(orders=[])
                await game.no_wait()

            await admin_game.process()
            await asyncio.sleep(1)
            assert admin_game.current_short_phase != initial_phase
        _run(_test)

    def test_game_status_pause_resume(self):
        """Admin can pause and resume a game."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            assert admin_game.status == strings.ACTIVE

            await admin_game.pause()
            await asyncio.sleep(0.3)
            assert admin_game.status == strings.PAUSED

            await admin_game.resume()
            await asyncio.sleep(0.3)
            assert admin_game.status == strings.ACTIVE
        _run(_test)

    def test_game_cancel(self):
        """Admin can cancel a game."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            await admin_game.cancel()
            await asyncio.sleep(0.3)
            assert admin_game.status == strings.CANCELED
        _run(_test)

    def test_get_phase_history(self):
        """After processing a phase, the phase history is populated."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)

            # Submit empty orders and unset wait for every power
            for _, game in user_games.items():
                await game.set_orders(orders=[])
                await game.no_wait()
            await asyncio.sleep(0.5)

            # Force process and wait for notifications to propagate
            await admin_game.process()
            await asyncio.sleep(2)

            # Synchronize pulls the updated state (including phase history)
            france_game = user_games["FRANCE"]
            await france_game.synchronize()

            # Check the local state_history that synchronize populated
            assert len(france_game.state_history) >= 1
        _run(_test)

    def test_query_schedule(self):
        """Querying schedule on a no-deadline game raises ResponseException."""
        async def _test(port):
            from diplomacy.utils.exceptions import ResponseException
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            # A game created with deadline=0 has no schedule
            with pytest.raises(ResponseException):
                await admin_game.query_schedule()
        _run(_test)

    def test_save_game(self):
        """A game can be saved to disk."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            saved = await admin_game.save()
            assert saved is not None
        _run(_test)

    def test_synchronize(self):
        """A client game can synchronize with the server state."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)
            france_game = user_games["FRANCE"]
            await france_game.synchronize()
            assert france_game.current_short_phase == "S1901M"
        _run(_test)

    def test_game_initial_state(self):
        """A newly started standard game has the expected initial state."""
        async def _test(port):
            admin_game, _, user_games, _ = await _create_full_game(port)
            await admin_game.start()
            await asyncio.sleep(0.5)

            france_game = user_games["FRANCE"]
            assert france_game.current_short_phase == "S1901M"
            assert france_game.map_name == "standard"

            france_units = france_game.get_units("FRANCE")
            assert len(france_units) == 3
            assert "A PAR" in france_units
            assert "A MAR" in france_units
            assert "F BRE" in france_units

            france_centers = france_game.get_centers("FRANCE")
            assert len(france_centers) == 3
        _run(_test)

    def test_delete_game(self):
        """Admin can delete a game."""
        async def _test(port):
            connection = await connect(TEST_HOST, port)
            admin_channel = await connection.authenticate("admin", "password")
            game = await admin_channel.create_game(
                game_id="test_delete_game",
                rules={"POWER_CHOICE", "REAL_TIME"},
                deadline=0,
            )
            await game.delete()

            games = await admin_channel.list_games()
            game_ids = [g.game_id for g in games]
            assert "test_delete_game" not in game_ids
        _run(_test)
