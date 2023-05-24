from diplomacy.utils import parsing, strings
from diplomacy.utils.jsonable import Jsonable

class Order_log(Jsonable):
    """ Log class.

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
    __slots__ = ['log', 'time_sent']
    model = {
        'log': str,                                # either SYSTEM or a power name.
        strings.TIME_SENT: parsing.OptionalValueType(int),  # given by server.
    }

    def __init__(self, **kwargs):
        self.log = None                  # type: str
        self.time_sent = None               # type: int
        super(Order_log, self).__init__(**kwargs)

    def __str__(self):
        return '[%d](%s)' % (self.time_sent or 0, self.log)

    def __hash__(self):
        return hash(self.time_sent)

    def __eq__(self, other):
        assert isinstance(other, Order_log)
        return self.time_sent == other.time_sent

    def __ne__(self, other):
        assert isinstance(other, Order_log)
        return self.time_sent != other.time_sent

    def __lt__(self, other):
        assert isinstance(other, Order_log)
        return self.time_sent < other.time_sent

    def __gt__(self, other):
        assert isinstance(other, Order_log)
        return self.time_sent > other.time_sent

    def __le__(self, other):
        assert isinstance(other, Order_log)
        return self.time_sent <= other.time_sent

    def __ge__(self, other):
        assert isinstance(other, Order_log)
        return self.time_sent >= other.time_sent