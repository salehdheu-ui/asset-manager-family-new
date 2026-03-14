import MobileLayout from "@/components/layout/MobileLayout";
import TrustLedgerItem from "@/components/ledger/TrustLedgerItem";
import { TRUST_LEDGER } from "@/lib/mock-data";
import { Search } from "lucide-react";

export default function Ledger() {
  return (
    <MobileLayout title="سجل الثقة">
      <div className="space-y-6 pt-2">
        <div className="bg-primary/5 p-4 rounded-xl border border-primary/10">
          <h3 className="text-primary font-bold mb-1">السجل الدائم</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            هذا السجل غير قابل للتعديل. يتم تسجيل جميع الإجراءات المالية والإدارية بشكل دائم لضمان الشفافية والثقة بين الأجيال.
          </p>
        </div>

        <div className="relative">
           <Search className="absolute right-3 top-3 w-4 h-4 text-muted-foreground" />
           <input 
             type="text" 
             placeholder="بحث في السجل..." 
             className="w-full bg-card border border-border rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
           />
        </div>

        <div className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
          {TRUST_LEDGER.map((entry) => (
            <TrustLedgerItem key={entry.id} entry={entry} />
          ))}
          {/* Mock More Items */}
          <TrustLedgerItem 
            entry={{
              id: 'L-1020',
              date: '2024-05-01 10:00',
              type: 'transaction',
              description: 'Zakat Calculation Saved',
              actor: 'System',
              hash: '0x1a...4f2'
            }} 
          />
           <TrustLedgerItem 
            entry={{
              id: 'L-1019',
              date: '2024-04-28 16:20',
              type: 'access',
              description: 'New Device Login Alert',
              actor: 'Ali Al-Saidi',
              hash: '0x9d...2b5'
            }} 
          />
        </div>
        
        <div className="text-center">
          <button className="text-xs text-muted-foreground hover:text-primary transition-colors">
            تحميل السجل الكامل (PDF)
          </button>
        </div>
      </div>
    </MobileLayout>
  );
}
