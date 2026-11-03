// A producer's website, address and place are the same for every wine by that producer.
// knownProducer(): what any host has already found or typed for the producer (across all accounts, through the
//   known_producer() function – only the producer's public facts come back).
// shareProducer(): after a wine's producer facts are saved, the account's other wines by the same producer get the
//   ones they are missing – what a host typed on another wine is never overwritten.
import { supabase } from './supabase';

export type ProducerFacts = { website: string | null; address: string | null; lat: number | null; lon: number | null; source: string | null };

export async function knownProducer(name: string | null | undefined): Promise<ProducerFacts | null> {
  if (!name?.trim()) return null;
  const { data, error } = await supabase.rpc('known_producer', { name });
  if (error || !data) return null;
  const f = data as ProducerFacts;
  return f.website || f.address || f.lat != null ? f : null;
}

/** % and _ are wildcards in ilike: matched literally here */
const literal = (s: string) => s.trim().replace(/[\\%_]/g, (c) => '\\' + c);

export async function shareProducer(name: string | null | undefined, f: Partial<ProducerFacts>, exceptId?: number) {
  if (!name?.trim()) return;
  const jobs: PromiseLike<unknown>[] = [];
  const base = (patch: Record<string, unknown>, emptyCol: string) => {
    let q = supabase.from('wines').update(patch).ilike('producer', literal(name)).is(emptyCol, null);
    if (exceptId != null) q = q.neq('id', exceptId);
    jobs.push(q);
  };
  if (f.website) base({ producer_website: f.website }, 'producer_website');
  if (f.address) base({ producer_address: f.address }, 'producer_address');
  if (f.lat != null && f.lon != null) base({ producer_lat: f.lat, producer_lon: f.lon, producer_source: f.source ?? 'shared', producer_checked_at: new Date().toISOString() }, 'producer_lat');
  await Promise.all(jobs).catch(() => {});
}
