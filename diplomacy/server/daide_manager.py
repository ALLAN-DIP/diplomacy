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
"""Manager for per-game DAIDE TCP servers."""
import logging
import socket
from random import randint

from diplomacy.daide.server import Server as DaideServer

LOGGER = logging.getLogger(__name__)


def is_port_opened(port, hostname="127.0.0.1"):
    """Checks if the specified port is opened

    :param port: The port to check
    :param hostname: The hostname to check, defaults to '127.0.0.1'
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        return sock.connect_ex((hostname, port)) == 0


class DaideManager:
    """Owns the per-game DAIDE TCP servers and their port allocations."""

    __slots__ = ["server", "daide_servers", "daide_min_port", "daide_max_port"]

    def __init__(self, server, daide_min_port, daide_max_port):
        self.server = server
        self.daide_servers = {}  # {port: daide_server}
        self.daide_min_port = daide_min_port
        self.daide_max_port = daide_max_port

    def start(self, game_id, port=8431):
        """Start a new DAIDE TCP server to handle DAIDE clients connections

        :param game_id: game id to pass to the DAIDE server
        :param port: the port to use. If None, an available random port will be used
        """
        while port in self.daide_servers:
            port = randint(self.daide_min_port, self.daide_max_port)

        for server in self.daide_servers.values():
            if server.game_id == game_id:
                return None

        while port is None or is_port_opened(port):
            port = randint(self.daide_min_port, self.daide_max_port)

        daide_server = DaideServer(self.server, game_id)
        daide_server.listen(port)
        self.daide_servers[port] = daide_server
        LOGGER.info("DAIDE server running for game %s on port %d", game_id, port)
        return port

    def stop(self, game_id):
        """Stop one or all DAIDE TCP server

        :param game_id: game id of the DAIDE server. If None, all servers will be stopped
        :type game_id: str
        """
        for port in list(self.daide_servers.keys()):
            server = self.daide_servers[port]
            if game_id is None or server.game_id == game_id:
                server.stop()
                del self.daide_servers[port]

    def get_port(self, game_id):
        """Get the DAIDE port opened for a specific game_id

        :param game_id: game id of the DAIDE server.
        """
        for port, server in self.daide_servers.items():
            if server.game_id == game_id:
                return port
        return None
