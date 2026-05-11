# Specification: Approval Handoff Gate

**Track ID:** approval-handoff-gate_20260511
**Type:** Feature
**Created:** 2026-05-11
**Status:** Draft

## Summary

Forge currently applies a handoff transition inside `forge_approve` and immediately returns the next role packet. This makes approval behave like starting the next role, even though the human-in-the-loop model needs two distinct moments: the previous role output is accepted, then the next role reviews the accepted handoff and explicitly starts work.

This track adds an explicit post-approval handoff gate for non-terminal role transfers. `forge_approve` should persist the accepted handoff and move the run into a waiting-for-next-role state without returning an executable role packet. `forge_continue` becomes the explicit action that lets the next role inspect the handoff and begin work.

## Acceptance Criteria

- [x] `forge_approve` for `handoff`, `consultation_request`, and `consultation_response` transitions records approval and target role context, but does not return a role packet or MCP text that instructs immediate execution.
- [x] Approved non-terminal role transfers enter a distinct persisted run status that means the next role has not accepted/started work yet.
- [x] `forge_continue` from the new waiting state returns the target role packet and moves the run into `awaiting_role_output`.
- [x] Existing approval paths for `complete`, `blocked`, and approved `clarification_request` remain terminal or input-waiting as they are today.
- [x] `forge_status`, next allowed actions, and tracker labels clearly show the difference between waiting for human approval, waiting for next role acceptance, active role work, clarification, blocked, and complete.
- [x] MCP output and README documentation describe `forge_approve` as accepting the previous role output and preparing handoff, while `forge_continue` starts the next role packet.
- [x] Runtime, MCP, contract, and label tests cover the new state and prevent regression to immediate execution after approval.

## Dependencies

- Existing run-state schema in `contracts/run-state.schema.json`.
- Existing transition application logic in `runtime/forge-runner.mjs`.
- Existing tracker label mapping in `runtime/forge-board-labels.mjs`.
- Existing MCP formatting in `scripts/forge-mcp-server.mjs`.

## Out of Scope

- Changing the Runtime Step Output schema or role artifact contract.
- Adding a new MCP tool for explicit role acceptance; `forge_continue` is the planned start/accept action for this track.
- Changing role transition policy or allowed role graph.
- Changing git branch creation, scoped commit policy, or tracker provider support beyond labels/status text required by the new state.

## Technical Notes

- The current behavior is concentrated in `approveStep()` and `applyApprovedTransition()` in `runtime/forge-runner.mjs`; `approveStep()` currently builds and returns `rolePacket` when the resulting status is `awaiting_role_output`.
- `continueRun()` currently only returns a packet for `awaiting_role_output`; it should also handle the new waiting state by promoting it to active work and then building the packet.
- A new status such as `handoff_accepted` or `awaiting_role_acceptance` should be added to `contracts/run-state.schema.json`. Prefer a name that describes the receiver-side state, for example `awaiting_role_acceptance`.
- For label sync, a new status label may be needed, for example `forge:waiting-role`, unless the project chooses to reuse `forge:running`. A distinct label better satisfies the business need because active work and waiting for next-role acceptance are different board states.
- Existing tests assert immediate packet return from `forge_approve` in `tests/forge-runner.test.mjs`, `tests/mcp-server.test.mjs`, and `tests/task-source-mcp.test.mjs`; these are the main regression tests to rewrite.
