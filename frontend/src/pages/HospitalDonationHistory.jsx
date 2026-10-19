import VerifiedHospitalGate from "../components/VerifiedHospitalGate";
import PageHeader from "../components/PageHeader";
import DonationHistoryList from "../components/DonationHistoryList";
export default function HospitalDonationHistory() { return <VerifiedHospitalGate>{() => <div className="dash-stack"><PageHeader title="Hospital Donation History"><p>Donation records associated with your hospital.</p></PageHeader><DonationHistoryList hospital /></div>}</VerifiedHospitalGate>; }
