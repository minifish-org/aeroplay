"""Native protocol and failure tests; real model flights are checked separately."""
import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import server
from native_backend import NativeBackend
from test_server import payload


class NativeTests(unittest.TestCase):
    def setUp(self):
        self.status = 200
        self.answer = {"model": "/models/Laya-Q8_0.gguf", "answers": {"action": {"choice": "2"}}}
        self.received = []
        test = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.send_response(test.status)
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')

            def do_POST(self):
                test.received.append((self.path, json.loads(self.rfile.read(int(self.headers["Content-Length"])))))
                self.send_response(test.status)
                self.end_headers()
                self.wfile.write(json.dumps(test.answer).encode())

        self.upstream = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.upstream.serve_forever, daemon=True)
        self.thread.start()
        with patch.dict(server.os.environ, {"LAYA_NATIVE_URL": f"http://127.0.0.1:{self.upstream.server_port}"}):
            self.backend = NativeBackend(server.ApiError)

    def tearDown(self):
        self.upstream.shutdown()
        self.upstream.server_close()
        self.thread.join()
        self.assertFalse(server.inference_slot.locked())

    def decide(self):
        with patch.object(server, "backend", self.backend):
            return server.decide(payload())

    def test_forwards_the_same_observation_and_returns_the_native_choice(self):
        result = self.decide()
        self.assertEqual(result["choice"], "2")
        self.assertEqual(result["model"], "Laya Q8")
        self.assertEqual(self.received, [("/v1/systemone", {"state": payload()["context"], "questions": {"action": payload()["question"]}})])
        self.assertTrue(self.backend.health()["ready"])
        self.assertEqual(self.backend.health()["device"], "vulkan")

    def test_invalid_choices_and_wrong_models_never_fall_back(self):
        for answer in ({"model": "/models/Laya-Q8_0.gguf", "answers": {"action": {"choice": "invalid"}}},
                       {"model": "/models/Julia-1-Q8_0.gguf", "answers": {"action": {"choice": "2"}}}):
            self.answer = answer
            with self.assertRaises(server.ApiError) as caught:
                self.decide()
            self.assertEqual(caught.exception.status, 502)

    def test_unavailable_native_model_reports_not_ready_and_fails_decisions(self):
        self.status = 503
        self.assertFalse(self.backend.health()["ready"])
        with self.assertRaises(server.ApiError) as caught:
            self.decide()
        self.assertEqual(caught.exception.status, 503)
        self.status = 200
        self.assertTrue(self.backend.health()["ready"])
        self.assertEqual(self.decide()["choice"], "2")

    def test_token_overflow_is_an_explicit_input_error(self):
        self.status = 400
        with self.assertRaises(server.ApiError) as caught:
            self.decide()
        self.assertEqual(caught.exception.status, 422)

    def test_timeouts_release_the_slot(self):
        with patch("urllib.request.urlopen", side_effect=TimeoutError()):
            with self.assertRaises(server.ApiError) as caught:
                self.decide()
            self.assertEqual(caught.exception.status, 504)

    def test_busy_requests_do_not_reach_the_native_queue(self):
        with server.inference_slot:
            with self.assertRaises(server.ApiError) as caught:
                self.decide()
            self.assertEqual(caught.exception.status, 429)
        self.assertEqual(self.received, [])


if __name__ == "__main__":
    unittest.main()
