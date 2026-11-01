// Builds the SQL for similar-case search. Every user value goes through a numbered parameter.
//   semantic : vector similarity (cosine)           keyword : PostgreSQL full-text search
//   hybrid   : both, merged with Reciprocal Rank Fusion    like : "more like this note"
// All modes accept relational filters on the patient (age, gender, currently admitted, date).

const COLUMNS = `n.note_id, n.patient_id, p.first_name || ' ' || p.last_name AS patient_name,
  patient_age(p.dob) AS age, p.gender, n.chief_complaint, n.observation_text, n.created_at`;

export function buildSearch({ mode, vector, text, likeId, k, filters = {} }) {
  const params = [];
  const p = (value) => (params.push(value), `$${params.length}`);

  const where = ['TRUE'];
  if (filters.minAge != null) where.push(`patient_age(p.dob) >= ${p(filters.minAge)}`);
  if (filters.maxAge != null) where.push(`patient_age(p.dob) <= ${p(filters.maxAge)}`);
  if (filters.gender) where.push(`p.gender = ${p(filters.gender)}`);
  if (filters.since) where.push(`n.created_at >= ${p(filters.since)}::date`);
  if (filters.admittedOnly)
    where.push(`EXISTS (SELECT 1 FROM admissions a WHERE a.patient_id = p.patient_id AND a.status = 'ADMITTED')`);
  const filterSql = where.join(' AND ');

  let sql;
  if (likeId) {
    const id = p(likeId);
    sql = `SELECT ${COLUMNS}, ROUND((1 - (n.embedding <=> src.embedding))::numeric, 3) AS score
           FROM clinical_notes src
           JOIN clinical_notes n ON n.note_id <> src.note_id
           JOIN patients p ON p.patient_id = n.patient_id
           WHERE src.note_id = ${id} AND n.embedding IS NOT NULL AND ${filterSql}
           ORDER BY n.embedding <=> src.embedding LIMIT ${p(k)}`;
  } else if (mode === 'semantic') {
    const v = p(vector);
    sql = `SELECT ${COLUMNS}, ROUND((1 - (n.embedding <=> ${v}::vector))::numeric, 3) AS score
           FROM clinical_notes n JOIN patients p ON p.patient_id = n.patient_id
           WHERE n.embedding IS NOT NULL AND ${filterSql}
           ORDER BY n.embedding <=> ${v}::vector LIMIT ${p(k)}`;
  } else if (mode === 'keyword') {
    const t = p(text);
    sql = `WITH q AS (SELECT websearch_to_tsquery('english', ${t}) AS tsq)
           SELECT ${COLUMNS}, ROUND(ts_rank(n.search_tsv, q.tsq)::numeric, 3) AS score,
                  ts_headline('english', n.observation_text, q.tsq,
                              'StartSel=[[, StopSel=]], MaxWords=40, MinWords=15') AS excerpt
           FROM q, clinical_notes n JOIN patients p ON p.patient_id = n.patient_id
           WHERE n.search_tsv @@ q.tsq AND ${filterSql}
           ORDER BY score DESC LIMIT ${p(k)}`;
  } else {
    // hybrid: rank by meaning and by keyword separately, then add 1/(60 + rank) from each list
    const v = p(vector);
    const t = p(text);
    sql = `WITH q AS (SELECT websearch_to_tsquery('english', ${t}) AS tsq),
                sem AS (
                  SELECT n.note_id, ROW_NUMBER() OVER (ORDER BY n.embedding <=> ${v}::vector) AS r
                  FROM clinical_notes n JOIN patients p ON p.patient_id = n.patient_id
                  WHERE n.embedding IS NOT NULL AND ${filterSql}
                  ORDER BY n.embedding <=> ${v}::vector LIMIT 20),
                kw AS (
                  SELECT n.note_id, ROW_NUMBER() OVER (ORDER BY ts_rank(n.search_tsv, q.tsq) DESC) AS r
                  FROM q, clinical_notes n JOIN patients p ON p.patient_id = n.patient_id
                  WHERE n.search_tsv @@ q.tsq AND ${filterSql}
                  ORDER BY ts_rank(n.search_tsv, q.tsq) DESC LIMIT 20)
           SELECT ${COLUMNS},
                  ROUND(((COALESCE(1.0 / (60 + sem.r), 0) + COALESCE(1.0 / (60 + kw.r), 0)) * 1000)::numeric, 1) AS score,
                  sem.r AS semantic_rank, kw.r AS keyword_rank
           FROM sem FULL OUTER JOIN kw ON kw.note_id = sem.note_id
           JOIN clinical_notes n ON n.note_id = COALESCE(sem.note_id, kw.note_id)
           JOIN patients p ON p.patient_id = n.patient_id
           ORDER BY score DESC LIMIT ${p(k)}`;
  }
  return { sql, params };
}

// "chest pain at night" -> "chest or pain or at or night": any matching word counts in hybrid mode
export const orQuery = (text) =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w !== 'or').join(' or ');
