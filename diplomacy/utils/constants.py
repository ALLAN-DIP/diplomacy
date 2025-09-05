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
"""Some constant / config values used in Diplomacy package."""
from enum import IntFlag, unique

# Number of times to try to connect before throwing an exception.
NB_CONNECTION_ATTEMPTS = 12

# Time to wait between to connection trials.
ATTEMPT_DELAY_SECONDS = 5

# Time to wait between to server backups.
DEFAULT_BACKUP_DELAY_SECONDS = 10 * 60  # 10 minutes.

# Default server ping interval. # Used for sockets ping.
DEFAULT_PING_SECONDS = 30

# Time to wait to receive a response for a request sent to server.
REQUEST_TIMEOUT_SECONDS = 30

# Default host name for a server to connect to.
DEFAULT_HOST = "localhost"

# Default port for server.
DEFAULT_PORT = 8433

# Default port range for DAIDE servers
DEFAULT_DAIDE_PORT_RANGE = "8434:8600"

# Special username and password to use to connect as a bot recognized by diplomacy module.
# This bot is called "private bot".
PRIVATE_BOT_USERNAME = (
    "#bot@2e723r43tr70fh2239-qf3947-3449-21128-9dh1321d12dm13d83820d28-9dm,xw201=ed283994f4n832483"
)
PRIVATE_BOT_PASSWORD = (
    "#bot:password:28131821--mx1fh5g7hg5gg5g´[],s222222223djdjje399333x93901deedd|e[[[]{{|@S{@244f"
)

# Time to wait to let a bot set orders for a dummy power.
PRIVATE_BOT_TIMEOUT_SECONDS = 60

# Default rules used to construct a Game object when no rules are provided.
DEFAULT_GAME_RULES = ("SOLITAIRE", "NO_PRESS", "IGNORE_ERRORS", "POWER_CHOICE")


class OrderSettings:
    """Constants to define flags for attribute Power.order_is_set."""

    # pylint:disable=too-few-public-methods
    ORDER_NOT_SET = 0
    ORDER_SET_EMPTY = 1
    ORDER_SET = 2
    ALL_SETTINGS = {ORDER_NOT_SET, ORDER_SET_EMPTY, ORDER_SET}


@unique
class SuggestionType(IntFlag):
    """Type of suggestions an advisor provides."""

    NONE = 0
    MESSAGE = 1
    MOVE = 2
    COMMENTARY = 4
    OPPONENT_MOVE = 8
    MOVE_DISTRIBUTION_TEXTUAL = 16
    MOVE_DISTRIBUTION_VISUAL = 32

    @classmethod
    def parse(cls, string: str) -> "SuggestionType":
        """Parse string representation of flags into an enum.

        For example:
        >>> SuggestionType.parse("MESSAGE|MOVE")
        <SuggestionType.MESSAGE|MOVE: 3>
        """
        names = string.split("|")
        value = SuggestionType.NONE
        for name in names:
            value |= SuggestionType[name]
        return value

    def to_parsable(self) -> str:
        """Convert enum to a parseable string representation.

        For example:
        >>> (SuggestionType.MESSAGE | SuggestionType.MOVE).to_parsable()
        'MESSAGE|MOVE'
        """
        # Short circuit because Python 3.11 and later
        # don't include `0` values in `__iter__()` output
        if self == self.NONE:
            return self.NONE.name

        names = [item.name for item in self.__class__ if item in self]
        # `NONE` is trivially included in each enum, so manually remove it
        if self.NONE.name in names:
            names.remove(self.NONE.name)
        return "|".join(names)
