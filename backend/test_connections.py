import gc
import importlib
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest

class ConnectionTests(unittest.TestCase):
    def test_connections_close_and_worker_does_not_accumulate_handles(self):
        with tempfile.TemporaryDirectory() as directory:
            os.environ['DATA_DIR']=directory
            import push_system as push
            import server
            importlib.reload(push)
            importlib.reload(server)
            server.initialize()
            for factory in [push.connect,server.db]:
                with factory() as connection:
                    connection.execute('SELECT 1')
                with self.assertRaises(sqlite3.ProgrammingError):
                    connection.execute('SELECT 1')
                with self.assertRaises(RuntimeError):
                    with factory() as connection:
                        raise RuntimeError('test rollback')
                with self.assertRaises(sqlite3.ProgrammingError):
                    connection.execute('SELECT 1')
            if Path('/proc/self/fd').exists():
                gc.collect()
                gc.disable()
                try:
                    before=len(os.listdir('/proc/self/fd'))
                    for _ in range(1000):
                        push.run_once(sender=lambda *args,**kwargs:'sent')
                    self.assertEqual(len(os.listdir('/proc/self/fd')),before)
                finally:
                    gc.enable()

if __name__=='__main__':unittest.main()
