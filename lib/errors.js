import { NextResponse } from 'next/server';

// Messages for named constraints (sql/01_schema.sql), so people see a rule, not a SQL error.
const CONSTRAINT = {
  chk_patients_first_name: 'First name cannot be blank.',
  chk_patients_last_name: 'Last name cannot be blank.',
  chk_patients_dob: 'Date of birth must be after 1900.',
  chk_patients_gender: 'Choose M, F or O for gender.',
  chk_patients_blood_group: 'Choose a valid blood group.',
  chk_patients_phone: 'Phone number must be 7 to 20 characters: digits, spaces, + or -.',
  chk_patients_emergency: 'Emergency contact must be 7 to 20 characters: digits, spaces, + or -.',
  chk_medications_stock: 'Stock cannot be negative.',
  chk_medications_price: 'Price must be greater than zero.',
  chk_rx_dosage: 'Dosage cannot be blank.',
  chk_rx_quantity: 'Quantity must be at least 1.',
  chk_rx_quantity_max: 'Quantity cannot be more than 1000.',
  chk_notes_complaint: 'Chief complaint cannot be blank.',
  chk_notes_observation: 'Observations cannot be blank.',
  chk_wards_occupied_within_capacity: 'That ward has no free beds.',
  uq_one_active_admission: 'This patient is already admitted.',
  uq_medications_name: 'A medication with that name already exists.',
};
const SQLSTATE = {
  '23505': 'That value already exists.',
  '23503': 'A record this refers to does not exist.',
  '23514': 'The database rejected this value.',
  '23502': 'A required field is missing.',
  '22P02': 'A value has the wrong format.',
  '22007': 'That is not a valid date.',
  '22001': 'A value is too long.',
};
// Our own business-rule codes (sql/03_functions_triggers.sql) carry a readable message already.
const BUSINESS_STATUS = { MG001: 409, MG002: 400, MG003: 404, MG004: 409, MG005: 400 };

export function dbError(e) {
  if (e?.code && BUSINESS_STATUS[e.code]) {
    return NextResponse.json({ error: e.message }, { status: BUSINESS_STATUS[e.code] });
  }
  const message = CONSTRAINT[e?.constraint] || SQLSTATE[e?.code];
  if (message) return NextResponse.json({ error: message }, { status: e.code === '23505' ? 409 : 400 });
  console.error(e);
  return NextResponse.json({ error: 'Something went wrong on the server.' }, { status: 500 });
}
