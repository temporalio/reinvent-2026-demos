"""Initial one-pod port. Worker failure restarts the whole app; media durability is a release gate."""
import os
import signal
import subprocess
import sys
import time

stopping = False
def stop(*_):
    global stopping
    stopping = True
signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
children = [subprocess.Popen([sys.executable, "-m", "holodeck.worker"]),
            subprocess.Popen([sys.executable, "-m", "uvicorn", "webapp:app", "--host", "0.0.0.0", "--port", "8080", "--root-path", os.environ.get("PUBLIC_PATH", "")])]
code = 0
try:
    while not stopping:
        if any(child.poll() is not None for child in children):
            code = 1
            break
        time.sleep(.2)
finally:
    for child in children:
        if child.poll() is None:
            child.terminate()
    for child in children:
        try:
            child.wait(timeout=15)
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
sys.exit(code)
