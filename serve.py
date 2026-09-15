"""Static file server for the demo client.

`python -m http.server` sends `Last-Modified` but no `Cache-Control`, so
browsers apply heuristic freshness and keep serving a stale `client.js` /
`index.html` after a redeploy. This is a tiny demo with no build step, so
`no-store` is the simplest correct answer.
"""

import http.server
import os


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    http.server.ThreadingHTTPServer(("0.0.0.0", port), NoCacheHandler).serve_forever()
