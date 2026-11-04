# Contributing

Thank you for your interest in Vittaz. The project is at an early stage, and its priorities are correctness, privacy, and a dependable offline experience.

## Before contributing

- Read the [product overview](PRODUCT.md) to understand the intended scope.
- Read the [architecture](ARCHITECTURE.md) before changing package boundaries or persistence.
- Read the [privacy guidelines](PRIVACY.md) before touching AI, notifications, logs, or external integrations.
- For substantial changes, open an issue or discussion first so the intended behaviour can be agreed upon.

## Development principles

- Prefer small, focused changes.
- Write tests for financial rules and edge cases before or alongside implementation.
- Keep monetary calculations in integer paise.
- Keep domain logic independent of UI, storage drivers, and AI frameworks.
- Use asynchronous repository interfaces.
- Validate all external input at boundaries.
- Use parameterized database queries.
- Keep AI tools least-privileged; AI must not approve or commit transactions.
- Do not log private financial content or secrets.
- Name AI tools in `snake_case`.
- Read the current official documentation before using a library, and record its version.
- Work test-first and in small steps.
- Keep connectors independent of the financial core.
- Use synthetic data in tests, screenshots, examples, and documentation.

## Testing expectations

Changes should include appropriate tests for:

- Normal behaviour.
- Invalid and boundary input.
- Duplicate operations and idempotency.
- Failure and recovery paths.
- Data migration and persistence where relevant.
- Privacy and permission boundaries where relevant.

Financial changes should test transfers, repayments, refunds, reversals, and rounding behaviour where applicable.

## Documentation

Update user-facing documentation when product behaviour changes. Keep architectural explanations aligned with the implementation. Do not document an unimplemented capability as if it were available.

## License and contributions

The project license has not yet been selected. Contribution and reuse terms must be clarified before the project begins accepting external contributions under a stated open-source license.
