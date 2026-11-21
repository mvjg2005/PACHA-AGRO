"""Límite de solicitudes en memoria (suficiente para un prototipo con un solo proceso)."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_calls: int, per_seconds: float):
        self.max_calls = max_calls
        self.per_seconds = per_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        if key not in self._hits and len(self._hits) >= 10_000:
            # Poda antes de crear una clave nueva para evitar crecimiento sin límite.
            stale_before = now - self.per_seconds
            for stale_key, hits in list(self._hits.items()):
                while hits and hits[0] <= stale_before:
                    hits.popleft()
                if not hits:
                    self._hits.pop(stale_key, None)
            if len(self._hits) >= 10_000:
                raise HTTPException(status_code=429, detail="Demasiadas claves de límite activas. Intente más tarde.")

        q = self._hits[key]
        while q and now - q[0] >= self.per_seconds:
            q.popleft()
        if len(q) >= self.max_calls:
            raise HTTPException(status_code=429, detail="Demasiados intentos. Espere un momento y vuelva a intentar.")
        q.append(now)

    def reset(self) -> None:
        self._hits.clear()


login_ip_limiter = RateLimiter(max_calls=40, per_seconds=300)
login_limiter = RateLimiter(max_calls=8, per_seconds=300)
register_limiter = RateLimiter(max_calls=10, per_seconds=3600)
chat_limiter = RateLimiter(max_calls=40, per_seconds=60)


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"
