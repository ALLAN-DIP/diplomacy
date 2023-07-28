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
""" Daide composer message. Represent a message exchanged inside a game.


"""
from xxlimited import Str
from diplomacy.utils import parsing, strings
from diplomacy.utils.jsonable import Jsonable

SYSTEM = 'SYSTEM'  # sender
GLOBAL = 'GLOBAL'  # recipient (all powers)
OBSERVER = 'OBSERVER'  # recipient (all observer tokens)
OMNISCIENT = 'OMNISCIENT'  # recipient (all omniscient tokens)

class DaideComposerMessage(Jsonable):
    """ Message class.

        Properties:

        - **sender**: message sender name: either SYSTEM or a power name.
        - **recipient**: message recipient name: either GLOBAL, OBSERVER, OMNISCIENT or a power name.
        - **time_sent**: message timestamp in microseconds.
        - **phase**: short name of game phase when message is sent.
        - **message**: message body.

        **Note about timestamp management**:

        We assume a message has an unique timestamp inside one game. To respect this rule, the server is the only one
        responsible for generating message timestamps. This allow to generate timestamp or only 1 same machine (server)
        instead of managing timestamps from many user machines, to prevent timestamp inconsistency when messages
        are stored on server. Therefore, message timestamp is the time when server stores the message, not the time
        when message was sent by any client.
    """
    __slots__ = ['sender', 'recipient', 'time_sent', 'phase', 'message', 'negotiation', 'daide', 'tones', 'gloss']
    model = {
        strings.SENDER:      str,                             # either SYSTEM or a power name.
        strings.RECIPIENT:   str,                             # either GLOBAL, OBSERVER, OMNISCIENT or a power name.
        strings.TIME_SENT:   parsing.OptionalValueType(int),  # given by server.
        strings.PHASE:       str,                             # phase short name (e.g. 'S1901M' or 'COMPLETED')
        strings.MESSAGE:     parsing.OptionalValueType(str),
        strings.NEGOTIATION: parsing.OptionalValueType(str),  # string of form data json
        strings.DAIDE:       parsing.OptionalValueType(str),
        strings.TONES:       parsing.OptionalValueType(str),  # comma-delimited str of tones.
        strings.GLOSS:       parsing.OptionalValueType(bool),
    }

    def __init__(self, **kwargs):
        self.sender      = None               # type: str
        self.recipient   = None               # type: str
        self.time_sent   = None               # type: int
        self.phase       = None               # type: str
        self.message     = None               # type: str
        self.negotiation = None               # type: str
        self.daide       = None               # type: str
        self.tones       = None               # type: str
        self.gloss       = None               # type: bool
        super(DaideComposerMessage, self).__init__(**kwargs)

    def __str__(self):
        return '[%d/%s/%s->%s](%s)' % (self.time_sent or 0, self.phase, self.sender, self.recipient, self.message)

    def __hash__(self):
        return hash(self.time_sent)

    def __eq__(self, other):
        assert isinstance(other, DaideComposerMessage)
        return self.time_sent == other.time_sent

    def __ne__(self, other):
        assert isinstance(other, DaideComposerMessage)
        return self.time_sent != other.time_sent

    def __lt__(self, other):
        assert isinstance(other, DaideComposerMessage)
        return self.time_sent < other.time_sent

    def __gt__(self, other):
        assert isinstance(other, DaideComposerMessage)
        return self.time_sent > other.time_sent

    def __le__(self, other):
        assert isinstance(other, DaideComposerMessage)
        return self.time_sent <= other.time_sent

    def __ge__(self, other):
        assert isinstance(other, DaideComposerMessage)
        return self.time_sent >= other.time_sent

    def is_global(self):
        """ Return True if this message is global. """
        return self.recipient == GLOBAL

    def for_observer(self):
        """ Return True if this message is sent to observers. """
        return self.recipient == OBSERVER