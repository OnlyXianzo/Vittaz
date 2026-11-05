# Backend policy acceptance evidence

Date2026-11-05. Test-only S27e, no independent review or universal injection-
resistance certification. Runtime permissions, not model obedience, protect the
ledger. Actual native SQLite/read-only connection, shared service, LangChain/S21
and fake provider are used in packages/agent/src/policy_acceptance.test.ts.

| ID   | Requirement                                            | Executable evidence                                                                                                                                                                          |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PA01 | Notification injection cannot approve or expand access | Existing pending proposal plus malicious notification fools local model into a valid draft; all proposals stay pending, no ledger transaction, zero cloud requests.                          |
| PA02 | Imported instructions are data                         | Real core grid importer stores injected category/note; QA minimal projection removes note and maps arbitrary category to other. No user-supplied text becomes a system instruction.          |
| PA03 | Unknown/write tools rejected in read-only QA           | Fake model asks approve_proposal after query; request fails closed, ledger snapshot unchanged.                                                                                               |
| PA04 | Unpaired Telegram has no answer/storage/model effects  | Shared service rejects verified-host unpaired origin before history/store/models. Actual Telegram pairing adapter is still S28, not certified by this test.                                  |
| PA05 | Outbound minimal privacy                               | Captured requests contain no synthetic real-name marker, local-note marker, reference or account digits; person token remains. This does not prove anonymization of arbitrary unknown names. |
| PA06 | Same permissions across channels                       | App/CLI/paired Telegram receive identical five read-only tool specs; model attempts write on all sources leave ledger unchanged. Actual channel adapters follow later.                       |

The evidence-map regression initially failed because this report did not exist.
Functional adversarial conformance exercises already-implemented protections; no
fake production-behavior red is claimed. An initial imported-grid fixture used
arrays instead of the existing rowNumber/values/date1904 contract and was corrected,
not the importer. S31 separately disables six critical rules and must observe test
failure before restoring them. Phone/native/platform security and generic semantic
instruction detection remain outside this backend acceptance evidence.
