"""Optional, bounded CPU decision service for AeroPlay's Laya adapters."""

import argparse
import json
import logging
import os
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

PROTOCOL = "aeroplay-laya-v1"
MODEL = "convaiinnovations/laya"
REVISION = "55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851"
GAMES = ("sky", "cargo", "snake", "tetris", "2048", "flappy", "maze", "match3", "sudoku", "lightsout")
MAX_BODY_BYTES = 16384
MAX_CONTEXT_CHARS = 6000
MAX_OPTIONS = 16
DEFAULT_ORIGINS = (
    "https://games.minifish.org",
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "http://localhost:5191", "http://127.0.0.1:5191",
)
agent = None
torch = None
inference_slot = threading.Lock()


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def allowed_origins():
    values = os.environ.get("LAYA_ALLOWED_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(",")
    origins = set()
    for value in values:
        origin = value.strip().rstrip("/")
        parts = urlsplit(origin)
        if (parts.scheme not in ("https", "http") or not parts.hostname or parts.username
                or parts.password or parts.path or parts.query or parts.fragment or "*" in origin):
            raise ValueError("LAYA_ALLOWED_ORIGINS must contain exact HTTP(S) origins")
        origins.add(origin)
    return frozenset(origins)


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ApiError(400, "Request must be a JSON object")
    if payload.get("game") not in GAMES:
        raise ApiError(400, "Unsupported game")
    context = payload.get("context")
    if not isinstance(context, str) or not context.strip() or len(context) > MAX_CONTEXT_CHARS:
        raise ApiError(400, "Context must contain 1 to 6000 characters")
    question = payload.get("question")
    if not isinstance(question, dict) or question.get("type") != "choice":
        raise ApiError(400, "Question must have type choice")
    instructions = question.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip() or len(instructions) > 600:
        raise ApiError(400, "Instructions must contain 1 to 600 characters")
    criteria = question.get("criteria")
    if not isinstance(criteria, dict) or not 1 <= len(criteria) <= MAX_OPTIONS:
        raise ApiError(400, "Provide 1 to 16 choice descriptions")
    for key, description in criteria.items():
        if not isinstance(key, str) or not key.strip() or len(key) > 64 or not key.isprintable():
            raise ApiError(400, "Choice keys must contain 1 to 64 printable characters")
        if (not isinstance(description, str) or not description.strip()
                or len(description) > 400):
            raise ApiError(400, "Choice descriptions must contain 1 to 400 characters")
    return context, {"type": "choice", "instructions": instructions, "criteria": criteria}


def decide(payload):
    context, question = validate_payload(payload)
    if agent is None:
        raise ApiError(503, "Model is not ready")
    if not inference_slot.acquire(blocking=False):
        raise ApiError(429, "Laya is busy; try again shortly")
    started = time.perf_counter()
    try:
        with torch.inference_mode():
            result = agent.system_one(context, {"action": question}, lang="en",
                                      max_len=1024, head_max_len=512)
        usage = result.get("usage", {})
        if usage.get("truncated"):
            raise ApiError(422, "Observation exceeds the model token budget; shorten the context")
        if usage.get("options"):
            raise ApiError(422, "Choice descriptions exceed the model token budget; shorten the choices")
        answer = result.get("answers", {}).get("action", {})
        choice = answer.get("choice")
        if not isinstance(choice, str) or choice not in question["criteria"]:
            raise ApiError(502, "Model returned an invalid choice")
        return {"choice": choice, "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                "model": MODEL}
    finally:
        inference_slot.release()


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address):
        self.origins = allowed_origins()
        self.connections = threading.BoundedSemaphore(16)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.connections.acquire(blocking=False):
            request.close()
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.connections.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connections.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "AeroPlay-Laya"

    def setup(self):
        self.request.settimeout(5)
        super().setup()

    def origin_allowed(self):
        origin = self.headers.get("Origin")
        if origin is not None and origin not in self.server.origins:
            self.reply(403, {"error": "Origin is not allowed"})
            return False
        return True

    def reply(self, status, payload=None):
        data = json.dumps(payload, allow_nan=False).encode("utf-8") if payload is not None else b""
        self.send_response(status)
        origin = self.headers.get("Origin")
        if origin in self.server.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            if self.headers.get("Access-Control-Request-Private-Network") == "true":
                self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Vary", "Origin, Access-Control-Request-Private-Network")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        if data:
            self.wfile.write(data)
        self.close_connection = True

    def do_OPTIONS(self):
        if not self.origin_allowed():
            return
        if self.path not in ("/health", "/decision"):
            self.reply(404, {"error": "Not found"})
            return
        if self.headers.get("Access-Control-Request-Method", "GET") not in ("GET", "POST"):
            self.reply(405, {"error": "Method is not allowed"})
            return
        headers = self.headers.get("Access-Control-Request-Headers", "")
        if any(header.strip().lower() not in ("", "content-type") for header in headers.split(",")):
            self.reply(400, {"error": "Request headers are not allowed"})
            return
        self.reply(204)

    def do_GET(self):
        if not self.origin_allowed():
            return
        if self.path != "/health":
            self.reply(404, {"error": "Not found"})
            return
        self.reply(200, {"ready": agent is not None, "model": MODEL, "revision": REVISION,
                         "protocol": PROTOCOL, "games": list(GAMES), "device": "cpu", "threads": 4})

    def do_POST(self):
        if not self.origin_allowed():
            return
        if self.path != "/decision":
            self.reply(404, {"error": "Not found"})
            return
        try:
            if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
                raise ApiError(415, "Content-Type must be application/json")
            if self.headers.get("Transfer-Encoding"):
                raise ApiError(400, "Transfer-Encoding is not supported")
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError as error:
                raise ApiError(400, "Invalid Content-Length") from error
            if not 0 < size <= MAX_BODY_BYTES:
                raise ApiError(413, "Request body must contain 1 to 16384 bytes")
            raw = self.rfile.read(size)
            if len(raw) != size:
                raise ApiError(400, "Incomplete request body")
            try:
                payload = json.loads(raw)
            except (ValueError, UnicodeDecodeError) as error:
                raise ApiError(400, "Invalid JSON") from error
            self.reply(200, decide(payload))
        except ApiError as error:
            self.reply(error.status, {"error": str(error)})
        except socket.timeout:
            self.reply(408, {"error": "Request timed out"})
        except Exception:
            logging.exception("Inference failed")
            self.reply(500, {"error": "Inference failed"})


def main():
    global agent, torch
    parser = argparse.ArgumentParser()
    parser.add_argument("--prepare", action="store_true", help="Download and warm the pinned model, then exit")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8771)
    args = parser.parse_args()
    allowed_origins()
    import torch as torch_module
    import laya
    torch = torch_module
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    agent = laya.load(MODEL, device="cpu", revision=REVISION)
    warmup = decide({"game": "sky", "context": "The golden ring is in the left lane.",
                     "question": {"type": "choice", "instructions": "Which lane contains the golden ring?",
                                  "criteria": {"0": "left", "1": "middle", "2": "right"}}})
    logging.info("Model ready: %s; warmup choice: %s", MODEL, warmup["choice"])
    if not args.prepare:
        with Server((args.host, args.port)) as server:
            logging.info("Serving %s on %s:%s", PROTOCOL, args.host, args.port)
            server.serve_forever()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    main()
