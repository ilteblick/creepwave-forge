# Fullstack Feature Handoff Example

```json
{
  "source_role": "solution-architect",
  "target_role": "backend-engineer",
  "goal": "Add a status filter to the orders list.",
  "scope": "Backend API support for filtering orders by status.",
  "confirmed": [
    "The orders list already exists.",
    "The frontend needs status filtering without changing pagination behavior."
  ],
  "decisions": [
    "Use the existing orders list endpoint instead of adding a new endpoint.",
    "Preserve existing sort and pagination query parameters."
  ],
  "assumptions": [
    "Order status values are already represented in the backend domain model."
  ],
  "open_questions": [
    "Confirm the complete list of status values from the project adapter or code."
  ],
  "risks": [
    "Filtering must not bypass ownership or permission constraints.",
    "The query may need an index if the orders table is large."
  ],
  "artifacts": [
    {
      "name": "Technical Design",
      "type": "technical-design",
      "summary": "Extend the existing orders API with a status query parameter and preserve compatibility."
    }
  ],
  "next_action": "Update the orders API and backend tests for valid, invalid, and permission-restricted status filters."
}
```
