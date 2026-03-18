export interface FamilyMember {
  id: string;
  name: string;
  role: 'guardian' | 'custodian' | 'member';
  avatar: string;
  contributionStatus: 'paid' | 'pending';
  lastContribution?: string;
}

export interface FundLayer {
  id: string;
  name: string;
  arabicName: string;
  percentage: number;
  amount: number;
  description: string;
  color: string;
  locked: boolean;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'access' | 'change' | 'transaction' | 'alert' | 'expense' | 'zakat' | 'charity' | 'contribution';
  description: string;
  actor: string;
  amount?: number;
  hash: string;
}

export const CURRENT_USER: FamilyMember = {
  id: '1',
  name: 'أحمد السعيدي',
  role: 'guardian',
  avatar: 'AH',
  contributionStatus: 'pending',
};

export const FAMILY_MEMBERS: FamilyMember[] = [
  { id: '1', name: 'أحمد السعيدي', role: 'guardian', avatar: 'AH', contributionStatus: 'pending' },
];

export const FUND_LAYERS: FundLayer[] = [
  {
    id: 'protected',
    name: 'Protected Capital',
    arabicName: 'رأس المال المحمي',
    percentage: 50,
    amount: 0,
    description: 'أساس ثروة العائلة الذي لا يمس.',
    color: 'bg-primary',
    locked: true
  },
  {
    id: 'emergency',
    name: 'Emergency Reserve',
    arabicName: 'احتياطي الطوارئ',
    percentage: 20,
    amount: 0,
    description: 'للأزمات العائلية غير المتوقعة.',
    color: 'bg-amber-600',
    locked: true
  },
  {
    id: 'flexible',
    name: 'Flexible Capital',
    arabicName: 'رأس المال المرن',
    percentage: 20,
    amount: 0,
    description: 'للسلف والمصروفات والعمل الخيري.',
    color: 'bg-emerald-500',
    locked: false
  },
  {
    id: 'growth',
    name: 'Growth Capital',
    arabicName: 'رأس مال النمو',
    percentage: 10,
    amount: 0,
    description: 'مقفل حتى الوصول لخط الأمان.',
    color: 'bg-blue-600',
    locked: true
  }
];

export const TRUST_LEDGER: LedgerEntry[] = [];
