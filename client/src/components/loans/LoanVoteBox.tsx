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
    <div className="rounded-2xl border border-secondary/20 bg-secondary/5 p-3 space-y-2" data-testid={`vote-box-${loanId}`}>
      <div className="flex items-center gap-2 text-primary">
        <Vote className="w-4 h-4" />
        <span className="text-xs font-bold">سلفة كبيرة — تتطلب تصويت العائلة</span>
        {tally.passed && (
          <span className="mr-auto rounded-full bg-fund-in/14 px-2 py-0.5 text-xs font-bold text-fund-in">اكتمل النصاب ✓</span>
        )}
      </div>
      <div className="flex items-center justify-between text-xs font-bold">
        <span className="text-fund-in">موافقون: {tally.approve} / {tally.required} المطلوبين</span>
        <span className="text-fund-due">رافضون: {tally.reject}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-fund-in transition-all"
          style={{ width: `${Math.min(100, (tally.approve / Math.max(1, tally.required)) * 100)}%` }}
        />
      </div>
      {tally.canVote && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => voteMutation.mutate("approve")}
            disabled={voteMutation.isPending}
            className={cn("tap-target", 
              "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
              tally.myVote === "approve" ? "bg-fund-in text-white" : "bg-fund-in/14 text-fund-in hover:bg-fund-in/20",
            )}
            data-testid={`button-vote-approve-${loanId}`}
          >
            <ThumbsUp className="w-3.5 h-3.5" /> {tally.myVote === "approve" ? "صوتّ بالموافقة" : "أوافق"}
          </button>
          <button
            onClick={() => voteMutation.mutate("reject")}
            disabled={voteMutation.isPending}
            className={cn("tap-target", 
              "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50",
              tally.myVote === "reject" ? "bg-fund-due text-white" : "bg-fund-due/14 text-fund-due hover:bg-fund-due/20",
            )}
            data-testid={`button-vote-reject-${loanId}`}
          >
            <ThumbsDown className="w-3.5 h-3.5" /> {tally.myVote === "reject" ? "صوتّ بالرفض" : "أرفض"}
          </button>
        </div>
      )}
      {tally.voters && tally.voters.length > 0 && (
        <p className="text-xs text-muted-foreground pt-1">
          {tally.voters.map((v) => `${v.name} (${v.vote === "approve" ? "موافق" : "رافض"})`).join("، ")}
        </p>
      )}
    </div>
  );
}
