import functools, http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass

handler = functools.partial(NoCache, directory=sys.argv[1])
http.server.ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()
