import { SignJWT } from "jose";
const key=()=>new TextEncoder().encode(process.env.SESSION_SECRET);
export async function createSession(){ if(!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET ontbreekt"); return new SignJWT({authenticated:true}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("30d").sign(key()); }
