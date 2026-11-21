"""Límite de solicitudes en memoria (suficiente para un prototipo con un solo proceso)."""
import time
import threading
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_calls: int, per_seconds: float):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()
        self._checks = 0
        self._max_keys = 10000

    def check(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            self._checks += 1
            # Elimina clientes inactivos periódicamente para evitar crecimiento ilimitado.
            if self._checks % 100 == 0 or len(self._hits) >= self._max_keys:
                for old_key, old_hits in list(self._hits.items()):
                    while old_hits and now - old_hits[0] > self.per_seconds:
                        old_hits.popleft()
                    if not old_hits:
                        self._hits.pop(old_key, None)
            q = self._hits[key]
            while q and now - q[0] > self.per_seconds:
                q.popleft()
            if len(q) >= self.max_calls:
                raise HTTPException(status_code=429, detail="Demasiados intentos. Espere un momento y vuelva a intentar.")
            q.append(now)
            if len(self._hits) > self._max_keys:
                # Evita que solicitudes desde IPs distintas agoten la memoria del proceso.
                oldest = min(self._hits, key=lambda k: self._hits[k][0] if self._hits[k] else now)
                if oldest != key:
                    self._hits.pop(oldest, None)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._checks = 0


login_limiter = RateLimiter(max_calls=8, per_seconds=300)
register_limiter = RateLimiter(max_calls=10, per_seconds=3600)
chat_limiter = RateLimiter(max_calls=40, per_seconds=60)


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"
