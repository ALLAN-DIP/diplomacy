#!/usr/bin/env python3
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
# =============================================================================
""" Small module script to quickly start a server with pretty log-printing.

    You can stop the server with keyboard interruption (Ctrl+C). Usage:

    .. code-block:: bash

        # run on port 8432.
        python -m diplomacy.server.run

        # run on given port.
        python -m diplomacy.server.run --port=<given port>

"""
import argparse
import asyncio

from diplomacy import Server
from diplomacy.utils import constants
import tornado.web
import tornado.ioloop
import json


class RequestHandler(tornado.web.RequestHandler):
    def get(self):
        game = self.get_argument('game', None)
        path = '../web/data/games/' + game + '.json'
        with open(path) as f:
            data = json.load(f)
        self.write(data)
        f.close()


async def main():
    PARSER = argparse.ArgumentParser(description='Run server.')
    PARSER.add_argument('--port', '-p', type=int, default=constants.DEFAULT_PORT,
                        help='run on the given port (default: %s)' % constants.DEFAULT_PORT)
    ARGS = PARSER.parse_args()

    try:
        Server().start(port=ARGS.port)
        print('Server started on port %s.' % ARGS.port)

        app = tornado.web.Application([
            (r'/', RequestHandler),
        ])

        app.listen(8888)
        print('Tornado started on port 8888.')
        #tornado.ioloop.IOLoop.current().start()
        await asyncio.Event().wait()

    except KeyboardInterrupt:
        print('Keyboard interruption.')

if __name__ == '__main__':
    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
