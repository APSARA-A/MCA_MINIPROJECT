import ProfileGate from "../components/ProfileGate";
import PageHeader from "../components/PageHeader";
import DonationHistoryList from "../components/DonationHistoryList";
export default function DonorDonationHistory() { return <ProfileGate>{() => <div className="dash-stack"><PageHeader title="Donation History"><p>Your recorded completed donations.</p></PageHeader><DonationHistoryList /></div>}</ProfileGate>; }
