"""Fast no-weight checks for invariants which would invalidate effect measurements."""
import unittest
from runtime import inspect_input, validate_answers


class CharTokenizer:
    mask_token = "[MASK]"
    def __call__(self, text, **kwargs):
        return {"input_ids": list(range(len(text)))}


class CapacityTests(unittest.TestCase):
    def audit(self, state, instruction="short", options=("a", "b"), max_len=100, head=64):
        return inspect_input(CharTokenizer(), state,
            {"q": {"type": "choice", "instructions": instruction}}, max_len, head,
            lambda q: {"t": q["type"], "ins": q["instructions"]}, lambda q: list(options))

    def test_short_fits(self):
        self.assertTrue(self.audit("hello")["fits"])

    def test_long_state_is_rejected_not_silently_truncated(self):
        self.assertFalse(self.audit("x" * 200)["fits"])

    def test_instruction_and_option_truncation_are_also_rejected(self):
        self.assertFalse(self.audit("hi", instruction="x" * 100)["fits"])
        self.assertFalse(self.audit("hi", options=("x" * 49, "b"))["fits"])
        self.assertFalse(self.audit("hi", options=tuple("x" * 8 for _ in range(20)))["fits"])

    def test_invalid_distribution_is_not_accepted(self):
        q = {"q": {"type": "choice", "criteria": {"a": "A", "b": "B"}}}
        answer = {"answers": {"q": {"type": "choice", "choice": "a", "confidence": .5, "probabilities": {"a": .5, "b": .5}}}}
        validate_answers(q, answer)
        answer["answers"]["q"]["probabilities"] = {"a": 1.0}
        with self.assertRaises(ValueError):
            validate_answers(q, answer)


if __name__ == "__main__":
    unittest.main()
