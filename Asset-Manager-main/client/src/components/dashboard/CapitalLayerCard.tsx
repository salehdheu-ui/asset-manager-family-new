import { cn } from "@/lib/utils";
import { Lock, Unlock } from "lucide-react";
import { motion } from "framer-motion";

interface LayerData {
  id: string;
  name: string;
  arabicName: string;
  percentage: number;
  amount: number;
  color: string;
  locked: boolean;
  used?: number;
  available?: number;
}

interface CapitalLayerCardProps {
  layer: LayerData;
  delay?: number;
}

export default function CapitalLayerCard({ layer, delay = 0 }: CapitalLayerCardProps) {
  const hasUsage = (layer.id === "flexible" || layer.id === "emergency") && layer.amount > 0;
  const usedPercent = hasUsage && layer.amount > 0 ? Math.min(100, ((layer.used || 0) / layer.amount) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay: delay * 0.1 }}
      data-testid={`card-layer-${layer.id}`}
      className="relative overflow-hidden rounded-2xl bg-card border border-border/50 shadow-sm p-4 flex flex-col justify-between aspect-square hover:shadow-md transition-shadow group"
    >
      <div className={cn("absolute top-0 right-0 w-full h-1 opacity-80", layer.color)} />
      
      <div className="flex justify-between items-start">
        <div className={cn(
          "p-2 rounded-xl bg-muted/30", 
          layer.locked ? "text-muted-foreground" : "text-primary"
        )}>
          {layer.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
        </div>
        <div className="text-right">
          <h3 className="text-sm font-bold text-foreground font-heading">{layer.arabicName}</h3>
          <p className="text-[10px] text-muted-foreground font-sans opacity-70">{layer.name}</p>
        </div>
      </div>

      <div className="mt-auto space-y-2">
        <div className="text-2xl font-bold font-mono tracking-tighter text-primary">
          {layer.amount.toLocaleString()} <span className="text-xs font-sans font-normal text-muted-foreground">ر.ع</span>
        </div>
        
        <div className="space-y-1.5">
          <div className="w-full bg-muted/50 h-1.5 rounded-full overflow-hidden">
            {hasUsage ? (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${usedPercent}%` }}
                transition={{ duration: 1, delay: 0.5 + (delay * 0.1) }}
                className="h-full rounded-full bg-red-400/70"
              />
            ) : (
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${layer.percentage}%` }}
                transition={{ duration: 1, delay: 0.5 + (delay * 0.1) }}
                className={cn("h-full rounded-full opacity-90", layer.color)} 
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
            <span>{layer.percentage}%</span>
            {hasUsage ? (
              <span data-testid={`text-available-${layer.id}`} className="text-emerald-600">
                متاح: {(layer.available || 0).toLocaleString()}
              </span>
            ) : (
              <span>{layer.locked ? "مقفل" : "نشط"}</span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
