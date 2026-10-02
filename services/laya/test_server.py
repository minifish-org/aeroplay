"""API boundary tests; actual pinned-model probes are documented separately."""

import contextlib
import http.client
import json
import threading
import unittest
from unittest.mock import patch

import server


def payload():
    return {"game": "sky", "context": "The golden ring is in the left lane.",
            "question": {"type": "choice", "instructions": "Which lane contains the golden ring?",
                         "criteria": {"0": "left", "1": "middle", "2": "right"}}}


class FakeTorch:
    inference_mode = staticmethod(contextlib.nullcontext)


class FakeAgent:
    def __init__(self, choice="0", usage=None):
        self.choice = choice
        self.usage = usage or {}

    def system_one(self, context, questions, **kwargs):
        return {"usage": self.usage, "answers": {"action": {"choice": self.choice}}}


class BoundaryTests(unittest.TestCase):
    def test_rejects_unknown_game(self):
        request = payload()
        request["game"] = "unknown"
        with self.assertRaisesRegex(server.ApiError, "Unsupported game"):
            server.validate_payload(request)

    def test_bounds_context_and_choices(self):
        for context in (None, "", "x" * 6001):
            request = payload()
            request["context"] = context
            with self.subTest(context_type=type(context).__name__):
                with self.assertRaises(server.ApiError):
                    server.validate_payload(request)
        request = payload()
        request["question"]["criteria"] = {str(i): "option" for i in range(17)}
        with self.assertRaisesRegex(server.ApiError, "1 to 16"):
            server.validate_payload(request)
        request["question"]["criteria"] = {str(i): "option" for i in range(16)}
        server.validate_payload(request)

    def test_accepts_only_explicit_origins(self):
        with patch.dict(server.os.environ, {"LAYA_ALLOWED_ORIGINS": "https://*.example.com"}):
            with self.assertRaises(ValueError):
                server.allowed_origins()

    def test_returns_model_choice(self):
        with patch.object(server, "agent", FakeAgent("2")), patch.object(server, "torch", FakeTorch):
            result = server.decide(payload())
        self.assertEqual(result["choice"], "2")
        self.assertEqual(result["model"], server.MODEL)
        self.assertGreaterEqual(result["latency_ms"], 0)

    def test_truncation_and_invalid_choices_fail_without_fallback(self):
        for fake in (FakeAgent(usage={"truncated": True}),
                     FakeAgent(usage={"options": {"action": {"distinct": 2, "total": 3}}}),
                     FakeAgent("invalid")):
            with patch.object(server, "agent", fake), patch.object(server, "torch", FakeTorch):
                with self.subTest(usage=fake.usage, choice=fake.choice):
                    with self.assertRaises(server.ApiError):
                        server.decide(payload())
            self.assertFalse(server.inference_slot.locked())

    def test_busy_service_rejects_instead_of_queuing(self):
        with patch.object(server, "agent", FakeAgent()):
            with server.inference_slot:
                with self.assertRaises(server.ApiError) as caught:
                    server.decide(payload())
                self.assertEqual(caught.exception.status, 429)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = server.Server(("127.0.0.1", 0))
        cls.thread = threading.Thread(target=cls.service.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.service.shutdown()
        cls.service.server_close()
        cls.thread.join()

    def request(self, method, path, data=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.service.server_port, timeout=5)
        connection.request(method, path, body=data, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        result = response.status, dict(response.getheaders()), json.loads(body) if body else None
        connection.close()
        return result

    def test_health_remains_cheap_while_busy(self):
        with patch.object(server, "agent", FakeAgent()), server.inference_slot:
            status, headers, body = self.request("GET", "/health", headers={"Origin": "https://games.minifish.org"})
        self.assertEqual(status, 200)
        self.assertTrue(body["ready"])
        self.assertEqual(body["protocol"], server.PROTOCOL)
        self.assertEqual(headers["Access-Control-Allow-Origin"], "https://games.minifish.org")
        self.assertNotIn("Access-Control-Allow-Credentials", headers)

    def test_denies_unlisted_origin(self):
        status, headers, body = self.request("POST", "/decision", data=json.dumps(payload()),
                                            headers={"Origin": "https://untrusted.example", "Content-Type": "application/json"})
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        self.assertEqual(body["error"], "Origin is not allowed")

    def test_private_network_preflight(self):
        status, headers, body = self.request("OPTIONS", "/decision", headers={
            "Origin": "https://games.minifish.org", "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type", "Access-Control-Request-Private-Network": "true"})
        self.assertEqual(status, 204)
        self.assertEqual(headers["Access-Control-Allow-Private-Network"], "true")
        self.assertIsNone(body)

    def test_body_and_json_validation(self):
        cases = [("{}", {"Content-Type": "text/plain"}, 415),
                 ("{", {"Content-Type": "application/json"}, 400),
                 ("x" * 16385, {"Content-Type": "application/json"}, 413)]
        for data, headers, expected in cases:
            with self.subTest(expected=expected):
                status, _, body = self.request("POST", "/decision", data=data, headers=headers)
                self.assertEqual(status, expected)
                self.assertIn("error", body)

    def test_decision_http_contract(self):
        with patch.object(server, "agent", FakeAgent("1")), patch.object(server, "torch", FakeTorch):
            status, headers, body = self.request("POST", "/decision", data=json.dumps(payload()),
                                               headers={"Origin": "https://games.minifish.org", "Content-Type": "application/json"})
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"choice", "latency_ms", "model"})
        self.assertEqual(body["choice"], "1")
        self.assertEqual(headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
