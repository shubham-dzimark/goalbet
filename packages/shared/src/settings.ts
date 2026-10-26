/** Admin-editable platform settings (F3.5) stored in the Setting key/value table. */
export const SETTING_DEFAULTS = {
  'betting.minStakeBani': 100,
  'betting.maxStakeBani': 1_000_000,
  'betting.maxPayoutBani': 50_000_000,
  'betting.maxAccaLegs': 20,
  'betting.liveDelayMs': 5_000,
  'cashout.marginBps': 500,
  'cashout.enabled': true,
  'builder.factorBps': 8_500,
  'wallet.approvalThresholdBani': 500_000,
  'wallet.minDepositBani': 1_000,
  'wallet.maxDepositBani': 2_000_000,
  'wallet.minWithdrawalBani': 2_000,
  'wallet.maxWithdrawalBani': 2_000_000,
  'payments.bankTransferEnabled': true,
  'payments.cashAtShopEnabled': true,
  'feed.stallSeconds': 30,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K] extends boolean ? boolean : number;
export type Settings = { [K in SettingKey]: SettingValue<K> };
export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];
