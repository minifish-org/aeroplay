"""Translate the bounded AeroPlay API to llama.cpp's decision endpoint."""
import json
import os
import socket
import urllib.error
import urllib.request
from urllib.parse import urlsplit

MODEL_FILE = "Laya-Q8_0.gguf"
REVISION = "22265007700297ba9e128297e82540cf28c5d7d4"
RUNTIME = "llama.cpp b11552"
MAX_RESPONSE_BYTES = 128 * 1024


class NativeBackend:
    model = "Laya Q8"

    def __init__(self, api_error):
        self.api_error = api_error
        self.url = os.environ.get("LAYA_NATIVE_URL", "http://inference:8080").rstrip("/")
        parts = urlsplit(self.url)
        if parts.scheme != "http" or not parts.hostname or parts.username or parts.password or parts.path or parts.query or parts.fragment:
            raise ValueError("LAYA_NATIVE_URL must be the private inference HTTP origin")

    def request(self, path, payload=None, timeout=5):
        data = json.dumps(payload).encode() if payload is not None else None
        request = urllib.request.Request(self.url + path, data, {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise self.api_error(502, "Model response exceeds the response limit")
                result = json.loads(raw)
                if not isinstance(result, dict):
                    raise self.api_error(502, "Model returned an invalid response")
                return result
        except urllib.error.HTTPError as error:
            status = {400: 422, 413: 422, 422: 422, 429: 429, 503: 503}.get(error.code, 502)
            error.close()
            raise self.api_error(status, "Native model could not process this observation") from error
        except (socket.timeout, TimeoutError) as error:
            raise self.api_error(504, "Native model timed out") from error
        except urllib.error.URLError as error:
            raise self.api_error(503, "Native model is unavailable") from error
        except (ValueError, UnicodeDecodeError) as error:
            raise self.api_error(502, "Native model returned invalid JSON") from error

    def decide(self, context, question):
        result = self.request("/v1/systemone", {"state": context, "questions": {"action": question}})
        if not isinstance(result.get("model"), str) or not result["model"].endswith("/" + MODEL_FILE):
            raise self.api_error(502, "Native model does not match the configured Laya checkpoint")
        return result

    def health(self):
        try:
            self.request("/health", timeout=1)
            ready = True
        except self.api_error:
            ready = False
        return {"ready": ready, "model": self.model, "revision": REVISION,
                "runtime": RUNTIME, "quantization": "Q8_0", "device": "vulkan", "threads": 4}
