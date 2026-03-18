import { motion } from "framer-motion";
import { Shield, Users, Wallet, Lock, ArrowLeft, Eye, EyeOff, User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import pattern from "@assets/generated_images/subtle_islamic_geometric_pattern_background_texture.png";
import logo from "@assets/generated_images/minimalist_family_fund_logo_symbol.png";

export default function Auth() {
  const { user, isLoading, login, isLoggingIn, loginError } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [isLoading, user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!username.trim() || !password.trim()) {
      setError("يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }

    try {
      await login({ username: username.trim(), password });
      setLocation("/dashboard");
    } catch (err: any) {
      setError(err.message || "فشل تسجيل الدخول");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const features = [
    { icon: Shield, title: "حماية رأس المال", desc: "نظام 50/20/20/10 للتوزيع الآمن" },
    { icon: Users, title: "إدارة العائلة", desc: "متابعة مساهمات كل فرد" },
    { icon: Wallet, title: "الزكاة والمبرات", desc: "توثيق شفاف للإنفاق" },
    { icon: Lock, title: "سجل الثقة", desc: "تاريخ لا يمكن تغييره" },
  ];

  return (
    <div 
      className="min-h-screen flex flex-col justify-between relative overflow-hidden" 
      dir="rtl"
      style={{ 
        backgroundImage: `url(${pattern})`,
        backgroundSize: '200px',
        backgroundRepeat: 'repeat'
      }}
    >
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/90 to-background/95 z-0" />

      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Header */}
        <header className="p-6 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center p-2 border border-primary/20 shadow-lg">
              <img src={logo} alt="Family Fund OS" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-primary font-heading">صندوق العائلة</h1>
              <p className="text-sm text-muted-foreground font-medium mt-1">نظام إدارة الثروة العائلية</p>
            </div>
          </motion.div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-6 py-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-md mx-auto space-y-6"
          >
            {/* Features Grid */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, idx) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, delay: 0.3 + idx * 0.1 }}
                  className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-4 text-center hover:shadow-md transition-shadow"
                >
                  <div className="w-10 h-10 mx-auto rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2">
                    <feature.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">{feature.title}</h3>
                  <p className="text-[10px] text-muted-foreground mt-1">{feature.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Login Form */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-6 space-y-4"
            >
              <h2 className="text-xl font-bold text-center text-foreground">تسجيل الدخول</h2>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                {(error || loginError) && (
                  <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm p-3 rounded-xl text-center" data-testid="error-message">
                    {error || loginError}
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">اسم المستخدم</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="أدخل اسم المستخدم"
                      data-testid="input-username"
                    />
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">كلمة المرور</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="أدخل كلمة المرور"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full bg-primary text-primary-foreground py-4 rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="button-login"
                >
                  {isLoggingIn ? (
                    <div className="animate-spin w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <span>دخول</span>
                      <ArrowLeft className="w-5 h-5" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="p-6 text-center">
          <p className="text-[10px] text-muted-foreground">
            صُمم للعائلات العُمانية - {new Date().getFullYear()}
          </p>
        </footer>
      </div>
    </div>
  );
}
