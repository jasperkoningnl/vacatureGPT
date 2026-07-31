import { SignJWT, jwtVerify } from "jose"; import { cookies } from "next/headers";
const key=()=>new TextEncoder().encode(process.env.SESSION_SECRET);
export async function createSession(){ if(!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET ontbreekt"); return new SignJWT({authenticated:true}).setProtectedHeader({alg:"HS256"}).setIssuedAt().setExpirationTime("30d").sign(key()); }
export async function isAuthenticated(){ const token=(await cookies()).get("vacature_session")?.value; if(!token||!process.env.SESSION_SECRET) return process.env.NODE_ENV!=="production"&&!process.env.APP_PASSWORD; try { await jwtVerify(token,key()); return true; } catch { return false; } }
