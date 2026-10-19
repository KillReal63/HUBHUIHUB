"""Disposable local preview of all modules. Never deploy this development server."""
from pathlib import Path
import hashlib
import mimetypes
import os
import secrets
import sys
import tempfile
import time
from urllib.parse import unquote, urlsplit

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'backend'))


def main():
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port',type=int,default=4185)
    args=parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='day-hub-preview-') as directory:
        os.environ['DATA_DIR']=directory
        import server
        server.initialize()
        token=secrets.token_urlsafe(32)
        with server.db() as c:
            c.execute('INSERT INTO account VALUES(1,?,?)',('preview','preview'))
            c.execute('INSERT INTO sessions VALUES(?,?)',(hashlib.sha256(token.encode()).hexdigest(),time.time()+86400))

        class Preview(server.API):
            def do_GET(self):
                path=unquote(urlsplit(self.path).path)
                if path.startswith('/api/'):
                    if path.startswith('/api/push/'):
                        return self.reply(400,{'error':'Push отключён в локальном просмотре'})
                    return super().do_GET()
                if path.startswith('/gym/') or path=='/gym':
                    rel=path.removeprefix('/gym').strip('/')
                    file=ROOT/'gym-prototype/dist'/('index.html' if rel in ('','program','catalog') else rel)
                elif path.startswith('/vovrema/'):
                    file=ROOT/'dist'/(path.removeprefix('/vovrema/') or 'index.html')
                else:
                    file=ROOT/'dist'/('hub/index.html' if path=='/' else path.lstrip('/'))
                    if file.is_dir():file=file/'index.html'
                # Restrict reads to static frontend roots, including after path resolution.
                resolved=file.resolve()
                if not any(resolved.is_relative_to(root.resolve()) for root in (ROOT/'dist',ROOT/'gym-prototype/dist')) or not resolved.is_file():
                    self.send_error(404);return
                data=resolved.read_bytes();self.send_response(200)
                self.send_header('Content-Type',mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
                self.send_header('Content-Length',str(len(data)))
                self.send_header('Set-Cookie',f'session={token}; Path=/; HttpOnly; SameSite=Strict')
                self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)

            def do_POST(self):
                if self.path.startswith('/api/push/'):
                    return self.reply(400,{'error':'Push отключён в локальном просмотре'})
                return super().do_POST()

        http=server.ThreadingHTTPServer(('127.0.0.1',args.port),Preview)
        server.ORIGIN=f'http://127.0.0.1:{http.server_port}'
        print(f'Local disposable preview: {server.ORIGIN}',flush=True)
        print('Temporary data only. No real push. Stop with Ctrl+C; export any test data before stopping.',flush=True)
        try:http.serve_forever()
        except KeyboardInterrupt:pass
        finally:http.server_close()


if __name__=='__main__':main()
