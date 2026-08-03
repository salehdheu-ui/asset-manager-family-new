import { useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAttachments, uploadAttachment, deleteAttachment, attachmentUrl } from "@/lib/api";
import { Paperclip, Upload, Trash2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { extractErrorMessage } from "@/lib/errors";

interface Props {
  entityType: "contribution" | "expense" | "loan_payment" | "investment";
  entityId: string;
  canDelete?: boolean;
  label?: string;
}

// صندوق مرفقات: إثبات تحويل مع المساهمة، فاتورة مع المصروف. المرفق محفوظ في قاعدة البيانات.
export default function AttachmentBox({ entityType, entityId, canDelete = false, label = "المرفقات" }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const queryKey = ["attachments", entityType, entityId];

  const { data: items = [] } = useQuery({
    queryKey,
    queryFn: () => getAttachments(entityType, entityId),
    enabled: !!entityId,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(entityType, entityId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "أُرفق المستند" });
    },
    onError: (error) => toast({ title: "تعذر رفع المرفق", description: extractErrorMessage(error), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "حُذف المرفق" });
    },
    onError: (error) => toast({ title: "تعذر حذف المرفق", description: extractErrorMessage(error), variant: "destructive" }),
  });

  return (
    <div className="space-y-2" data-testid={`attachments-${entityType}-${entityId}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
          <Paperclip className="w-3 h-3" /> {label}
        </span>
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploadMutation.isPending}
          className="tap-target px-2 text-xs font-bold text-primary flex items-center gap-1 disabled:opacity-50"
          data-testid="button-upload-attachment"
        >
          <Upload className="w-3 h-3" /> {uploadMutation.isPending ? "جاري الرفع..." : "إرفاق"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadMutation.mutate(file);
            e.target.value = "";
          }}
        />
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">لا مرفقات — الحد الأقصى 1 ميغابايت للملف (صورة أو PDF)</p>
      ) : (
        <div className="space-y-1">
          {items.map((a) => (
            <div key={a.id} className="flex items-center gap-2 bg-muted/40 rounded-lg px-2 py-1.5">
              <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <a
                href={attachmentUrl(a.id)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 text-xs font-medium truncate hover:text-primary"
                data-testid={`link-attachment-${a.id}`}
              >
                {a.fileName}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">{Math.round(a.sizeBytes / 1024)} ك.ب</span>
              {canDelete && (
                <button
                  onClick={() => deleteMutation.mutate(a.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  data-testid={`button-delete-attachment-${a.id}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
