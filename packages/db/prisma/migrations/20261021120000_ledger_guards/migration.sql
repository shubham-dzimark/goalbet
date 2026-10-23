-- Ledger safety nets enforced by the database itself (rules 2 and 6).

-- A wallet can never go negative.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_non_negative" CHECK ("balanceBani" >= 0);

-- Stakes are positive; payouts/cash-outs are never negative.
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_stake_positive" CHECK ("stakeBani" > 0);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_payout_non_negative" CHECK ("payoutBani" IS NULL OR "payoutBani" >= 0);
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_cashout_non_negative" CHECK ("cashedOutBani" IS NULL OR "cashedOutBani" >= 0);
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_amount_non_zero" CHECK ("amountBani" <> 0);
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_reason_present" CHECK (length(trim("reason")) > 0);

-- Ledger and audit log are append-only. (TRUNCATE is still allowed for test resets.)
CREATE OR REPLACE FUNCTION goalbet_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "WalletTransaction_append_only"
  BEFORE UPDATE OR DELETE ON "WalletTransaction"
  FOR EACH ROW EXECUTE FUNCTION goalbet_append_only();

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION goalbet_append_only();
