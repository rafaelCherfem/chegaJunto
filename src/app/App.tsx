import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/contexts/AuthContext";
import { queryClient } from "@/lib/queryClient";
import { CompensationsPage } from "@/pages/CompensationsPage";
import { FlaggedRidesPage } from "@/pages/FlaggedRidesPage";
import { InviteRedemptionPage } from "@/pages/InviteRedemptionPage";
import { LoginPage } from "@/pages/LoginPage";
import { MonthlyClosingPage } from "@/pages/MonthlyClosingPage";
import { PassengersPage } from "@/pages/PassengersPage";
import { RidesPage } from "@/pages/RidesPage";
import { GuestRoute } from "@/routes/GuestRoute";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { RoleRouter } from "@/routes/RoleRouter";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>
            <Route path="/convite" element={<InviteRedemptionPage />} />
            <Route path="/convite/:code" element={<InviteRedemptionPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<RoleRouter />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<PassengersPage />} />
                  <Route path="/diarias" element={<RidesPage />} />
                  <Route path="/cobrancas" element={<MonthlyClosingPage />} />
                  <Route path="/compensacoes" element={<CompensationsPage />} />
                  <Route path="/sinalizadas" element={<FlaggedRidesPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
