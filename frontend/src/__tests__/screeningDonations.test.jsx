import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import * as profiles from "../services/profileService";
import * as screening from "../services/screeningService";
import * as donations from "../services/donationService";
const auth={user:{role:"HOSPITAL"},status:"authenticated",logout:vi.fn()};
vi.mock("../context/AuthContext",()=>({useAuth:()=>auth}));
vi.mock("../components/BackendStatus",()=>({default:()=>null}));
vi.mock("../services/profileService",()=>({fetchHospitalProfile:vi.fn(),fetchDonorProfile:vi.fn(),updateDonorProfile:vi.fn(),updateHospitalProfile:vi.fn()}));
vi.mock("../services/screeningService",()=>({getScreening:vi.fn(),markArrived:vi.fn(),startScreening:vi.fn(),recordDecision:vi.fn(),getScreeningSummary:vi.fn(),getScreeningQueue:vi.fn()}));
vi.mock("../services/donationService",()=>({completeDonation:vi.fn(),fulfillRequest:vi.fn(),getDonationProgress:vi.fn(),getDonorHistory:vi.fn(),getHospitalHistory:vi.fn()}));
const progress={request_id:7,request_status:"DONORS_CONTACTED",units_required:2,completed_units:0,remaining_units:2,can_fulfill:false};
const base={match_id:3,donor_name:"Asha",blood_group:"O+",hospital_name:"City Hospital",match_status:"AVAILABLE",donor_response:"AVAILABLE",notification_status:"PENDING",screening:null,donation:null,request:progress,actions:{can_mark_arrived:true,can_start_screening:false,can_decide:false,can_complete:false}};
const pending={...base,match_status:"SCREENING",screening:{screening_status:"PENDING"},actions:{can_decide:true}};
const approved={...base,match_status:"APPROVED",screening:{screening_status:"APPROVED",screened_by:"QA",screening_date:"2026-10-11T10:00:00Z"},actions:{can_complete:true}};
function renderAt(path="/hospital/matches/3/screening"){return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);}
beforeEach(()=>{
 vi.clearAllMocks();auth.user={role:"HOSPITAL"};
 profiles.fetchHospitalProfile.mockResolvedValue({is_verified:true,is_active:true});
 profiles.fetchDonorProfile.mockResolvedValue({full_name:"Asha",blood_group:"O+",is_active:true});
 screening.getScreening.mockResolvedValue(base);screening.markArrived.mockResolvedValue({...base,match_status:"ARRIVED",actions:{can_start_screening:true}});
 screening.startScreening.mockResolvedValue(pending);screening.recordDecision.mockResolvedValue(approved);
 donations.getDonationProgress.mockResolvedValue(progress);
 donations.getDonorHistory.mockResolvedValue({count:0,next:null,previous:null,results:[],summary:{total_completed:0,total_units:0,most_recent:null}});
 donations.getHospitalHistory.mockResolvedValue({count:0,next:null,previous:null,results:[]});
 screening.getScreeningQueue.mockResolvedValue({count:0,next:null,previous:null,results:[]});
});
it("marks arrival only after explicit confirmation and then enables screening",async()=>{
 renderAt();await userEvent.click(await screen.findByRole("button",{name:"Mark Arrived"}));
 expect(screening.markArrived).not.toHaveBeenCalled();await userEvent.click(screen.getByRole("button",{name:"Confirm Arrival"}));
 await screen.findByText("Donor arrival recorded.");expect(screening.markArrived).toHaveBeenCalledWith("3");
 await userEvent.click(screen.getByRole("button",{name:"Start Screening"}));await screen.findByRole("heading",{name:"Record Screening Decision"});
 expect(screening.startScreening).toHaveBeenCalledWith("3");expect(screening.recordDecision).not.toHaveBeenCalled();
});
it("blank screening measurements stay blank and a decision is explicitly required",async()=>{
 screening.getScreening.mockResolvedValue(pending);renderAt();await screen.findByLabelText("Hemoglobin (g/dL)");
 expect(screen.getByLabelText("Hemoglobin (g/dL)")).toHaveValue(null);expect(screen.getByLabelText("Decision")).toHaveValue("");
 expect(screen.queryByRole("link",{name:"Complete Donation"})).not.toBeInTheDocument();
});
async function enterDecision(decision="APPROVED"){
 await userEvent.type(await screen.findByLabelText("Screened by"),"QA Staff");
 await userEvent.selectOptions(screen.getByLabelText("Decision"),decision);
 if(decision==="REJECTED")await userEvent.type(screen.getByLabelText("Rejection reason"),"Hospital assessment");
 await userEvent.click(screen.getByRole("button",{name:"Record Screening Decision"}));
}
it("submits hospital decision without inventing optional measurements",async()=>{
 screening.getScreening.mockResolvedValue(pending);renderAt();await enterDecision();
 expect(screening.recordDecision).not.toHaveBeenCalled();await userEvent.click(screen.getByRole("button",{name:"Confirm Screening Decision"}));
 await screen.findByText("Hospital screening decision recorded.");
 expect(screening.recordDecision).toHaveBeenCalledWith("3",{screening_status:"APPROVED",screened_by:"QA Staff",medical_notes:"",rejection_reason:"",blood_pressure:""});
 expect(screen.getByRole("link",{name:"Complete Donation"})).toHaveAttribute("href","/hospital/matches/3/donation");
});
it("records rejected reason and closes completion access",async()=>{
 screening.getScreening.mockResolvedValue(pending);screening.recordDecision.mockResolvedValue({...base,match_status:"REJECTED",screening:{screening_status:"REJECTED",rejection_reason:"Hospital assessment"},actions:{}});
 renderAt();await enterDecision("REJECTED");await userEvent.click(screen.getByRole("button",{name:"Confirm Screening Decision"}));
 await screen.findByRole("heading",{name:"Recorded Screening"});expect(screen.getByText("Hospital assessment")).toBeInTheDocument();expect(screen.queryByRole("link",{name:"Complete Donation"})).not.toBeInTheDocument();
});
it("requires rejection reason before allowing final decision confirmation",async()=>{
 screening.getScreening.mockResolvedValue(pending);renderAt();await userEvent.type(await screen.findByLabelText("Screened by"),"QA");await userEvent.selectOptions(screen.getByLabelText("Decision"),"REJECTED");
 await userEvent.click(screen.getByRole("button",{name:"Record Screening Decision"}));expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(screening.recordDecision).not.toHaveBeenCalled();
});
it("validates blood-pressure format without inferring approval",async()=>{
 screening.getScreening.mockResolvedValue(pending);renderAt();await userEvent.type(await screen.findByLabelText("Blood pressure"),"abc");await enterDecision();
 expect(await screen.findByText(/Enter blood pressure as/)).toBeInTheDocument();expect(screening.recordDecision).not.toHaveBeenCalled();
});
it("finalized screening is readonly",async()=>{
 screening.getScreening.mockResolvedValue(approved);renderAt();await screen.findByRole("heading",{name:"Recorded Screening"});expect(screen.queryByLabelText("Decision")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Start Screening"})).not.toBeInTheDocument();
});
it("repeated decision submission is blocked while pending",async()=>{
 screening.getScreening.mockResolvedValue(pending);let finish;screening.recordDecision.mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve(approved);}));
 renderAt();await enterDecision();await userEvent.dblClick(screen.getByRole("button",{name:"Confirm Screening Decision"}));expect(screening.recordDecision).toHaveBeenCalledTimes(1);finish();await screen.findByText("Hospital screening decision recorded.");
});
it("displays workflow conflicts and refreshed allowed actions",async()=>{
 screening.markArrived.mockRejectedValue({response:{status:409,data:{detail:"Request cancelled."}}});renderAt();await userEvent.click(await screen.findByRole("button",{name:"Mark Arrived"}));
 screening.getScreening.mockResolvedValue({...base,request:{...progress,request_status:"CANCELLED"},actions:{}});
 await userEvent.click(screen.getByRole("button",{name:"Confirm Arrival"}));await screen.findByText("Request cancelled.");expect(screen.queryByRole("button",{name:"Mark Arrived"})).not.toBeInTheDocument();
});
it("requires approved screening before displaying donation completion form",async()=>{
 renderAt("/hospital/matches/3/donation");await screen.findByText(/Donation completion requires/);expect(screen.queryByLabelText("Donation date")).not.toBeInTheDocument();expect(donations.completeDonation).not.toHaveBeenCalled();
});
async function enterDonation(){await userEvent.type(await screen.findByLabelText("Donation date"),"2026-10-11");await userEvent.type(screen.getByLabelText("Units donated"),"1");await userEvent.click(screen.getByRole("button",{name:"Confirm Donation Completed"}));}
it("completes only after physical-donation confirmation and displays real history",async()=>{
 screening.getScreening.mockResolvedValue(approved);donations.completeDonation.mockResolvedValue({...approved,match_status:"DONATED",actions:{},donation:{donation_date:"2026-10-11",units_donated:1,status:"COMPLETED",blood_group:"O+"}});
 renderAt("/hospital/matches/3/donation");await enterDonation();expect(donations.completeDonation).not.toHaveBeenCalled();
 expect(screen.getByText(/physically completed the blood donation/)).toBeInTheDocument();await userEvent.click(screen.getByRole("button",{name:"Record Completed Donation"}));await screen.findByRole("heading",{name:"Donation Completed"});
 expect(donations.completeDonation).toHaveBeenCalledWith("3",{donation_date:"2026-10-11",units_donated:1,blood_group:"O+",confirmed_completed:true});expect(screen.queryByRole("button",{name:"Confirm Donation Completed"})).not.toBeInTheDocument();
});
it("can cancel completion without recording a donation",async()=>{
 screening.getScreening.mockResolvedValue(approved);renderAt("/hospital/matches/3/donation");await enterDonation();await userEvent.click(screen.getByRole("button",{name:"Cancel"}));expect(donations.completeDonation).not.toHaveBeenCalled();
});
it("prevents duplicate donation submissions",async()=>{
 screening.getScreening.mockResolvedValue(approved);let finish;donations.completeDonation.mockImplementation(()=>new Promise(resolve=>{finish=()=>resolve({...approved,match_status:"DONATED",actions:{},donation:{donation_date:"2026-10-11",units_donated:1,status:"COMPLETED"}});}));
 renderAt("/hospital/matches/3/donation");await enterDonation();await userEvent.dblClick(screen.getByRole("button",{name:"Record Completed Donation"}));expect(donations.completeDonation).toHaveBeenCalledTimes(1);finish();await screen.findByText("Completed donation recorded.");
});
it("shows backend donation validation errors for correction",async()=>{
 screening.getScreening.mockResolvedValue(approved);donations.completeDonation.mockRejectedValue({response:{status:400,data:{units_donated:["Invalid units."]}}});renderAt("/hospital/matches/3/donation");await enterDonation();await userEvent.click(screen.getByRole("button",{name:"Record Completed Donation"}));expect(await screen.findByText("Invalid units.")).toBeInTheDocument();
});
it("fulfillment requires real enough-units state and separate confirmation",async()=>{
 donations.getDonationProgress.mockResolvedValue({...progress,completed_units:2,remaining_units:0,can_fulfill:true});donations.fulfillRequest.mockResolvedValue({...progress,completed_units:2,remaining_units:0,request_status:"FULFILLED",can_fulfill:false});
 renderAt("/hospital/matches/3/donation");await userEvent.click(await screen.findByRole("button",{name:"Confirm Request Fulfillment"}));expect(donations.fulfillRequest).not.toHaveBeenCalled();await userEvent.click(screen.getByRole("button",{name:"Fulfill Request"}));await screen.findByText("Emergency request fulfilled.");expect(donations.fulfillRequest).toHaveBeenCalledWith(7);
});
it("donor history empty state contains no fabricated events",async()=>{
 auth.user={role:"DONOR"};renderAt("/donor/donation-history");expect(await screen.findByText("No completed donations recorded yet.")).toBeInTheDocument();expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
it("donor history displays real summary and paginates",async()=>{
 auth.user={role:"DONOR"};donations.getDonorHistory.mockResolvedValue({count:11,next:"next",previous:null,summary:{total_completed:11,total_units:12,most_recent:"2026-10-11"},results:[{donation_id:1,hospital_name:"City Hospital",donation_date:"2026-10-11",blood_group:"O+",units_donated:2,status:"COMPLETED",request_id:7}]});
 renderAt("/donor/donation-history");await screen.findByRole("heading",{name:"City Hospital"});expect(screen.getByText("11")).toBeInTheDocument();await userEvent.click(screen.getByRole("button",{name:"Next"}));await waitFor(()=>expect(donations.getDonorHistory).toHaveBeenLastCalledWith(2));
});
it("hospital history supports request filtering",async()=>{
 renderAt("/hospital/donation-history");await screen.findByText("No donation records found.");await userEvent.type(screen.getByLabelText("Emergency request ID"),"7");await userEvent.click(screen.getByRole("button",{name:"Filter History"}));await waitFor(()=>expect(donations.getHospitalHistory).toHaveBeenLastCalledWith({page:1,request_id:"7"}));
});
it("unverified hospitals cannot fetch confidential screening",async()=>{
 profiles.fetchHospitalProfile.mockResolvedValue({is_verified:false});renderAt();await screen.findByText("Verification Pending");expect(screening.getScreening).not.toHaveBeenCalled();
});
it("donors cannot view medical screening and hospitals cannot view donor history",async()=>{
 auth.user={role:"DONOR"};renderAt();await screen.findByRole("heading",{name:/don.t have access/});expect(screening.getScreening).not.toHaveBeenCalled();
});
it("screening queue shows only returned rows and workflow links",async()=>{
 screening.getScreeningQueue.mockResolvedValue({results:[{match_id:3,request_id:7,donor_name:"Asha",blood_group:"O+",match_status:"APPROVED",request_status:"DONORS_CONTACTED"}],next:null,previous:null});renderAt("/hospital/screening");await screen.findByRole("heading",{name:"Asha"});expect(screen.getByRole("link",{name:"View Match Workflow"})).toHaveAttribute("href","/hospital/matches/3/donation");
});
