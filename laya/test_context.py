import unittest
from context import select_context
from runtime import CapacityError


class BudgetRuntime:
    def __init__(self, limit=75):
        self.limit = limit

    def inspect(self, state, questions):
        return {"fits": len(state) <= self.limit}


class ContextTests(unittest.TestCase):
    def setUp(self):
        self.messages = [{"id": str(i), "sender": "other", "text": f"full message {i}"} for i in range(8)]

    def test_required_old_boundary_and_latest_survive_and_messages_stay_complete(self):
        state, _, ids = select_context(BudgetRuntime(), self.messages, ["0", "7"], {}, {})
        self.assertEqual(ids, ["0", "6", "7"])
        self.assertIn("full message 0", state)
        self.assertNotIn("message 5", state)

    def test_required_evidence_too_large_fails_instead_of_truncating(self):
        with self.assertRaises(CapacityError):
            select_context(BudgetRuntime(5), self.messages, ["0", "7"], {}, {})

    def test_evidence_candidates_only_reference_visible_later_messages(self):
        _, questions, ids = select_context(BudgetRuntime(), self.messages, ["0", "7"], {}, {"proof": {"instructions": "Evidence?", "after": 5}})
        choices = questions["proof"]["criteria"]
        self.assertEqual(set(choices), {"none", "6", "7"})
        self.assertTrue(set(choices) - {"none"} <= set(ids))

    def test_no_later_message_does_not_invent_evidence(self):
        _, questions, _ = select_context(BudgetRuntime(), self.messages, ["7"], {}, {"proof": {"instructions": "Evidence?", "after": 7}})
        self.assertEqual(set(questions["proof"]["criteria"]), {"none", "unavailable"})

    def test_missing_required_id_is_rejected(self):
        with self.assertRaises(ValueError):
            select_context(BudgetRuntime(), self.messages, ["missing"], {}, {})


if __name__ == "__main__":
    unittest.main()
