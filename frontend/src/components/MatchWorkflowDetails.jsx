import { Link } from "react-router-dom";
import { matchLabel } from "../utils/matchStatus";
import WorkflowStepper from "./WorkflowStepper";
export default function MatchWorkflowDetails({ data }) {
  return <section className="card"><WorkflowStepper status={data.match_status} /><dl className="detail-list">
    <div><dt>Donor</dt><dd>{data.donor_name}</dd></div>
    <div><dt>Blood group</dt><dd>{data.blood_group}</dd></div>
    <div><dt>Hospital</dt><dd>{data.hospital_name}</dd></div>
    <div><dt>Request reference</dt><dd><Link to={`/hospital/emergency/${data.request.request_id}`}>LL-{data.request.request_id}</Link></dd></div>
    <div><dt>Request status</dt><dd>{data.request.request_status}</dd></div>
    <div><dt>Arrival / match status</dt><dd>{matchLabel(data.match_status)}</dd></div>
    <div><dt>Screening status</dt><dd>{data.screening?.screening_status || "Not started"}</dd></div>
  </dl></section>;
}
