# Fixture: Weather Map Feature

User task:

Make a weather forecast for the main cities of Russia. Show the current forecast as a visual element on a map. Show 10 days of weather history on the map. Store everything in my own database.

Expected runtime behavior:

The prompt is broad, cross-layer, and contains product decisions that can materially change data, integrations, storage, and UI scope. The runtime should not immediately invoke backend, frontend, UI, QA, and review roles together.

Expected role path:

1. `context-router` selects `business-analyst` as the first role because the task is product-shaped and under-specified.
2. `business-analyst` returns `needs_clarification` before implementation because blocking choices remain.

Blocking questions should include:

- Which cities count as "main cities of Russia"?
- Which weather provider or API should be used?
- Does "10 days of weather history" mean historical provider data or locally accumulated history after launch?
- Which database should store forecasts and history?
- How often should current forecast data be refreshed?

Expected contract:

Each role-to-role transfer must include a handoff object compatible with `contracts/handoff.schema.json`, wrapped in runtime output compatible with `contracts/step-output.schema.json`.
