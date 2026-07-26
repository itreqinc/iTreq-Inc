import { Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AdminLayout } from './admin/AdminLayout'
import AdminDashboard from './admin/pages/Dashboard'
import ClientsPage from './admin/pages/Clients'
import ProductsPage from './admin/pages/Products'
import StockPage from './admin/pages/Stock'
import SettingsPage from './admin/pages/Settings'
import QuotationsPage from './admin/pages/Quotations'
import InvoicesPage from './admin/pages/Invoices'
import PaymentsPage from './admin/pages/Payments'
import ExpensesPage from './admin/pages/Expenses'
import ReportsPage from './admin/pages/Reports'
import MonthlyFeesPage from './admin/pages/MonthlyFees'
import TrackingCatalogPage from './admin/pages/TrackingCatalog'
import StaffPage from './admin/pages/Staff'
import MyPayPage from './admin/pages/MyPay'
import PortalHome from './portal/PortalHome'
import { PortalLayout } from './portal/PortalLayout'
import PortalInvoices from './portal/PortalInvoices'
import PortalInvoiceDetail from './portal/PortalInvoiceDetail'
import PortalPayments from './portal/PortalPayments'
import PortalPaymentDetail from './portal/PortalPaymentDetail'
import PortalPayNotify from './portal/PortalPayNotify'
import PortalStatement from './portal/PortalStatement'
import PortalQuotes from './portal/PortalQuotes'
import PortalQuoteNew from './portal/PortalQuoteNew'
import PortalQuoteDetail from './portal/PortalQuoteDetail'
import Home from './pages/Home'
import Services from './pages/Services'
import WhatWeTrack from './pages/WhatWeTrack'
import SuccessStories from './pages/SuccessStories'
import About from './pages/About'
import Contact from './pages/Contact'
import Login from './pages/Login'
import Unauthorized from './pages/Unauthorized'
import RoleRedirect from './pages/RoleRedirect'
import ChangePassword from './pages/ChangePassword'
import OpsClosed from './pages/OpsClosed'
import { ROLES, STAFF_LIKE_ROLES } from './lib/authConfig'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/what-we-track" element={<WhatWeTrack />} />
        <Route path="/success-stories" element={<SuccessStories />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
      </Route>

      <Route path="/login" element={<Login />} />
      <Route path="/change-password" element={<ChangePassword />} />
      <Route path="/ops-closed" element={<OpsClosed />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/redirect" element={<RoleRedirect />} />

      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={STAFF_LIKE_ROLES} requireOpsHours>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="tracking-catalog" element={<TrackingCatalogPage />} />
        <Route path="quotations" element={<QuotationsPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="monthly-fees" element={<MonthlyFeesPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="my-pay" element={<MyPayPage />} />
      </Route>

      <Route
        path="/portal"
        element={
          <ProtectedRoute allowedRoles={[ROLES.client]}>
            <PortalLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<PortalHome />} />
        <Route path="quotes" element={<PortalQuotes />} />
        <Route path="quotes/new" element={<PortalQuoteNew />} />
        <Route path="quotes/:id/edit" element={<PortalQuoteNew />} />
        <Route path="quotes/:id" element={<PortalQuoteDetail />} />
        <Route path="invoices" element={<PortalInvoices />} />
        <Route path="invoices/:id" element={<PortalInvoiceDetail />} />
        <Route path="payments" element={<PortalPayments />} />
        <Route path="payments/notify" element={<PortalPayNotify />} />
        <Route path="payments/:id" element={<PortalPaymentDetail />} />
        <Route path="statement" element={<PortalStatement />} />
      </Route>
    </Routes>
  )
}
