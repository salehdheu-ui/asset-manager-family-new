import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Menu, X, ChevronLeft, LogOut, Info } from "lucide-react";
import pattern from "@assets/generated_images/subtle_islamic_geometric_pattern_background_texture.png";
import logo from "@assets/generated_images/minimalist_family_fund_logo_symbol.png";
import { useAuth } from "@/hooks/use-auth";
import { visibleSections, sectionOf } from "./sections";
import { motion, AnimatePresence } from "framer-motion";

interface MobileLayoutProps {
  children: React.ReactNode;
  title?: string;
  showBack?: boolean;
}

export default function MobileLayout({ children, title }: MobileLayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const familyName = localStorage.getItem("familyName") || "صندوق العائلة";
  const { user, logout } = useAuth();

  const isAdmin = user?.role === 'admin';

  const sections = visibleSections(isAdmin);
  const activeSection = sectionOf(location, isAdmin);
  const sectionTabs = activeSection?.tabs ?? [];
  const activeTab = sectionTabs.find((t) => t.href === location);

  const bottomNavItems = sections.slice(0, 5);
  const activeLabel = title || activeTab?.label || activeSection?.label || familyName;
  const activeDesc = activeSection?.desc || "واجهة متابعة مبسطة ومهيأة للجوال";

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col mx-auto max-w-md shadow-[0_20px_60px_rgba(16,24,40,0.08)] lg:max-w-none lg:flex-row lg:bg-canvas lg:shadow-none">
      {/* Background Texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none z-0"
        style={{ backgroundImage: `url(${pattern})`, backgroundSize: '300px' }}
      />


      {/* شريط جانبي ثابت للشاشات الكبيرة — تخطيط الجوال لم يتغير */}
      <aside className="relative z-20 hidden lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:flex-col lg:sticky lg:top-0 lg:border-l lg:border-border/80 lg:bg-card/70 lg:backdrop-blur-sm lg:p-5">
        <div className="flex items-center gap-2 mb-8 px-1">
          <div className="w-9 h-9 rounded-xl bg-primary/14 flex items-center justify-center">
            <img src={logo} alt="" className="w-5 h-5 opacity-80" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary/60">صندوق العائلة</p>
            <p className="font-bold text-primary font-heading leading-tight">{familyName}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-hide">
          {sections.map((item) => (
            <div key={item.key}>
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all border",
                  activeSection?.key === item.key
                    ? "bg-primary/10 border-primary/30 text-primary shadow-sm"
                    : "border-transparent hover:bg-muted/50 text-muted-foreground",
                )}
                data-testid={`sidebar-link-${item.key}`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="font-bold text-xs">{item.label}</span>
              </Link>

              {/* تبويبات القسم الجاري تظهر تحته مباشرة */}
              {activeSection?.key === item.key && item.tabs.length > 1 && (
                <div className="mt-1 mb-2 space-y-0.5 pr-6">
                  {item.tabs.map((tab) => (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      className={cn(
                        "block rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                        location === tab.href ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary",
                      )}
                      data-testid={`sidebar-tab-${tab.href.replace("/", "")}`}
                    >
                      {tab.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <button
          onClick={async () => {
            try {
              await logout();
            } catch (e) {}
            setLocation("/");
          }}
          className="tap-target mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-destructive hover:bg-destructive/10 transition-all font-bold text-xs"
          data-testid="sidebar-button-logout"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </aside>

      <div className="relative z-10 flex flex-1 flex-col min-w-0 lg:mx-auto lg:my-6 lg:h-fit lg:min-h-[calc(100vh-3rem)] lg:w-full lg:max-w-md lg:rounded-xl lg:bg-background lg:shadow-[0_20px_60px_rgba(16,24,40,0.10)] lg:overflow-hidden">
      {/* Header */}
      <header className="relative z-10 px-5 pt-8 pb-4 bg-gradient-to-b from-background via-background/95 to-transparent shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/15 bg-card/80 p-1.5 shadow-sm">
                <img src={logo} alt="Logo" className="w-full h-full object-contain opacity-85" />
             </div>
             <div>
               <p className="text-xs font-bold uppercase tracking-[0.24em] text-primary/65">صندوق العائلة</p>
               <h1 className="text-lg font-bold font-heading text-primary leading-tight">{activeLabel}</h1>
               <div className="mt-0.5 flex items-center gap-1.5">
                 <span className="w-1.5 h-1.5 rounded-full bg-fund-in animate-pulse"></span>
                 <p className="text-xs text-muted-foreground font-sans uppercase tracking-wider">
                   {user?.role === 'admin' ? 'مشرف النظام' : 'عضو الصندوق'}
                 </p>
               </div>
             </div>
          </div>
          <button 
            onClick={() => setIsMenuOpen(true)}
            className="tap-target relative rounded-lg border border-border/80 bg-card/80 p-2.5 shadow-sm transition-all hover:bg-primary/10 active:border-primary/22 lg:hidden"
          >
            <Menu className="w-5 h-5 text-primary" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-fund-in border border-background"></span>
          </button>
        </div>
        <div className="mt-4 rounded-xl border border-primary/22 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/14 text-primary">
              <Info className="w-4 h-4" />
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-muted-foreground">القسم الحالي</p>
                <p className="text-sm font-bold text-primary">{activeLabel}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeDesc}</p>
              </div>
            </div>
            <span className="rounded-full bg-fund-in-bright/20 px-2.5 py-1 text-xs font-bold text-fund-in border border-fund-in-bright/40">
              {user?.role === "admin" ? "وضع الإدارة" : "وضع العضو"}
            </span>
          </div>
        </div>

        {/* تبويبات القسم — تظهر على الجوال فقط، والشريط الجانبي يتكفل بها على الكمبيوتر */}
        {sectionTabs.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-hide lg:hidden" data-testid="section-tabs">
            {sectionTabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold border transition-all",
                  location === tab.href
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card/80 text-muted-foreground border-border/80 hover:text-primary",
                )}
                data-testid={`tab-${tab.href.replace("/", "")}`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        )}
      </header>

      {/* Side Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] max-w-md mx-auto lg:hidden"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-4/5 bg-card z-[70] shadow-2xl p-6 flex flex-col max-w-[320px] lg:hidden"
            >
              <div className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/14 flex items-center justify-center">
                    <img src={logo} className="w-5 h-5 opacity-80" />
                  </div>
                  <span className="font-bold text-primary font-heading">القائمة الرئيسية</span>
                </div>
                <button 
                  onClick={() => setIsMenuOpen(false)}
                  className="tap-target p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                {sections.map((item) => (
                  <Link 
                    key={item.key} 
                    href={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-lg transition-all border",
                      activeSection?.key === item.key
                        ? "bg-primary/10 border-primary/30 text-primary shadow-sm" 
                        : "border-transparent hover:bg-muted/50 text-muted-foreground"
                    )}
                  >
                    <div className={cn(
                      "p-2 rounded-xl",
                      activeSection?.key === item.key ? "bg-primary/14" : "bg-muted"
                    )}>
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm">{item.label}</div>
                      <div className="text-xs opacity-70">{item.desc}</div>
                    </div>
                    <div className="mr-auto flex items-center gap-2">
                      {activeSection?.key === item.key && <span className="rounded-full bg-primary/14 px-2 py-0.5 text-xs font-bold text-primary">نشط</span>}
                      <ChevronLeft className="w-4 h-4 opacity-30" />
                    </div>
                  </Link>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-border/80 space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-xs">
                        {(user?.firstName?.[0] || user?.email?.[0] || "U").toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-bold">{user?.firstName} {user?.lastName}</div>
                      <div className="text-xs text-muted-foreground uppercase tracking-widest">{user?.role === 'admin' ? 'مشرف' : 'مستخدم'}</div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed italic">
                    "نحن نؤمن بأن المال وسيلة لتمكين العائلة وتعزيز أواصر المودة."
                  </p>
                </div>
                
                <button 
                  onClick={async () => {
                    try {
                      await logout();
                    } catch (e) {}
                    setIsMenuOpen(false);
                    setLocation("/");
                  }}
                  className="w-full flex items-center gap-3 p-4 rounded-lg text-destructive hover:bg-destructive/10 transition-all border border-transparent hover:border-destructive/22 font-bold text-sm"
                  data-testid="button-logout"
                >
                  <div className="p-2 rounded-xl bg-destructive/14">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative z-10 flex-1 px-5 pb-24 overflow-y-auto scrollbar-hide lg:pb-8">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md lg:hidden border-t border-border/70 bg-card/90 px-5 pb-5 pt-2 backdrop-blur-xl shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <ul className="flex justify-between items-center">
          {bottomNavItems.map((item) => {
            const isActive = activeSection?.key === item.key;
            return (
              <li key={item.key} className="flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    "relative flex flex-col items-center gap-1 rounded-xl py-1 transition-all duration-300 group",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-primary/70"
                  )}
                >
                    {isActive && (
                      <motion.div 
                        layoutId="nav-active"
                        className="absolute -top-2 h-8 w-14 rounded-lg bg-primary/12"
                      />
                    )}
                    <item.icon className={cn("relative z-10 h-[18px] w-[18px] transition-transform group-active:scale-90", isActive && "fill-current")} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="relative z-10 text-xs font-bold tracking-tight">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      </div>
    </div>
  );
}
