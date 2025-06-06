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
"""Test Map Generation
- Contains test for map generation
"""
import glob
import os
import pickle
import sys

import pytest

from diplomacy.engine.map import Map
from diplomacy.utils.convoy_paths import EXTERNAL_CACHE_PATH, get_file_md5

MODULE_PATH = sys.modules["diplomacy"].__path__[0]


@pytest.mark.skipif(
    sys.version_info < (3, 8),
    reason="Test fails intermittently in Python 3.7 CI with a variety of errors",
)
def test_map_creation():
    """Tests for map creation"""
    maps = glob.glob(os.path.join(MODULE_PATH, "maps", "*.map"))
    assert maps, "Expected maps to be found."
    for current_map in maps:
        map_name = current_map[current_map.rfind("/") + 1 :].replace(".map", "")
        this_map = Map(map_name)
        assert this_map.error == [], "Map %s should have no errors" % map_name
        del this_map


@pytest.mark.skipif(
    sys.version_info < (3, 8),
    reason="Test fails intermittently in Python 3.7 CI with a variety of errors",
)
def test_map_with_full_path():
    """Tests for map creation"""
    maps = glob.glob(os.path.join(MODULE_PATH, "maps", "*.map"))
    assert maps, "Expected maps to be found."
    for current_map in maps:
        this_map = Map(current_map)
        assert this_map.error == [], "Map %s should have no errors" % current_map
        del this_map


@pytest.mark.skipif(sys.version_info < (3, 8), reason="Test fails intermittently in Python 3.7 CI")
def test_external_cache():
    """Tests that all maps with a SVG are in the external cache"""
    maps = glob.glob(os.path.join(MODULE_PATH, "maps", "*.map"))
    assert maps, "Expected maps to be found."
    assert os.path.exists(EXTERNAL_CACHE_PATH), "Expected external cache to exist"

    # Checking that maps with a svg are in the external cache
    with open(EXTERNAL_CACHE_PATH, "rb") as cache_file:
        external_cache = pickle.load(cache_file)
        for current_map in maps:
            map_name = current_map[current_map.rfind("/") + 1 :].replace(".map", "")
            this_map = Map(map_name)
            if not this_map.svg_path:
                continue
            assert get_file_md5(current_map) in external_cache, (
                'Map "%s" not found in external cache' % map_name
            )
            del this_map
