# ==============================================================================
# Copyright (C) 2019 - Philip Paquette
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
"""Settings
- Provides fixed diplomacy settings shared across project
"""
import os

DIPLOMACY_ROOT_DIR = os.path.dirname(os.path.realpath(__file__))
PACKAGE_DIR = DIPLOMACY_ROOT_DIR
TIME_ZONE = os.environ.get("TIME_ZONE", "America/Montreal")
PERMISSIVE_CLIENT_ORIGIN = os.environ.get("PERMISSIVE_CLIENT_ORIGIN", "1") not in ("0", "false", "False", "")

maps_to_load_str = os.environ.get("MAPS_TO_LOAD")
if maps_to_load_str:
    MAPS_TO_LOAD = set(maps_to_load_str.split(","))
else:
    MAPS_TO_LOAD = set()

# Default rules applied to newly-created server games when the client does not
# supply an explicit rule list. Override via the SERVER_GAME_RULES env var as a
# comma-separated list (e.g. "NO_PRESS,IGNORE_ERRORS,POWER_CHOICE").
_server_game_rules_str = os.environ.get("SERVER_GAME_RULES")
if _server_game_rules_str:
    SERVER_GAME_RULES = [rule.strip() for rule in _server_game_rules_str.split(",") if rule.strip()]
else:
    SERVER_GAME_RULES = ["NO_PRESS", "IGNORE_ERRORS", "POWER_CHOICE"]

# Default timeouts (in seconds) used by integration API clients. Override via
# the API_CONNECT_TIMEOUT / API_REQUEST_TIMEOUT env vars.
API_CONNECT_TIMEOUT = int(os.environ.get("API_CONNECT_TIMEOUT", 30))
API_REQUEST_TIMEOUT = int(os.environ.get("API_REQUEST_TIMEOUT", 60))
