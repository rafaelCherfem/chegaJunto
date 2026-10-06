import { ArrowLeftRight, Car, Flag, LogOut, Receipt, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOut } from "@/services/auth.service";

const navItems = [
  { to: "/", label: "Passageiros", icon: Users },
  { to: "/diarias", label: "Diárias", icon: Car },
  { to: "/cobrancas", label: "Cobranças", icon: Receipt },
  { to: "/compensacoes", label: "Compensações", icon: ArrowLeftRight },
  { to: "/sinalizadas", label: "Sinalizadas", icon: Flag },
];

export function AppShell() {
  return (
    <div className="app-shell min-h-svh">
      <header className="app-shell__header">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <span className="wordmark lg:hidden">
            Ride<span>Ledger</span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            aria-label="Sair"
            className="h-11 w-11"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="app-shell__content">
        <Outlet />
      </main>

      <nav
        aria-label="Navegação principal"
        className="app-shell__nav fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card"
      >
        <p className="wordmark mb-8 hidden px-3 lg:block">
          Ride<span>Ledger</span>
        </p>
        <div className="app-shell__nav-list">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                cn(
                  "app-shell__nav-link motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring hover:text-foreground",
                  isActive && "font-semibold",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0"
                    strokeWidth={isActive ? 2.25 : 1.75}
                  />
                  <span className="app-shell__nav-label">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
