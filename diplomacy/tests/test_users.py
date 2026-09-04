"""Tests for server user/token connection bookkeeping."""

from diplomacy.server.users import Users


def test_reconnect_transfers_token_before_old_handler_closes():
    users = Users()
    users.add_user("albert", "unused-password-hash")
    old_handler = object()
    new_handler = object()
    token = users.connect_user("albert", old_handler)

    # The replacement WebSocket authenticates before the old WebSocket's
    # delayed on_close callback has removed its connection handler.
    users.attach_connection_handler(token, new_handler)

    assert users.get_connection_handler(token) is new_handler
    assert old_handler not in users.connection_handler_to_tokens
    assert users.connection_handler_to_tokens[new_handler] == {token}

    # A late on_close for the old handler must leave the replacement intact.
    assert users.remove_connection(old_handler, remove_tokens=False) is None
    assert users.get_connection_handler(token) is new_handler
    assert users.has_token(token)


def test_attach_to_current_handler_is_idempotent():
    users = Users()
    users.add_user("albert", "unused-password-hash")
    handler = object()
    token = users.connect_user("albert", handler)

    users.attach_connection_handler(token, handler)

    assert users.get_connection_handler(token) is handler
    assert users.connection_handler_to_tokens[handler] == {token}
