import { createHash, timingSafeEqual } from "node:crypto";
const WINDOW_MS=15*60*1000;const MAX_ATTEMPTS=5;type Attempt={count:number;windowStartedAt:number};const attempts=new Map<string,Attempt>();
export function passwordsMatch(candidate:string,expected:string){const digest=(value:string)=>createHash("sha256").update(value).digest();return timingSafeEqual(digest(candidate),digest(expected));}
export function loginAllowed(key:string,now=Date.now()){const attempt=attempts.get(key);return !attempt||now-attempt.windowStartedAt>=WINDOW_MS||attempt.count<MAX_ATTEMPTS;}
export function recordFailedLogin(key:string,now=Date.now()){const attempt=attempts.get(key);if(!attempt||now-attempt.windowStartedAt>=WINDOW_MS)attempts.set(key,{count:1,windowStartedAt:now});else attempt.count++;}
export function clearLoginAttempts(key:string){attempts.delete(key);}export function resetLoginAttemptsForTests(){attempts.clear();}
