import socket

import pytest


@pytest.fixture(autouse=True)
def forbid_external_network(monkeypatch: pytest.MonkeyPatch) -> None:
    original = socket.socket.connect

    def guarded_connect(sock: socket.socket, address: object) -> object:
        host = address[0] if isinstance(address, tuple) else ""
        if host not in {"127.0.0.1", "::1", "localhost", "testserver"}:
            raise AssertionError(f"external network is forbidden in tests: {host}")
        return original(sock, address)  # type: ignore[arg-type]

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
