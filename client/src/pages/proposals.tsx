import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MobileLayout from "@/components/layout/MobileLayout";
import { getProposals, createProposal, voteProposal, closeProposal, type ProposalRow } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Vote, Plus, ThumbsUp, ThumbsDown, CheckCircle2, XCircle, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { extractErrorMessage } from "@/lib/errors";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import StatusPill, { type StatusTone } from "@/components/ui/status-pill";
import Money from "@/components/ui/money";

const CATEGORY_LABELS: Record<string, string> = {
  allocation: "تغيير نسب التوزيع",
  expense: "مصروف كبير",
  investment: "قرار استثماري",
  general: "اقتراح عام",
};

const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: "قيد التصويت", tone: "pending" },
  approved: { label: "وافقت العائلة ✓", tone: "positive" },
  rejected: { label: "مرفوض", tone: "danger" },
  cancelled: { label: "ملغى", tone: "neutral" },
};

export default function Proposals() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const { data: proposals = [], isLoading } = useQuery({ queryKey: ["proposals"], queryFn: getProposals });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["proposals"] });
  const fail = (error: unknown, fallback: string) =>
    toast({ title: fallback, description: extractErrorMessage(error), variant: "destructive" });

  const addMutation = useMutation({
    mutationFn: () => createProposal({
      title: title.trim(),
      category,
      description: description.trim() || null,
      amount: amount.trim() || null,
    }),
    onSuccess: () => {
      refresh();
      setAddOpen(false);
      setTitle(""); setDescription(""); setAmount(""); setCategory("general");
      toast({ title: "طُرح الاقتراح على العائلة" });
    },
    onError: (e) => fail(e, "تعذر طرح الاقتراح"),
  });

  const voteMutation = useMutation({
    mutationFn: ({ id, vote }: { id: string; vote: "approve" | "reject" }) => voteProposal(id, vote),
    onSuccess: (result) => {
      refresh();
      toast({ title: result.passed ? "اكتمل النصاب — وافقت العائلة" : "سُجّل صوتك" });
    },
    onError: (e) => fail(e, "تعذر تسجيل التصويت"),
  });

  const closeMutation = useMutation({
    mutationFn: (id: string) => closeProposal(id, "rejected"),
    onSuccess: () => { refresh(); toast({ title: "أُغلق الاقتراح" }); },
    onError: (e) => fail(e, "تعذر إغلاق الاقتراح"),
  });

  if (isLoading) {
    return (
      <MobileLayout title="قرارات العائلة">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </MobileLayout>
    );
  }

  const open = proposals.filter((p) => p.status === "open");
  const closed = proposals.filter((p) => p.status !== "open");

  const card = (p: ProposalRow, idx: number) => {
    const status = STATUS[p.status] ?? STATUS.open;
    return (
      <motion.div
        key={p.id}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.05 }}
        className="bg-card border border-border rounded-[1.5rem] p-5 space-y-3 shadow-sm"
        data-testid={`card-proposal-${p.id}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h4 className="font-bold leading-tight">{p.title}</h4>
            <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-1.5">
              <span>{CATEGORY_LABELS[p.category] ?? p.category}</span>
              {p.amount && <><span>·</span><Money amount={p.amount} size="sm" /></>}
              {p.createdByName && <><span>·</span><span>طرحه {p.createdByName}</span></>}
            </p>
          </div>
          <StatusPill tone={status.tone} className="shrink-0">{status.label}</StatusPill>
        </div>

        {p.description && <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>}

        <div className="flex items-center gap-3 text-xs pt-2 border-t border-border/40">
          <span className="flex items-center gap-1 text-emerald-600 font-bold">
            <ThumbsUp className="w-3.5 h-3.5" /> {p.approve}
          </span>
          <span className="flex items-center gap-1 text-red-500 font-bold">
            <ThumbsDown className="w-3.5 h-3.5" /> {p.reject}
          </span>
          <span className="text-muted-foreground mr-auto">
            النصاب: {p.approve}/{p.required} من {p.eligible} مؤهلاً
          </span>
        </div>

        {p.voters.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.voters.map((v, i) => (
              <span key={i} className={cn(
                "text-xs px-2 py-0.5 rounded-full border",
                v.vote === "approve" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-700" : "bg-red-500/5 border-red-500/20 text-red-600",
              )}>
                {v.name} {v.vote === "approve" ? "✓" : "✗"}
              </span>
            ))}
          </div>
        )}

        {p.status === "open" && (
          <div className="flex gap-2">
            <button
              onClick={() => voteMutation.mutate({ id: p.id, vote: "approve" })}
              disabled={voteMutation.isPending}
              className={cn("tap-target", 
                "flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform",
                p.myVote === "approve" ? "bg-emerald-600 text-white" : "bg-emerald-500/10 text-emerald-700",
              )}
              data-testid={`button-approve-${p.id}`}
            >
              <ThumbsUp className="w-3.5 h-3.5" /> موافق
            </button>
            <button
              onClick={() => voteMutation.mutate({ id: p.id, vote: "reject" })}
              disabled={voteMutation.isPending}
              className={cn("tap-target", 
                "flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-transform",
                p.myVote === "reject" ? "bg-red-600 text-white" : "bg-red-500/10 text-red-600",
              )}
              data-testid={`button-reject-${p.id}`}
            >
              <ThumbsDown className="w-3.5 h-3.5" /> غير موافق
            </button>
            {isAdmin && (
              <button
                onClick={() => closeMutation.mutate(p.id)}
                className="px-3 bg-muted rounded-xl text-xs font-bold text-muted-foreground active:scale-95 transition-transform"
                data-testid={`button-close-${p.id}`}
              >
                إغلاق
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <MobileLayout title="قرارات العائلة">
      <div className="space-y-6 pt-2 pb-12">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-bold text-lg text-primary font-heading flex items-center gap-2">
            <Vote className="w-5 h-5" /> المطروح للتصويت
          </h3>
          {isAdmin && (
            <button
              onClick={() => setAddOpen(true)}
              className="tap-target flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform"
              data-testid="button-add-proposal"
            >
              <Plus className="w-4 h-4" /> اقتراح جديد
            </button>
          )}
        </div>

        <div className="grid gap-4">
          {open.length === 0 ? (
            <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border">
              <Clock className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-medium">لا اقتراحات مطروحة حالياً</p>
            </div>
          ) : (
            open.map(card)
          )}
        </div>

        {closed.length > 0 && (
          <>
            <h3 className="font-bold text-lg text-muted-foreground font-heading px-1 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> قرارات منتهية
            </h3>
            <div className="grid gap-4 opacity-90">{closed.map(card)}</div>
          </>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle>اقتراح جديد</DialogTitle>
            <DialogDescription>يمرّ بالنصاب نفسه المعتمد للسلف الكبيرة: 3 موافقين أو كل المؤهلين</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الاقتراح"
              className="w-full p-3 border rounded-xl bg-background text-sm" data-testid="input-proposal-title" />
            <select value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full p-3 border rounded-xl bg-background text-sm" data-testid="select-proposal-category">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              placeholder="تفاصيل الاقتراح (اختياري)"
              className="w-full p-3 border rounded-xl bg-background text-sm resize-none" />
            <input type="number" step="0.001" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="المبلغ إن وُجد (اختياري)"
              className="w-full p-3 border rounded-xl bg-background text-sm font-mono" />
            <button
              onClick={() => addMutation.mutate()}
              disabled={title.trim().length < 3 || addMutation.isPending}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold text-sm disabled:opacity-50"
              data-testid="button-save-proposal"
            >
              {addMutation.isPending ? "جاري الطرح..." : "طرح على العائلة"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </MobileLayout>
  );
}
