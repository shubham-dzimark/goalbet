import { type OddsChangePreference, type User, type Wallet } from '@goalbet/db';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  locale: string;
  status: string;
  oddsChangePreference: OddsChangePreference;
  balanceBani: number;
  dateOfBirth: string;
  createdAt: string;
}

export function toUserDto(user: User, wallet: Pick<Wallet, 'balanceBani'> | null): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    locale: user.locale,
    status: user.status,
    oddsChangePreference: user.oddsChangePreference,
    balanceBani: wallet?.balanceBani ?? 0,
    dateOfBirth: user.dateOfBirth.toISOString().slice(0, 10),
    createdAt: user.createdAt.toISOString(),
  };
}
