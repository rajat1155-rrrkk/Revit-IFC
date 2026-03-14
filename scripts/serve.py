#!/usr/bin/env python3
"""Serve the demo locally."""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    server = ThreadingHTTPServer(("127.0.0.1", 4173), SimpleHTTPRequestHandler)
    print("Serving IFC material demo at http://127.0.0.1:4173")
    try:
        import os

        os.chdir(root)
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
