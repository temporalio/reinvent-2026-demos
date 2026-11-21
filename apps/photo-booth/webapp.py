from fastapi.staticfiles import StaticFiles
from holodeck.server import app
app.mount("/", StaticFiles(directory="/app/web-dist", html=True), name="web")
