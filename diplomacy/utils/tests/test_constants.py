"""Tests for `constants.py`."""

from diplomacy.utils.constants import SuggestionType


def test_suggestion_types_parse() -> None:
    """Test `SuggestionType.parse()`."""
    assert SuggestionType.parse("NONE") == SuggestionType.NONE
    assert SuggestionType.parse("OPPONENT_MOVE") == SuggestionType.OPPONENT_MOVE
    assert SuggestionType.parse("MESSAGE|MOVE") == SuggestionType.MESSAGE | SuggestionType.MOVE


def test_suggestion_types_to_parsable() -> None:
    """Test `SuggestionType.to_parsable()`."""
    assert SuggestionType.NONE.to_parsable() == "NONE"
    assert SuggestionType.OPPONENT_MOVE.to_parsable() == "OPPONENT_MOVE"
    assert (SuggestionType.MESSAGE | SuggestionType.MOVE).to_parsable() == "MESSAGE|MOVE"


def test_suggestion_types_round_trip() -> None:
    """Ensures round trip works for every possible value."""
    values = [SuggestionType(i) for i in range(0, max(SuggestionType) * 2)]
    for value in values:
        assert value == SuggestionType.parse(value.to_parsable())
