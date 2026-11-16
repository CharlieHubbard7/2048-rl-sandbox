from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .sandbox import Sandbox

WEB = Path(__file__).resolve().parent.parent / "web"
sandbox = Sandbox()


@asynccontextmanager
async def lifespan(_app):
    sandbox.start()
    yield
    await sandbox.stop_training()


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=WEB), name="static")


@app.get("/")
def index():
    return FileResponse(WEB / "index.html")


@app.websocket("/ws")
async def socket(ws: WebSocket):
    await ws.accept()
    await sandbox.connect(ws)
    try:
        while True:
            await sandbox.handle(await ws.receive_json())
    except WebSocketDisconnect:
        sandbox.clients.discard(ws)
