#!/usr/bin/env python3
"""
Start the Magpie HTTP server as a fully detached daemon.

Usage:  start_server.py <port> <web_dir>

Double-forks, prints the daemon's PID to stdout, then closes all FDs and
serves forever. The brief parent processes exit immediately so the calling
shell can return promptly.

Why we need this: AppleScript's `do shell script` opens extra capture FDs
beyond stdin/stdout/stderr. Backgrounding python3 from bash and closing
0/1/2 isn't enough; bash itself still holds the inherited capture FDs and
won't return control until they close. By doing the daemonization in Python
we can `os.closerange()` everything before serving, guaranteeing the pipe
gets EOF and `do shell script` returns.
"""
import http.server
import os
import socketserver
import sys


def main():
    if len(sys.argv) != 3:
        print('usage: start_server.py <port> <web_dir>', file=sys.stderr)
        sys.exit(2)
    port = int(sys.argv[1])
    web_dir = sys.argv[2]

    # First fork — original parent exits immediately so the calling shell can
    # return. The first child becomes a session leader, then forks the actual
    # daemon (grandchild) and itself exits, leaving the daemon orphaned to
    # launchd (PPID=1).
    if os.fork() > 0:
        os._exit(0)
    os.setsid()
    if os.fork() > 0:
        os._exit(0)

    # Grandchild = daemon. Write our PID to the inherited stdout pipe so the
    # caller learns it, *before* we close FDs.
    sys.stdout.write(str(os.getpid()) + '\n')
    sys.stdout.flush()

    # Close every inherited FD so the caller's `do shell script` pipe gets
    # EOF and `do shell script` returns immediately.
    os.closerange(0, 1024)

    # Reopen std streams to /dev/null so the HTTP server has defined FDs.
    devnull_in  = os.open(os.devnull, os.O_RDONLY)
    devnull_out = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull_in,  0)
    os.dup2(devnull_out, 1)
    os.dup2(devnull_out, 2)
    os.close(devnull_in)
    os.close(devnull_out)

    os.chdir(web_dir)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_a):
            pass  # quiet

    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', port), Handler)
    httpd.allow_reuse_address = True
    httpd.serve_forever()


if __name__ == '__main__':
    main()
