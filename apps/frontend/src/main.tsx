import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { AIAnalysisPage } from "@/pages/AIAnalysisPage";
import { TransactionsPage } from "@/pages/TransactionsPage";
import { AssetsPage } from "@/pages/AssetsPage";
import { CheckupsPage } from "@/pages/health/CheckupsPage";
import { CheckupDetailPage } from "@/pages/health/CheckupDetailPage";
import { VisitsPage } from "@/pages/health/VisitsPage";
import { VisitDetailPage } from "@/pages/health/VisitDetailPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { AccountsPage } from "@/pages/AccountsPage";
import { MembersPage } from "@/pages/MembersPage";
import { MessagesPage } from "@/pages/MessagesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import "./index.css";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "analysis", element: <AIAnalysisPage /> },
      { path: "transactions", element: <TransactionsPage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "checkups", element: <CheckupsPage /> },
      { path: "checkups/:id", element: <CheckupDetailPage /> },
      { path: "visits", element: <VisitsPage /> },
      { path: "visits/:id", element: <VisitDetailPage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "accounts", element: <AccountsPage /> },
      { path: "members", element: <MembersPage /> },
      { path: "messages", element: <MessagesPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
