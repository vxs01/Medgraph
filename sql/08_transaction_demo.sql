-- Transactions and concurrency control. MANUAL demo: open two psql sessions (A and B)
-- and run the steps in order. `npm run demo:concurrency` automates the same experiments.
-- Setup: pick any medication:  SELECT med_id, stock_quantity FROM medications LIMIT 1;

-- ============ 1. Atomicity: all or nothing
-- A: BEGIN;
-- A: UPDATE medications SET stock_quantity = stock_quantity - 5 WHERE med_name = 'Aspirin 75mg';
-- A: ROLLBACK;                                  -- the change disappears

-- ============ 2. SAVEPOINT: undo part of a transaction
-- A: BEGIN;
-- A: INSERT INTO medications(med_name, stock_quantity, unit_price) VALUES ('Temp 1', 5, 1);
-- A: SAVEPOINT s1;
-- A: INSERT INTO medications(med_name, stock_quantity, unit_price) VALUES ('Temp 2', -1, 1);  -- fails (CHECK)
-- A: ROLLBACK TO SAVEPOINT s1;                  -- transaction is usable again; Temp 1 is still pending
-- A: COMMIT;                                    -- only Temp 1 is saved
-- (cleanup) DELETE FROM medications WHERE med_name LIKE 'Temp %';

-- ============ 3. Lost update at READ COMMITTED (the default) when you do NOT lock
-- A: BEGIN;  SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg';     -- say 450
-- B: BEGIN;  SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg';     -- 450
-- A: UPDATE medications SET stock_quantity = 450 - 10 WHERE med_name = 'Aspirin 75mg';  COMMIT;
-- B: UPDATE medications SET stock_quantity = 450 - 10 WHERE med_name = 'Aspirin 75mg';  COMMIT;
--    Two doctors each took 10 but stock only fell by 10: A's update was lost.
-- Fix: lock the row when you read it.
-- A: BEGIN;  SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg' FOR UPDATE;
-- B: BEGIN;  SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg' FOR UPDATE;   -- waits
-- A: UPDATE ... ; COMMIT;                        -- B now unblocks and reads the new value

-- ============ 4. Isolation levels
-- A: BEGIN ISOLATION LEVEL READ COMMITTED;  SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg';
-- B: UPDATE medications SET stock_quantity = stock_quantity - 1 WHERE med_name = 'Aspirin 75mg';   (autocommit)
-- A: SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg';   -- changed: non-repeatable read
-- A: COMMIT;
-- A: BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT stock_quantity FROM medications WHERE med_name = 'Aspirin 75mg';
-- B: UPDATE medications SET stock_quantity = stock_quantity - 1 WHERE med_name = 'Aspirin 75mg';
-- A: SELECT stock_quantity ...;                  -- unchanged: A works from a snapshot
-- A: UPDATE medications SET stock_quantity = stock_quantity - 1 WHERE med_name = 'Aspirin 75mg';
--    ERROR: could not serialize access due to concurrent update (40001) -> ROLLBACK and retry

-- ============ 5. Deadlock
-- A: BEGIN; SELECT * FROM wards WHERE ward_name = 'General Ward' FOR UPDATE;
-- B: BEGIN; SELECT * FROM wards WHERE ward_name = 'ICU' FOR UPDATE;
-- A: SELECT * FROM wards WHERE ward_name = 'ICU' FOR UPDATE;            -- waits for B
-- B: SELECT * FROM wards WHERE ward_name = 'General Ward' FOR UPDATE;   -- ERROR: deadlock detected (40P01)
--    PostgreSQL aborts one transaction; the other continues.
--    Prevention used by transfer_patient(): always lock rows in the same order (ORDER BY ward_id).

-- ============ 6. Non-blocking queue style locking
-- SELECT * FROM wards ORDER BY ward_name FOR UPDATE SKIP LOCKED LIMIT 1;   -- skips rows another session holds
-- SELECT * FROM wards WHERE ward_name = 'ICU' FOR UPDATE NOWAIT;           -- errors instead of waiting
