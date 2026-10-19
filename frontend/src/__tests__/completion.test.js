import { describe, expect, it } from "vitest";
import { donorCompletion } from "../utils/completion";

const full = {
  full_name: "A B", date_of_birth: "2000-01-01", gender: "FEMALE", blood_group: "O+", phone_number: "9876543210",
  whatsapp_number: "9876543210", address: "Kochi", weight_kg: "55.00", has_location: true, medical_condition: "",
};

describe("donorCompletion", () => {
  it("is 100% when every counted field is saved, regardless of medical condition", () => {
    expect(donorCompletion(full)).toEqual({ percent: 100, missing: [] });
  });

  it("counts only saved fields and lists what is missing", () => {
    const result = donorCompletion({ ...full, whatsapp_number: "", has_location: false });
    expect(result.percent).toBe(78);
    expect(result.missing.map((m) => m.key)).toEqual(["whatsapp_number", "location"]);
  });

  it("does not count a medical condition and treats weight 0/null as missing", () => {
    const a = donorCompletion({ ...full, medical_condition: "something", weight_kg: null });
    expect(a.percent).toBe(89);
    expect(donorCompletion({ ...full, medical_condition: "" }).percent).toBe(100);
  });
});
