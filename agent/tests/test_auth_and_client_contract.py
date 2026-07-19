from src.screener.auth import is_valid_internal_token


def test_internal_token_comparison_is_strict_and_rejects_missing_values():
    assert is_valid_internal_token("secret", "secret")
    assert not is_valid_internal_token("secret", "other")
    assert not is_valid_internal_token(None, "secret")
    assert not is_valid_internal_token("secret", None)


def test_token_comparison_does_not_accept_empty_configuration():
    assert not is_valid_internal_token("", "")
