import { z } from "zod";
const paise = z
  .number()
  .int()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
  .refine((value) => !Object.is(value, -0));
const tags = z.string().refine((value) => {
  try {
    return z.array(z.string()).safeParse(JSON.parse(value)).success;
  } catch {
    return false;
  }
});
export const walletSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["cash", "bank", "upi"]),
  opening_balance_paise: paise,
  created_at: z.string(),
});
export const transactionSchema = z.strictObject({
  id: z.string(),
  wallet_id: z.string(),
  amount_paise: paise.min(1),
  direction: z.enum(["debit", "credit"]),
  event_type: z.enum(["normal", "refund", "reversal"]),
  category: z.string(),
  counterparty_name: z.string().nullable(),
  account_last4: z.string().nullable(),
  dedup_key: z.string().nullable(),
  note: z.string().nullable(),
  status: z.enum(["unverified", "ai_checked", "user_confirmed"]),
  source: z.string(),
  proposal_id: z.string().nullable(),
  benefit: z.string(),
  benefit_paise: paise.min(0),
  tag: z.string().nullable(),
  tags_json: tags,
  import_fingerprint: z.string().nullable(),
  split_owed_paise: paise.min(0),
  occurred_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const proposalSchema = z.strictObject({
  id: z.string(),
  wallet_id: z.string(),
  amount_paise: paise.min(1),
  direction: z.enum(["debit", "credit"]),
  event_type: z.enum(["normal", "refund", "reversal"]),
  category: z.string(),
  counterparty_name: z.string().nullable(),
  note: z.string().nullable(),
  source: z.string(),
  initial_tx_status: z.enum(["unverified", "ai_checked", "user_confirmed"]),
  status: z.enum(["pending", "approved", "rejected"]),
  committed_tx_id: z.string().nullable(),
  benefit: z.string(),
  benefit_paise: paise.min(0),
  tag: z.string().nullable(),
  tags_json: tags,
  split_owed_paise: paise.min(0),
  occurred_at: z.string(),
  created_at: z.string(),
});
function validSnapshot(schema: z.ZodType, text: string): boolean {
  try {
    return schema.safeParse(JSON.parse(text)).success;
  } catch {
    return false;
  }
}
export const auditSchema = z.strictObject({
  id: z.string(),
  action: z.string(),
  entity_type: z.literal("transaction"),
  entity_id: z.string(),
  before_state: z
    .string()
    .refine((text) => validSnapshot(transactionSchema, text))
    .nullable(),
  after_state: z
    .string()
    .refine((text) => validSnapshot(transactionSchema, text))
    .nullable(),
  related_proposal_before: z
    .string()
    .refine((text) => validSnapshot(proposalSchema, text))
    .nullable(),
  undone: z.literal([0, 1]),
  created_at: z.string(),
});
export const counterpartySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  placeholder: z.string(),
  created_at: z.string(),
});
export const settingSchema = z.strictObject({
  key: z.literal("send_notes_to_cloud"),
  value_json: z.enum(["true", "false"]),
});
export const payloadSchema = z.strictObject({
  tables: z.strictObject({
    wallets: z.array(walletSchema),
    counterparties: z.array(counterpartySchema),
    proposals: z.array(proposalSchema),
    transactions: z.array(transactionSchema),
    audit_log: z.array(auditSchema),
  }),
  settings: z.array(settingSchema),
});
export type BackupPayload = z.infer<typeof payloadSchema>;
