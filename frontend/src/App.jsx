import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerForm from './pages/CustomerForm';
import CustomerNotes from './pages/CustomerNotes';
import Policies from './pages/Policies';
import PolicyForm from './pages/PolicyForm';
import PolicyFinance from './pages/PolicyFinance';
import Renewals from './pages/Renewals';
import Insurers from './pages/Insurers';
import InsurerForm from './pages/InsurerForm';
import InsurerBranches from './pages/InsurerBranches';
import InsurerBranchForm from './pages/InsurerBranchForm';
import Departments from './pages/Departments';
import DepartmentForm from './pages/DepartmentForm';
import Designations from './pages/Designations';
import DesignationForm from './pages/DesignationForm';
import Employees from './pages/Employees';
import EmployeeForm from './pages/EmployeeForm';
import BrokerBranches from './pages/BrokerBranches';
import BrokerBranchForm from './pages/BrokerBranchForm';
import Verticals from './pages/Verticals';
import VerticalForm from './pages/VerticalForm';
import SubVerticals from './pages/SubVerticals';
import SubVerticalForm from './pages/SubVerticalForm';
import BankAccounts from './pages/BankAccounts';
import BankAccountForm from './pages/BankAccountForm';
import Expenses from './pages/Expenses';
import ExpenseForm from './pages/ExpenseForm';
import Heads from './pages/Heads';
import HeadForm from './pages/HeadForm';
import Transactions from './pages/Transactions';
import CustomerBalances from './pages/CustomerBalances';
import CommissionReconciliation from './pages/CommissionReconciliation';
import AuditLog from './pages/AuditLog';
import Attendance from './pages/Attendance';
import Performance from './pages/Performance';
import Leave from './pages/Leave';
import Payroll from './pages/Payroll';
import Chat from './pages/Chat';
import Admin from './pages/Admin';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute pageKey="dashboard">
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute pageKey="customers">
                <Customers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/new"
            element={
              <ProtectedRoute pageKey="customers">
                <CustomerForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/:id/edit"
            element={
              <ProtectedRoute pageKey="customers">
                <CustomerForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers/:id/notes"
            element={
              <ProtectedRoute pageKey="customers">
                <CustomerNotes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies"
            element={
              <ProtectedRoute pageKey="policies">
                <Policies />
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies/new"
            element={
              <ProtectedRoute pageKey="policies">
                <PolicyForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies/:id/edit"
            element={
              <ProtectedRoute pageKey="policies">
                <PolicyForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/policies/:id/finance"
            element={
              <ProtectedRoute pageKey="policies">
                <PolicyFinance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/renewals"
            element={
              <ProtectedRoute pageKey="renewals">
                <Renewals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insurers"
            element={
              <ProtectedRoute pageKey="insurers">
                <Insurers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insurers/new"
            element={
              <ProtectedRoute pageKey="insurers">
                <InsurerForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insurers/:id/edit"
            element={
              <ProtectedRoute pageKey="insurers">
                <InsurerForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insurer-branches"
            element={
              <ProtectedRoute pageKey="insurer_branches">
                <InsurerBranches />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insurer-branches/new"
            element={
              <ProtectedRoute pageKey="insurer_branches">
                <InsurerBranchForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/insurer-branches/:id/edit"
            element={
              <ProtectedRoute pageKey="insurer_branches">
                <InsurerBranchForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/departments"
            element={
              <ProtectedRoute pageKey="departments">
                <Departments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/departments/new"
            element={
              <ProtectedRoute pageKey="departments">
                <DepartmentForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/departments/:id/edit"
            element={
              <ProtectedRoute pageKey="departments">
                <DepartmentForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designations"
            element={
              <ProtectedRoute pageKey="designations">
                <Designations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designations/new"
            element={
              <ProtectedRoute pageKey="designations">
                <DesignationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/designations/:id/edit"
            element={
              <ProtectedRoute pageKey="designations">
                <DesignationForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees"
            element={
              <ProtectedRoute pageKey="employees">
                <Employees />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/new"
            element={
              <ProtectedRoute pageKey="employees">
                <EmployeeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/employees/:id/edit"
            element={
              <ProtectedRoute pageKey="employees">
                <EmployeeForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/branches"
            element={
              <ProtectedRoute pageKey="branches">
                <BrokerBranches />
              </ProtectedRoute>
            }
          />
          <Route
            path="/branches/new"
            element={
              <ProtectedRoute pageKey="branches">
                <BrokerBranchForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/branches/:id/edit"
            element={
              <ProtectedRoute pageKey="branches">
                <BrokerBranchForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verticals"
            element={
              <ProtectedRoute pageKey="verticals">
                <Verticals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verticals/new"
            element={
              <ProtectedRoute pageKey="verticals">
                <VerticalForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/verticals/:id/edit"
            element={
              <ProtectedRoute pageKey="verticals">
                <VerticalForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sub-verticals"
            element={
              <ProtectedRoute pageKey="sub_verticals">
                <SubVerticals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sub-verticals/new"
            element={
              <ProtectedRoute pageKey="sub_verticals">
                <SubVerticalForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/sub-verticals/:id/edit"
            element={
              <ProtectedRoute pageKey="sub_verticals">
                <SubVerticalForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank-accounts"
            element={
              <ProtectedRoute pageKey="bank_accounts">
                <BankAccounts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank-accounts/new"
            element={
              <ProtectedRoute pageKey="bank_accounts">
                <BankAccountForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bank-accounts/:id/edit"
            element={
              <ProtectedRoute pageKey="bank_accounts">
                <BankAccountForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute pageKey="expenses">
                <Expenses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses/new"
            element={
              <ProtectedRoute pageKey="expenses">
                <ExpenseForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses/:id/edit"
            element={
              <ProtectedRoute pageKey="expenses">
                <ExpenseForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/heads"
            element={
              <ProtectedRoute pageKey="heads">
                <Heads />
              </ProtectedRoute>
            }
          />
          <Route
            path="/heads/new"
            element={
              <ProtectedRoute pageKey="heads">
                <HeadForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/heads/:id/edit"
            element={
              <ProtectedRoute pageKey="heads">
                <HeadForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/transactions"
            element={
              <ProtectedRoute pageKey="transactions">
                <Transactions />
              </ProtectedRoute>
            }
          />
          <Route
            path="/customer-balances"
            element={
              <ProtectedRoute pageKey="customer_balances">
                <CustomerBalances />
              </ProtectedRoute>
            }
          />
          <Route
            path="/commission-reconciliation"
            element={
              <ProtectedRoute pageKey="commission_reconciliation">
                <CommissionReconciliation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/activity-log"
            element={
              <ProtectedRoute pageKey="audit_log">
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute pageKey="attendance">
                <Attendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/performance"
            element={
              <ProtectedRoute pageKey="performance">
                <Performance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leave"
            element={
              <ProtectedRoute pageKey="leave">
                <Leave />
              </ProtectedRoute>
            }
          />
          <Route
            path="/payroll"
            element={
              <ProtectedRoute pageKey="payroll">
                <Payroll />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat"
            element={
              <ProtectedRoute>
                <Chat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute adminOnly>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
