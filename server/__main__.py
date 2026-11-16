import argparse

import uvicorn

parser = argparse.ArgumentParser(description="Run the 2048 RL sandbox")
parser.add_argument("--host", default="127.0.0.1")
parser.add_argument("--port", type=int, default=8048)
args = parser.parse_args()

uvicorn.run("server.app:app", host=args.host, port=args.port)
