import { supabase } from './supabase';

// Smagningens tilstand, som gæstesiderne skal bruge (fra invitationskode eller slug).
export type Tasting = {
  id: string; slug: string; title: string; starts_at: string | null;
  place: string | null; language: string; mobilepay: string | null;
  signup_open: boolean; orders_open: boolean; quiz_open: boolean; quiz_finished: boolean;
  quiz_count: number;
};

export async function fetchTasting(opts: { code?: string | null; slug?: string | null }): Promise<Tasting | null> {
  const { data, error } = await supabase.rpc('get_tasting', {
    code: opts.code ?? null,
    slug: opts.slug ?? null,
  });
  if (error || !data) return null;
  return data as Tasting;
}
