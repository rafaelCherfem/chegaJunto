import { RideLedgerBrand } from "@/components/brand/RideLedgerBrand";
import { RouteDecoration } from "@/components/brand/RouteDecoration";
import { ArrowLeftRight, Car, Flag, LogOut, Receipt, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { signOut } from "@/services/auth.service";

const navItems = [
  { to: "/", label: "Passageiros", mobileLabel: "Pessoas", icon: Users },
  { to: "/diarias", label: "Diárias", mobileLabel: "Diárias", icon: Car },
  { to: "/cobrancas", label: "Cobranças", mobileLabel: "Cobrar", icon: Receipt },
  {
    to: "/compensacoes",
    label: "Compensações",
    mobileLabel: "Abater",
    icon: ArrowLeftRight,
  },
  { to: "/sinalizadas", label: "Sinalizadas", mobileLabel: "Alertas", icon: Flag },
];

export function AppShell() {
  return (
    <div className="app-shell min-h-svh">
      <RouteDecoration />
      <header className="app-shell__header">
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <RideLedgerBrand className="lg:hidden" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => signOut()}
            aria-label="Sair"
            title="Sair"
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
        className="app-shell__nav fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/85 backdrop-blur-md"
      >
        <RideLedgerBrand className="mb-8 hidden px-3 lg:inline-flex" />
        <div className="app-shell__nav-list">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={
                item.mobileLabel === item.label
                  ? item.label
                  : `${item.mobileLabel} (${item.label})`
              }
              title={item.label}
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
                  <span className="app-shell__nav-label lg:hidden" aria-hidden="true">
                    {item.mobileLabel}
                  </span>
                  <span
                    className="app-shell__nav-label hidden lg:inline"
                    aria-hidden="true"
                  >
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
