import { useState } from "react";
import { KeyRound, ArrowRight, CheckCircle2 } from "lucide-react";
import { forgotPassword, resetPassword } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUsername?: string;
}

type Step = "request" | "reset" | "done";

export default function ForgotPasswordDialog({ open, onOpenChange, initialUsername = "" }: Props) {
  const [step, setStep] = useState<Step>("request");
  const [username, setUsername] = useState(initialUsername);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const reset = () => {
    setStep("request");
    setCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setInfo("");
  };

  const handleRequest = async () => {
    setError("");
    if (!username.trim()) {
      setError("يرجى إدخال اسم المستخدم");
      return;
    }
    setBusy(true);
    try {
      const res = await forgotPassword(username.trim());
      setInfo(res.message);
      setStep("reset");
    } catch (err: any) {
      setError(err.message || "تعذر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setError("");
    if (!code.trim()) {
      setError("أدخل الكود الذي أرسله لك الوصي");
      return;
    }
    if (newPassword.length < 8) {
      setError("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ username: username.trim(), code: code.trim(), newPassword });
      setStep("done");
    } catch (err: any) {
      setError(err.message || "تعذر استعادة كلمة المرور");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            استعادة كلمة المرور
          </DialogTitle>
          <DialogDescription>
            {step === "request" && "أدخل اسم المستخدم، وسيصلك الوصي بكود استعادة مؤقت لإعادة تعيين كلمة مرورك."}
            {step === "reset" && "أدخل الكود الذي أرسله لك الوصي وكلمة المرور الجديدة."}
            {step === "done" && "تمت استعادة كلمة المرور."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-xl text-center" data-testid="forgot-error">
            {error}
          </div>
        )}

        {step === "request" && (
          <div className="space-y-3 py-2">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="اسم المستخدم"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="forgot-username"
            />
            <button
              onClick={handleRequest}
              disabled={busy}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              data-testid="button-forgot-request"
            >
              {busy ? "جارٍ الإرسال..." : "إرسال طلب الاستعادة"}
              {!busy && <ArrowRight className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setStep("reset")}
              className="w-full text-xs text-muted-foreground hover:text-primary"
            >
              لديّ كود بالفعل — أدخله مباشرة
            </button>
          </div>
        )}

        {step === "reset" && (
          <div className="space-y-3 py-2">
            {info && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">{info}</p>}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="اسم المستخدم"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="reset-username"
            />
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="كود الاستعادة (6 أرقام)"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 tracking-widest text-center font-mono"
              data-testid="reset-code"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="كلمة المرور الجديدة"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="reset-new-password"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="تأكيد كلمة المرور الجديدة"
              className="w-full bg-background border border-border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/40"
              data-testid="reset-confirm-password"
            />
            <button
              onClick={handleReset}
              disabled={busy}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold disabled:opacity-50"
              data-testid="button-reset-submit"
            >
              {busy ? "جارٍ الحفظ..." : "تعيين كلمة المرور الجديدة"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="py-4 text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-sm font-bold">تم تعيين كلمة المرور الجديدة بنجاح</p>
            <button
              onClick={() => onOpenChange(false)}
              className="w-full bg-primary text-primary-foreground py-3 rounded-xl font-bold"
              data-testid="button-forgot-close"
            >
              العودة لتسجيل الدخول
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
