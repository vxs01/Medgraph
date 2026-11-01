// Text -> 384-dim embedding using all-MiniLM-L6-v2 (runs locally, no API key).
// The model (~25 MB) is downloaded on first use and cached.
let extractorPromise;

export async function embed(text) {
  if (!extractorPromise) {
    extractorPromise = import('@huggingface/transformers').then(({ pipeline }) =>
      pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    );
  }
  const extractor = await extractorPromise;
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

// pgvector accepts '[0.1,0.2,...]' text, cast with ::vector
export const toVector = (arr) => '[' + arr.join(',') + ']';
