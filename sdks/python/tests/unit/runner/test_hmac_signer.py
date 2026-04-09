from opik.runner.hmac_signer import CommandSigner, CommandVerifier, _canonical


class TestCommandSignerVerifier:
    def setup_method(self):
        self.key = b"test-shared-key-32-bytes-long!!!!"
        self.signer = CommandSigner(self.key)
        self.verifier = CommandVerifier(self.key)

    def test_sign_verify_roundtrip(self):
        hmac_val = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo/bar.txt"})
        assert self.verifier.verify(
            "cmd-1", "ReadFile", {"path": "/foo/bar.txt"}, hmac_val
        )

    def test_wrong_key_rejects(self):
        other_signer = CommandSigner(b"different-key-also-32-bytes!!!!")
        hmac_val = other_signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        assert not self.verifier.verify("cmd-1", "ReadFile", {"path": "/foo"}, hmac_val)

    def test_tampered_payload_rejects(self):
        hmac_val = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        assert not self.verifier.verify("cmd-1", "ReadFile", {"path": "/bar"}, hmac_val)

    def test_tampered_command_id_rejects(self):
        hmac_val = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        assert not self.verifier.verify("cmd-2", "ReadFile", {"path": "/foo"}, hmac_val)

    def test_tampered_type_rejects(self):
        hmac_val = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        assert not self.verifier.verify("cmd-1", "Exec", {"path": "/foo"}, hmac_val)

    def test_none_hmac_rejects(self):
        assert not self.verifier.verify("cmd-1", "ReadFile", {}, None)

    def test_tamper_count_increments(self):
        assert self.verifier.tamper_count == 0
        self.verifier.verify("cmd-1", "ReadFile", {}, None)
        assert self.verifier.tamper_count == 1
        self.verifier.verify("cmd-2", "ReadFile", {}, "bad-hmac")
        assert self.verifier.tamper_count == 2

    def test_same_command_same_hmac(self):
        h1 = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        h2 = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        assert h1 == h2

    def test_different_commands_different_hmac(self):
        h1 = self.signer.sign("cmd-1", "ReadFile", {"path": "/foo"})
        h2 = self.signer.sign("cmd-2", "ReadFile", {"path": "/foo"})
        assert h1 != h2


class TestCanonical:
    def test_integers_stay_integers(self):
        assert _canonical({"n": 42}) == '{"n":42}'
        assert _canonical({"n": 42}) != '{"n":42.0}'

    def test_nested_keys_sorted(self):
        assert _canonical({"b": 1, "a": 2}) == '{"a":2,"b":1}'

    def test_none_payload(self):
        assert _canonical(None) == ""

    def test_string_payload(self):
        assert _canonical("hello") == "hello"

    def test_float_roundtrip(self):
        assert _canonical({"x": 1.5}) == '{"x":1.5}'

    def test_int_vs_float_differ(self):
        assert _canonical({"n": 42}) != _canonical({"n": 42.0})
