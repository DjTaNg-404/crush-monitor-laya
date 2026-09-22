import unittest
from fastapi.testclient import TestClient
from runtime import CapacityError
from serve import create_app


class FakeRuntime:
    identity = {"backend": "test"}
    calls = 0
    def predict(self, state, questions):
        self.calls += 1
        if state == "too-long":
            raise CapacityError({"fits": False, "questions": {}})
        return {"answers": {}, "state": state}
    def inspect(self, state, questions):
        return {"fits": True}


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.runtime = FakeRuntime()
        self.client = TestClient(create_app(self.runtime))
        self.body = {"state": "hello", "questions": {"q": {"type": "noul", "instructions": "Is this a greeting?"}}}

    def test_browser_cannot_bypass_express(self):
        response = self.client.post("/v1/systemone", json=self.body, headers={"Origin": "https://example.com"})
        self.assertEqual(response.status_code, 403)
        self.assertEqual(self.runtime.calls, 0)

    def test_invalid_question_is_rejected_before_inference(self):
        self.body["questions"]["q"] = {"type": "choice", "instructions": "Pick", "criteria": {"only": "one"}}
        self.assertEqual(self.client.post("/v1/systemone", json=self.body).status_code, 422)
        self.assertEqual(self.runtime.calls, 0)

    def test_capacity_failure_remains_visible(self):
        self.body["state"] = "too-long"
        response = self.client.post("/v1/systemone", json=self.body)
        self.assertEqual(response.status_code, 422)
        self.assertFalse(response.json()["audit"]["fits"])

    def test_valid_request_and_health(self):
        response = self.client.post("/v1/systemone", json=self.body)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertTrue(self.client.get("/health").json()["ready"])

    def test_oversized_request_is_not_inferred(self):
        response = self.client.post("/v1/systemone", content=b" " * (512 * 1024 + 1))
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.runtime.calls, 0)


if __name__ == "__main__":
    unittest.main()
