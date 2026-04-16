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
"""Authorization checks for users and tokens against server games."""
import logging

from diplomacy.utils import exceptions

LOGGER = logging.getLogger(__name__)


class TokenAuthorizer:
    """Authorization checks against the server's user registry."""

    __slots__ = ["server"]

    def __init__(self, server):
        self.server = server

    @property
    def users(self):
        return self.server.users

    def user_is_master(self, username, server_game):
        """Return True if given username is a game master for given game data."""
        return self.users.has_admin(username) or server_game.is_moderator(username)

    def user_is_omniscient(self, username, server_game):
        """Return True if given username is omniscient for given game data."""
        return (
            self.users.has_admin(username)
            or server_game.is_moderator(username)
            or server_game.is_omniscient(username)
        )

    def token_is_master(self, token, server_game):
        """Return True if given token is a master token for given game data."""
        return self.users.has_token(token) and self.user_is_master(
            self.users.get_name(token), server_game
        )

    def token_is_omniscient(self, token, server_game):
        """Return True if given token is omniscient for given game data."""
        return self.users.has_token(token) and self.user_is_omniscient(
            self.users.get_name(token), server_game
        )

    def assert_token(self, token, connection_handler):
        """Check if given token is associated to an user, check if token is still valid,
        and link token to given connection handler. If any step failed, raise an exception.
        """
        if not self.users.has_token(token):
            raise exceptions.TokenException()
        if self.users.token_is_alive(token):
            self.users.relaunch_token(token)
            self.server.save_data()
        else:
            LOGGER.error("Token too old %s", token)
            self.server.remove_token(token)
            raise exceptions.TokenException()
        self.users.attach_connection_handler(token, connection_handler)

    def assert_admin_token(self, token):
        """Check if given token is an admin token. Raise an exception on error."""
        if not self.users.token_is_admin(token):
            raise exceptions.AdminTokenException()

    def assert_master_token(self, token, server_game):
        """Check if given token is a master token for given game data. Raise an exception on error."""
        if not self.token_is_master(token, server_game):
            raise exceptions.GameMasterTokenException()
