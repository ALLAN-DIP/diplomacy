from diplomacy.utils import parsing, strings
from diplomacy.utils.jsonable import Jsonable

class Order_log(Jsonable):
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