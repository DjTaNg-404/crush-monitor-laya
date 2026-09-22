"""Select complete messages using the actual tokenizer; required evidence is never dropped."""
from runtime import CapacityError


def select_context(runtime, messages, required_ids, questions, evidence):
    by_id = {m["id"]: m for m in messages}
    required = set(required_ids)
    if len(by_id) != len(messages) or not required <= by_id.keys():
        raise ValueError("Invalid message IDs or required evidence")

    def prepare(ids):
        selected = [m for m in messages if m["id"] in ids]
        state = "\n".join((f'{m["id"]} ' if evidence else "") + f'{m["sender"]}: {m["text"]}' for m in selected)
        qs = dict(questions)
        for key, definition in evidence.items():
            candidates = [m for m in selected if int(m["id"]) > definition["after"]][-24:]
            # Always provide two options; "none" is the sole valid answer if no later text exists.
            criteria = {"none": "no direct evidence", **{m["id"]: f'message {m["id"]}' for m in candidates}}
            if len(criteria) == 1:
                criteria["unavailable"] = "no later message exists"
            qs[key] = {"type": "choice", "instructions": definition["instructions"], "criteria": criteria}
        return selected, state, qs

    chosen = set(required)
    selected, state, qs = prepare(chosen)
    audit = runtime.inspect(state, qs)
    if not audit["fits"]:
        raise CapacityError(audit)
    # Retain a contiguous recent window in addition to required historical evidence.
    for message in reversed(messages):
        if message["id"] in chosen:
            continue
        proposal = chosen | {message["id"]}
        candidate, candidate_state, candidate_qs = prepare(proposal)
        if not runtime.inspect(candidate_state, candidate_qs)["fits"]:
            break
        chosen, selected, state, qs = proposal, candidate, candidate_state, candidate_qs
    return state, qs, [m["id"] for m in selected]


def predict_context(runtime, body):
    state, questions, used = select_context(runtime, body["messages"], body["requiredIds"], body["questions"], body["evidence"])
    return {**runtime.predict(state, questions), "usedMessageIds": used,
            "omittedCount": len(body["messages"]) - len(used)}
