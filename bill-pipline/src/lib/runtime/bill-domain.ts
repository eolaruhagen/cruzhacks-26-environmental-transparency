import { z } from "zod";

export const PartyEnum = z.enum(["Democrat", "Republican", "Independent"]);
export const ChamberEnum = z.enum(["House", "Senate", "Joint"]);
export const LegislationTypeEnum = z.enum([
    "HR",
    "S",
    "HJRES",
    "SJRES",
    "HCONRES",
    "SCONRES",
    "HRES",
    "SRES",
]);
