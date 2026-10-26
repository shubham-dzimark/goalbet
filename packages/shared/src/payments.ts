import type { PaymentMethod, PaymentRequestStatus, PaymentRequestType } from './enums.js';

/** A player's deposit / withdrawal request as the player sees it. */
export interface PaymentRequestDto {
  id: string;
  reference: string;
  type: PaymentRequestType;
  method: PaymentMethod;
  amountBani: number;
  status: PaymentRequestStatus;
  /** deposit: { payerReference? }; withdrawal: { iban (masked for display), accountHolder } */
  details: { payerReference?: string; iban?: string; accountHolder?: string };
  note: string | null;
  /** waiting for a second admin (amount above the approval threshold) */
  awaitingSecondApproval: boolean;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** What the wallet page needs to offer deposits and withdrawals. */
export interface PaymentInfoDto {
  balanceBani: number;
  heldBani: number;
  availableBani: number;
  methods: PaymentMethod[];
  limits: { minDepositBani: number; maxDepositBani: number; minWithdrawalBani: number; maxWithdrawalBani: number };
  bank: { beneficiary: string; iban: string; bankName: string };
  pendingWithdrawal: boolean;
  /** player may not deposit (self-excluded) */
  depositBlocked: boolean;
}

export interface AdminPaymentRequestRow extends PaymentRequestDto {
  /** full IBAN for Finance */
  details: { payerReference?: string; iban?: string; accountHolder?: string };
  user: { id: string; name: string; email: string; balanceBani: number; heldBani: number };
  firstApprovedBy: { id: string; email: string } | null;
  decidedBy: { id: string; email: string } | null;
}
