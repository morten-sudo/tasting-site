// Shared by the wine pages: data type, style names and style colours.

export type Wine = {
  id: number; sort_order: number; name: string; producer: string | null;
  style: string | null; vintage: string | null; abv: number | null;
  price_dkk: number | null; description: string | null; orderable: boolean;
  image_url: string | null; details: string | null; retail_price_dkk: number | null;
};

export const STYLE_LABELS: Record<string, string> = {
  Vintage: 'Vintage',
  Tawny: 'Tawny',
  Rivesaltes: 'Rivesaltes Ambré',
  White: 'Hvid portvin',
  Aguardente: 'Druebrændevin',
  Red: 'Rødvin',
  WhiteWine: 'Hvidvin',
  Rose: 'Rosé',
  Orange: 'Orangevin',
  Sparkling: 'Mousserende',
  Sweet: 'Dessertvin',
  Fortified: 'Hedvin',
};

// Style badge colour
export const STYLE_TONES: Record<string, string> = {
  Vintage: '#a3213a',
  Tawny: '#b8742e',
  Rivesaltes: '#9c4a2c',
  White: '#e0c27a',
  Aguardente: '#dba65a',
  Red: '#861530',
  WhiteWine: '#e0c27a',
  Rose: '#d98a8a',
  Orange: '#d08a3a',
  Sparkling: '#e8d9a0',
  Sweet: '#c9a66b',
  Fortified: '#9c4a2c',
};

export const styleLabel = (w: Wine) => STYLE_LABELS[w.style ?? ''] ?? w.style ?? '';
export const styleTone = (w: Wine) => STYLE_TONES[w.style ?? ''] ?? 'var(--amber)';

/** "2024" → "Årgang 2024", "10 år" → "10 år", empty → null */
export function vintageLabel(w: Wine): string | null {
  if (!w.vintage) return null;
  return /^\d{4}$/.test(w.vintage) ? `Årgang ${w.vintage}` : w.vintage;
}

export const kr = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK' });
