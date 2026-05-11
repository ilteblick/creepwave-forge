# Fullstack Feature Example

This example shows the handoff shape after `context-router` routes a product feature to `business-analyst`, and BA prepares requirements for architecture.

```json
{
  "role": "business-analyst",
  "status": "handoff_ready",
  "artifact_type": "requirements",
  "artifact": "Requirements Draft\n\nGoal: Add a status filter to the orders list.\n\nAcceptance Criteria:\n- Given an admin views orders, when they select a status, then the list shows matching orders.\n- Given an invalid status is requested, then the user sees a validation error.",
  "transition": {
    "type": "handoff",
    "target_role": "solution-architect"
  },
  "handoff": {
    "source_role": "business-analyst",
    "target_role": "solution-architect",
    "goal": "Add a status filter to the orders list.",
    "scope": "Requirements and business rules for order status filtering.",
    "confirmed": [
      "The user wants status filtering on an existing orders list.",
      "Filtering should preserve existing pagination behavior."
    ],
    "decisions": [
      "Use the existing orders list surface."
    ],
    "assumptions": [
      "The project already has order status values in its domain model."
    ],
    "open_questions": [
      "Confirm the complete list of allowed status values from project context or code."
    ],
    "risks": [
      "Filtering must preserve ownership and permission constraints."
    ],
    "artifacts": [
      {
        "name": "Business requirements",
        "type": "requirements",
        "summary": "Requirements and acceptance criteria for order status filtering."
      }
    ],
    "next_action": "Design API/data/UI contract changes for adding the status filter."
  }
}
```
