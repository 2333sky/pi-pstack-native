import { protocol, transact } from '../runtime/protocol.ts';
export interface Lease {subject:string;owner:string;token:number;expiresAt:number}
export function claimLease(subject:string,owner:string,ttlMs=30000):Lease {
  return transact('lease-claimed',subject,owner,s=>{
    const prior=s.leases[subject] as Lease|undefined;
    if(prior && prior.expiresAt>Date.now() && prior.owner!==owner)throw new Error('LEASE_BUSY');
    const lease={subject,owner,token:(prior?.token ?? 0)+1,expiresAt:Date.now()+ttlMs};s.leases[subject]=lease;return lease;
  });
}
export function renewLease(lease:Lease,ttlMs=30000):Lease {
  return transact('lease-renewed',lease.subject,lease.owner,s=>{
    const prior=s.leases[lease.subject];if(!prior || prior.owner!==lease.owner || prior.token!==lease.token || prior.expiresAt<=Date.now())throw new Error('LEASE_LOST');
    prior.expiresAt=Date.now()+ttlMs;return prior;
  });
}
export function assertLease(lease:Lease):void {const current=protocol().leases[lease.subject];if(!current || current.owner!==lease.owner || current.token!==lease.token || current.expiresAt<=Date.now())throw new Error('LEASE_LOST');}
export function releaseLease(lease:Lease):void {transact('lease-released',lease.subject,lease.owner,s=>{const current=s.leases[lease.subject];if(current?.token===lease.token && current.owner===lease.owner)current.expiresAt=0;return {token:lease.token};});}
