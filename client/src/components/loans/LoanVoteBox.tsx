import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Vote, ThumbsUp, ThumbsDown } from "lucide-react";
import { castLoanVote, getLoanVotes } from "@/lib/api";
import { extractErrorMessage } from "@/lib/errors";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// صندوق تصويت العائلة على السلف الكبيرة (فوق حد التصويت)
export default function LoanVoteBox({ loanId }: { loanId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: tally } = useQuery({
    queryKey: ["loan-votes", loanId],
    queryFn: () => getLoanVotes(loanId),
  });

  const voteMutation = useMutation({
    mutationFn: (vote: "approve" | "reject") => castLoanVote(loanId, vote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loan-votes", loanId] });
      toast({ title: "سُجّل صوتك" });
    },
    onError: (error) => {
      toast({ title: "تعذر التصويت", description: extractErrorMessage(error), variant: "destructive" });
    },
  });

  if (!tally) return null;

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 space-y-2" data-testid={`vote-box-${loanId}`}>
      <div className="flex items-center gap-2 text-violet-700">
        <Vote className="w-4 h-4" />
        <span className="text-[11px] font-bold">سلفة كبيرة — تتطلب تصويت العائلة</span>
        {tally.passed && (
          <span className="mr-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">اكتمل النصاب ✓</span>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] font-bold">
        <span className="text-emerald-700">موافقون: {tally.approve} / {tally.required} المطلوبين</span>
        <span className="text-red-600">رافضون: {tally.reject}</span>
      </div>
      <div className="h-1.5 rounded-full bg-violet-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(100, (tally.approve / Math.max(1, tally.required)) * 100)}%` }}
        />
      </div>
      {tally.canVote && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => voteMutation.mutate("approve")}
            disabled={voteMutation.isPending}
            className={cn(
              "flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
              tally.myVote === "approve" ? "bg-emerald-600 text-white" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
            )}
            data-testid={`button-vote-approve-${loanId}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> {tally.myVote === "approve" ? "صوتّ بالموافقة" : "أوافق"}
          </button>
          <button
            onClick={() => voteMutation.mutate("reject")}
            disabled={voteMutation.isPending}
            className={cn(
              "flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
              tally.myVote === "reject" ? "bg-red-600 text-white" : "bg-red-100 text-red-700 hover:bg-red-200",
            )}
            data-testid={`button-vote-reject-${loanId}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" /> {tally.myVote === "reject" ? "صوتّ بالرفض" : "أرفض"}
          </button>
        </div>
      )}
      {tally.voters && tally.voters.length > 0 && (
        <p className="text-[9px] text-muted-foreground pt-1">
          {tally.voters.map((v) => `${v.name} (${v.vote === "approve" ? "موافق" : "رافض"})`).join("، ")}
        </p>
      )}
    </div>
  );
}
