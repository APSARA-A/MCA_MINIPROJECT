import { Navigate, Route, Routes } from "react-router-dom";
import HospitalMedicalScreening from "./pages/HospitalMedicalScreening";
import HospitalDonationCompletion from "./pages/HospitalDonationCompletion";
import DonorDonationHistory from "./pages/DonorDonationHistory";
import HospitalDonationHistory from "./pages/HospitalDonationHistory";
import HospitalScreeningQueue from "./pages/HospitalScreeningQueue";
import AppLayout from "./components/AppLayout";
import DashboardLayout from "./components/DashboardLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminNotice from "./pages/AdminNotice";
import DonorBloodRequests from "./pages/DonorBloodRequests";
import DonorDashboard from "./pages/DonorDashboard";
import DonorProfile from "./pages/DonorProfile";
import CreateEmergencyRequest from "./pages/CreateEmergencyRequest";
import DonorRegister from "./pages/DonorRegister";
import EditEmergencyRequest from "./pages/EditEmergencyRequest";
import EmergencyRequestDetails from "./pages/EmergencyRequestDetails";
import EmergencyRequestList from "./pages/EmergencyRequestList";
import HomePage from "./pages/HomePage";
import HospitalDonorMatches from "./pages/HospitalDonorMatches";
import HospitalDashboard from "./pages/HospitalDashboard";
import HospitalProfile from "./pages/HospitalProfile";
import HospitalRegister from "./pages/HospitalRegister";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import RegisterChoice from "./pages/RegisterChoice";
import Unauthorized from "./pages/Unauthorized";

function App() {
  return (
    <Routes>
      {/* Dashboard area: sidebar layout, role-guarded, one shared profile fetch per area. */}
      <Route element={<ProtectedRoute roles={["DONOR"]}><DashboardLayout role="DONOR" /></ProtectedRoute>}>
        <Route path="/donor/dashboard" element={<DonorDashboard />} />
        <Route path="/donor/requests" element={<DonorBloodRequests />} />
        <Route path="/donor/donation-history" element={<DonorDonationHistory />} />
        <Route path="/donor/profile" element={<DonorProfile />} />
      </Route>
      <Route element={<ProtectedRoute roles={["HOSPITAL"]}><DashboardLayout role="HOSPITAL" /></ProtectedRoute>}>
        <Route path="/hospital/dashboard" element={<HospitalDashboard />} />
        <Route path="/hospital/matches/:matchId/screening" element={<HospitalMedicalScreening />} />
        <Route path="/hospital/matches/:matchId/donation" element={<HospitalDonationCompletion />} />
        <Route path="/hospital/screening" element={<HospitalScreeningQueue />} />
        <Route path="/hospital/donation-history" element={<HospitalDonationHistory />} />
        <Route path="/hospital/profile" element={<HospitalProfile />} />
        <Route path="/hospital/emergency" element={<EmergencyRequestList />} />
        <Route path="/hospital/emergency/new" element={<CreateEmergencyRequest />} />
        <Route path="/hospital/emergency/:id" element={<EmergencyRequestDetails />} />
        <Route path="/hospital/emergency/:id/matches" element={<HospitalDonorMatches />} />
        <Route path="/hospital/emergency/:id/edit" element={<EditEmergencyRequest />} />
      </Route>

      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<RegisterChoice />} />
        <Route path="/register/donor" element={<DonorRegister />} />
        <Route path="/register/hospital" element={<HospitalRegister />} />
        <Route path="/admin-access" element={<ProtectedRoute roles={["ADMIN"]}><AdminNotice /></ProtectedRoute>} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

export default App;
