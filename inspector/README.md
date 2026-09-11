# HEIC to JPEG Phase 0 inspector

This diagnostic inspects local iPhone export bundles without converting, rewriting, or uploading them.

```powershell
npm.cmd run inspect:heic-samples -- samples
```

Results are written to `inspector-output/report.json` and `inspector-output/decision-table.json`. Extension matching is case-insensitive and recursive. GPS coordinates may appear in this local diagnostic output when present in image metadata; do not publish reports containing sample metadata.

`--synthetic` is reserved for smoke fixtures. Synthetic groups always produce `realSampleCount: 0`, no percentages, an empty decision table, and a blocked Phase 0 gate.

Phase 0 never proves an AAE is already represented in rendered pixels. It never labels transfer mode from an extension alone. Live Photo pairing is definitive only when embedded identifiers agree, and HDR is reported as present only from direct gain-map or transfer-function evidence. All other cases remain probable, unknown, or unsupported.

Human verification against Apple Photos remains mandatory before any evidence becomes a production handling rule.
