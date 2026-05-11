# Revision And Consultation Example

This example shows two runtime behaviors that are not permanent handoffs.

## Human Revision Request

After `forge_submit_step`, the runtime pauses in `awaiting_approval`. A human can reject the pending output:

```json
{
  "run_id": "20260509193000-abc123",
  "step_index": 2,
  "action": "changes_requested",
  "instructions": "Keep the acceptance criteria observable and remove implementation details.",
  "created_at": "2026-05-09T19:30:00.000Z"
}
```

Forge stores this as a `revision-request` artifact and keeps the same active role for the next packet.

## Role Consultation

A role may ask another role for input without giving up ownership:

```json
{
  "role": "business-analyst",
  "status": "handoff_ready",
  "artifact_type": "requirements",
  "artifact": "Clarify whether the proposed filter affects backend contracts before finalizing requirements.",
  "transition": {
    "type": "consultation_request",
    "target_role": "solution-architect"
  },
  "handoff": {
    "source_role": "business-analyst",
    "target_role": "solution-architect",
    "goal": "Confirm whether status filtering requires backend contract changes.",
    "scope": "Architecture consultation only; ownership returns to business-analyst.",
    "confirmed": [
      "The requested feature is status filtering."
    ],
    "decisions": [],
    "assumptions": [],
    "open_questions": [
      "Can the existing API already filter by status?"
    ],
    "risks": [
      "Requirements may be wrong if the backend contract cannot support the filter."
    ],
    "artifacts": [],
    "next_action": "Answer whether API/data contract changes are required, then return consultation_response to business-analyst."
  }
}
```

The consulted role returns with `transition.type = "consultation_response"` and `target_role` equal to the role on top of the runtime role stack.
