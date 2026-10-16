"""Static file server for the demo client.

`python -m http.server` sends `Last-Modified` but no `Cache-Control`, so
browsers apply heuristic freshness and keep serving a stale `client.js` /
`index.html` after a redeploy. This is a tiny demo with no build step, so
`no-store` is the simplest correct answer.

`/agent_url.js` is generated from the `AGENT_URL` env var (set per environment
on Cloud Run) rather than baked into the image at build time, so the same image
serves every environment and changing the agent is a redeploy, not a rebuild.
With `AGENT_URL` unset it emits an empty value, so discovery fails loudly
instead of silently pointing at the wrong agent.
"""

import http.server
import os

AGENT_URL = os.environ.get("AGENT_URL", "")


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/agent_url.js":
            body = f'window.A2UI_AGENT_URL = "{AGENT_URL}";\n'.encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
