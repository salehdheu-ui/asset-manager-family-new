import { LedgerEntry } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { ShieldAlert, RefreshCcw, KeyRound, WalletCards } from "lucide-react";

interface TrustLedgerItemProps {
  entry: LedgerEntry;
}

export default function TrustLedgerItem({ entry }: TrustLedgerItemProps) {
  const getIcon = () => {
    switch (entry.type) {
      case 'access': return KeyRound;
      case 'alert': return ShieldAlert;
      case 'change': return RefreshCcw;
      case 'transaction': return WalletCards;
      default: return ShieldAlert;
    }
  };

  const Icon = getIcon();

  return (
    <div className="flex gap-4 p-4 border-b border-border/40 last:border-0 hover:bg-muted/5 transition-colors">
      <div className="mt-1">
        <div className="w-10 h-10 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center text-primary">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex-1 space-y-1">
        <div className="flex justify-between items-start">
          <h4 className="font-semibold text-sm text-foreground">{entry.description}</h4>
          <span className="text-[10px] font-mono text-muted-foreground bg-muted/30 px-2 py-0.5 rounded">
            {entry.date}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">بواسطة: {entry.actor}</p>
        <div className="flex items-center gap-2 mt-2">
           <span className="text-[9px] font-mono text-primary/40 uppercase tracking-widest border border-primary/10 px-1.5 rounded-sm">
             HASH: {entry.hash}
           </span>
           {entry.amount && (
             <span className="text-xs font-bold text-emerald-600">
               +{entry.amount} ر.ع
             </span>
           )}
        </div>
      </div>
    </div>
  );
}
