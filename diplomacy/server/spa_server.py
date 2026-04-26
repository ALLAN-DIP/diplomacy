"""Minimal SPA-aware static file server.

Serves files from a directory (default: diplomacy/web/build).  When a
requested path does not correspond to a real file, it serves index.html
instead so that client-side routing (React Router) can take over.

Usage:
    python -m diplomacy.server.spa_server [--port 80] [--directory diplomacy/web/build]
"""

import argparse
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler


class SPAHandler(SimpleHTTPRequestHandler):
    """Handler that falls back to index.html for unknown paths."""

    def do_GET(self):
        # Attempt to resolve the request to a real file on disk.
        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path) and not os.path.exists(
            os.path.join(path, "index.html")
        ):
            # Not a real file/directory — serve the SPA entry point instead.
            self.path = "/index.html"
        return super().do_GET()


def main():
    parser = argparse.ArgumentParser(description="SPA-aware static file server")
    parser.add_argument("--port", type=int, default=80, help="Port to listen on")
    parser.add_argument(
        "--directory",
        type=str,
        default="diplomacy/web/build",
        help="Directory to serve",
    )
    args = parser.parse_args()

    os.chdir(args.directory)
    server = HTTPServer(("", args.port), SPAHandler)
    print(f"Serving SPA from {args.directory} on port {args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
